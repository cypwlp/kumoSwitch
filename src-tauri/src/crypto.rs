//! API keys are never written to disk as plaintext.
//!
//! Windows protects each key directly with DPAPI. macOS and Linux keep one
//! random master key in Keychain / Secret Service and encrypt provider keys with
//! AES-256-GCM before they enter `providers.json`.

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::Foundation::{LocalFree, HLOCAL};
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x01;

    fn run(protect: bool, data: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let input = CRYPT_INTEGER_BLOB {
                cbData: data.len() as u32,
                pbData: data.as_ptr() as *mut u8,
            };
            let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
            let ok = if protect {
                CryptProtectData(
                    &input,
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            } else {
                CryptUnprotectData(
                    &input,
                    std::ptr::null_mut(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            };
            if ok == 0 || output.pbData.is_null() {
                return Err(if protect { "DPAPI 加密失敗" } else { "DPAPI 解密失敗" }.to_string());
            }
            let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            LocalFree(output.pbData as HLOCAL);
            Ok(bytes)
        }
    }

    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        run(true, data)
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        run(false, data)
    }

    pub fn available() -> bool {
        true
    }

    pub fn label() -> &'static str {
        "Windows DPAPI"
    }
}

#[cfg(not(windows))]
mod imp {
    use aes_gcm::aead::{rand_core::RngCore, Aead, KeyInit, OsRng};
    use aes_gcm::{Aes256Gcm, Nonce};
    use std::sync::Mutex;

    const SERVICE: &str = "io.github.cypwlp.switchtower";
    const MASTER_ACCOUNT: &str = "master-key-v1";
    const KEY_BYTES: usize = 32;
    const NONCE_BYTES: usize = 12;
    const ENC_PREFIX: &str = "tower:v1:";

    static MASTER: Mutex<Option<[u8; KEY_BYTES]>> = Mutex::new(None);

    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, MASTER_ACCOUNT)
            .map_err(|error| format!("無法連線到系統金鑰庫：{error}"))
    }

    fn load_or_create_master() -> Result<[u8; KEY_BYTES], String> {
        let entry = entry()?;
        match entry.get_password() {
            Ok(encoded) => {
                let bytes = super::from_hex(&encoded)
                    .ok_or_else(|| "系統金鑰庫中的主金鑰格式無效".to_string())?;
                if bytes.len() != KEY_BYTES {
                    return Err("系統金鑰庫中的主金鑰長度無效".to_string());
                }
                let mut key = [0u8; KEY_BYTES];
                key.copy_from_slice(&bytes);
                Ok(key)
            }
            Err(keyring::Error::NoEntry) => {
                let mut key = [0u8; KEY_BYTES];
                OsRng.fill_bytes(&mut key);
                entry
                    .set_password(&super::to_hex(&key))
                    .map_err(|error| format!("無法建立系統主金鑰：{error}"))?;
                Ok(key)
            }
            Err(error) => Err(format!("無法讀取系統主金鑰：{error}")),
        }
    }

    fn master_key() -> Result<[u8; KEY_BYTES], String> {
        let mut cached = MASTER
            .lock()
            .map_err(|_| "系統金鑰庫鎖定狀態異常".to_string())?;
        if let Some(key) = *cached {
            return Ok(key);
        }
        let key = load_or_create_master()?;
        *cached = Some(key);
        Ok(key)
    }

    pub(super) fn protect_with_key(key: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|_| "無法初始化 AES-256-GCM".to_string())?;
        let mut nonce = [0u8; NONCE_BYTES];
        OsRng.fill_bytes(&mut nonce);
        let encrypted = cipher
            .encrypt(Nonce::from_slice(&nonce), data)
            .map_err(|_| "API Key 加密失敗".to_string())?;
        let mut payload = Vec::with_capacity(NONCE_BYTES + encrypted.len());
        payload.extend_from_slice(&nonce);
        payload.extend_from_slice(&encrypted);
        Ok(payload)
    }

    pub(super) fn unprotect_with_key(key: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
        if data.len() <= NONCE_BYTES {
            return Err("加密的 API Key 長度無效".to_string());
        }
        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|_| "無法初始化 AES-256-GCM".to_string())?;
        cipher
            .decrypt(Nonce::from_slice(&data[..NONCE_BYTES]), &data[NONCE_BYTES..])
            .map_err(|_| "API Key 解密失敗（金鑰庫內容可能已變更）".to_string())
    }

    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        protect_with_key(&master_key()?, data)
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        unprotect_with_key(&master_key()?, data)
    }

    pub fn available() -> bool {
        keyring::Entry::store_status().is_ok()
    }

    pub fn label() -> &'static str {
        if cfg!(target_os = "macos") {
            "macOS Keychain + AES-256-GCM"
        } else {
            "Secret Service + AES-256-GCM"
        }
    }

    pub fn tagged(payload: &[u8]) -> String {
        format!("{ENC_PREFIX}{}", super::to_hex(payload))
    }

    pub fn untag(sealed: &str) -> Option<&str> {
        sealed.strip_prefix(ENC_PREFIX)
    }
}

fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn from_hex(text: &str) -> Option<Vec<u8>> {
    if text.len() % 2 != 0 {
        return None;
    }
    (0..text.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&text[index..index + 2], 16).ok())
        .collect()
}

#[cfg(windows)]
pub fn seal(plain: &str) -> Result<String, String> {
    if plain.is_empty() {
        return Ok(String::new());
    }
    imp::protect(plain.as_bytes()).map(|bytes| to_hex(&bytes))
}

#[cfg(not(windows))]
pub fn seal(plain: &str) -> Result<String, String> {
    if plain.is_empty() {
        return Ok(String::new());
    }
    if !available() {
        return Err(format!("{} 目前不可用", imp::label()));
    }
    imp::protect(plain.as_bytes()).map(|bytes| imp::tagged(&bytes))
}

#[cfg(windows)]
pub fn open(sealed: &str) -> Result<String, String> {
    if sealed.is_empty() {
        return Ok(String::new());
    }
    let bytes = from_hex(sealed).ok_or_else(|| "加密的 API Key 格式無效".to_string())?;
    let plain = imp::unprotect(&bytes)?;
    String::from_utf8(plain).map_err(|_| "解密後的 API Key 不是有效文字".to_string())
}

#[cfg(not(windows))]
pub fn open(sealed: &str) -> Result<String, String> {
    if sealed.is_empty() {
        return Ok(String::new());
    }
    let encoded = imp::untag(sealed)
        .ok_or_else(|| "此平台的舊金鑰格式無法讀取".to_string())?;
    let bytes = from_hex(encoded).ok_or_else(|| "加密的 API Key 格式無效".to_string())?;
    let plain = imp::unprotect(&bytes)?;
    String::from_utf8(plain).map_err(|_| "解密後的 API Key 不是有效文字".to_string())
}

pub fn available() -> bool {
    imp::available()
}

pub fn label() -> &'static str {
    imp::label()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_roundtrip() {
        let bytes = [0u8, 1, 15, 16, 255];
        assert_eq!(from_hex(&to_hex(&bytes)).unwrap(), bytes);
        assert!(from_hex("abc").is_none());
    }

    #[test]
    fn empty_values_pass_through() {
        assert_eq!(seal("").unwrap(), "");
        assert_eq!(open("").unwrap(), "");
    }

    #[cfg(not(windows))]
    #[test]
    fn aes_gcm_roundtrip_rejects_tampering() {
        let key = [7u8; 32];
        let sealed = imp::protect_with_key(&key, b"sk-test-12345").unwrap();
        assert_eq!(imp::unprotect_with_key(&key, &sealed).unwrap(), b"sk-test-12345".to_vec());
        let mut tampered = sealed;
        *tampered.last_mut().unwrap() ^= 1;
        assert!(imp::unprotect_with_key(&key, &tampered).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn dpapi_roundtrip() {
        let secret = "sk-test-12345";
        let sealed = seal(secret).expect("DPAPI 應該可用");
        assert_ne!(sealed, secret);
        assert!(!sealed.contains(secret));
        assert_eq!(open(&sealed).unwrap(), secret);
    }
}
