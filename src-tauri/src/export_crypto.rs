use aes_gcm::aead::{rand_core::RngCore, Aead, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use serde::{Deserialize, Serialize};

const FORMAT: &str = "kumoswitch-export";
const VERSION: u8 = 1;
const SALT_BYTES: usize = 16;
const NONCE_BYTES: usize = 12;
const KEY_BYTES: usize = 32;
const KDF_MEMORY_KIB: u32 = 64 * 1024;
const KDF_ITERATIONS: u32 = 3;
const KDF_PARALLELISM: u32 = 2;
const AAD: &[u8] = b"kumoswitch-export-v1";

#[derive(Serialize, Deserialize)]
struct Envelope {
    format: String,
    version: u8,
    kdf: String,
    cipher: String,
    salt: String,
    nonce: String,
    ciphertext: String,
}

fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn from_hex(text: &str) -> Option<Vec<u8>> {
    let bytes = text.as_bytes();
    if bytes.len() % 2 != 0 {
        return None;
    }
    bytes
        .chunks_exact(2)
        .map(|pair| Some(hex_nibble(pair[0])? * 16 + hex_nibble(pair[1])?))
        .collect()
}

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; KEY_BYTES], String> {
    let params = Params::new(
        KDF_MEMORY_KIB,
        KDF_ITERATIONS,
        KDF_PARALLELISM,
        Some(KEY_BYTES),
    )
    .map_err(|error| format!("無效的備份金鑰參數：{error}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; KEY_BYTES];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|error| format!("無法派生備份金鑰：{error}"))?;
    Ok(key)
}

pub fn encrypt(password: &str, plaintext: &str) -> Result<String, String> {
    if password.chars().count() < 8 {
        return Err("備份密碼至少需要 8 個字元".into());
    }
    let mut salt = [0u8; SALT_BYTES];
    let mut nonce = [0u8; NONCE_BYTES];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);

    let mut key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| "無法初始化備份加密".to_string())?;
    key.fill(0);
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload { msg: plaintext.as_bytes(), aad: AAD },
        )
        .map_err(|_| "加密備份失敗".to_string())?;

    let envelope = Envelope {
        format: FORMAT.into(),
        version: VERSION,
        kdf: "argon2id".into(),
        cipher: "aes-256-gcm".into(),
        salt: to_hex(&salt),
        nonce: to_hex(&nonce),
        ciphertext: to_hex(&ciphertext),
    };
    serde_json::to_string_pretty(&envelope).map_err(|error| error.to_string())
}

pub fn decrypt(password: &str, serialized: &str) -> Result<String, String> {
    let envelope: Envelope =
        serde_json::from_str(serialized).map_err(|_| "不是有效的 kumoSwitch 加密備份".to_string())?;
    if envelope.format != FORMAT || envelope.version != VERSION {
        return Err("不支援的備份格式或版本".into());
    }
    if envelope.kdf != "argon2id" || envelope.cipher != "aes-256-gcm" {
        return Err("不支援的備份加密演算法".into());
    }
    if envelope.salt.len() != SALT_BYTES * 2 || envelope.nonce.len() != NONCE_BYTES * 2 {
        return Err("備份參數長度錯誤".into());
    }
    if envelope.ciphertext.len() < 16 * 2 {
        return Err("備份 ciphertext 長度錯誤".into());
    }
    let salt = from_hex(&envelope.salt).ok_or_else(|| "備份 salt 格式錯誤".to_string())?;
    let nonce = from_hex(&envelope.nonce).ok_or_else(|| "備份 nonce 格式錯誤".to_string())?;
    let ciphertext = from_hex(&envelope.ciphertext)
        .ok_or_else(|| "備份 ciphertext 格式錯誤".to_string())?;

    let mut key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| "無法初始化備份解密".to_string())?;
    key.fill(0);
    let plaintext = cipher
        .decrypt(
            Nonce::from_slice(&nonce),
            Payload { msg: &ciphertext, aad: AAD },
        )
        .map_err(|_| "密碼錯誤或備份檔案已損毀".to_string())?;
    String::from_utf8(plaintext).map_err(|_| "備份內容不是有效文字".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypted_export_roundtrip_hides_plaintext() {
        let plain = r#"{"providers":{"codex":[{"api_key":"sk-secret"}]}}"#;
        let sealed = encrypt("correct horse battery", plain).unwrap();
        assert!(!sealed.contains("sk-secret"));
        assert_eq!(decrypt("correct horse battery", &sealed).unwrap(), plain);
    }

    #[test]
    fn wrong_password_is_rejected() {
        let sealed = encrypt("correct horse battery", "secret").unwrap();
        assert!(decrypt("wrong password", &sealed).is_err());
    }

    #[test]
    fn short_password_is_rejected() {
        assert!(encrypt("short", "data").is_err());
    }

    #[test]
    fn malformed_envelope_is_rejected() {
        assert!(decrypt("anything", "not json").is_err());
        assert!(from_hex("€a").is_none());
    }
}