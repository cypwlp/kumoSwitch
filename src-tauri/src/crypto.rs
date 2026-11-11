//! API keys are protected with Windows DPAPI so the on-disk provider list is not
//! a plaintext credential dump. On other platforms we fall back to plaintext and
//! report that honestly through `app_info`.

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::Foundation::{LocalFree, HLOCAL};
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x01;

    fn run(protect: bool, data: &[u8]) -> Option<Vec<u8>> {
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
                return None;
            }
            let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            LocalFree(output.pbData as HLOCAL);
            Some(bytes)
        }
    }

    pub fn protect(data: &[u8]) -> Option<Vec<u8>> {
        run(true, data)
    }

    pub fn unprotect(data: &[u8]) -> Option<Vec<u8>> {
        run(false, data)
    }

    pub fn available() -> bool {
        true
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn protect(_data: &[u8]) -> Option<Vec<u8>> {
        None
    }
    pub fn unprotect(_data: &[u8]) -> Option<Vec<u8>> {
        None
    }
    pub fn available() -> bool {
        false
    }
}

pub fn available() -> bool {
    imp::available()
}

fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

fn from_hex(text: &str) -> Option<Vec<u8>> {
    if text.len() % 2 != 0 {
        return None;
    }
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&text[i..i + 2], 16).ok())
        .collect()
}

/// Returns the hex blob to persist, or `None` when protection is unavailable.
pub fn seal(plain: &str) -> Option<String> {
    if plain.is_empty() {
        return Some(String::new());
    }
    imp::protect(plain.as_bytes()).map(|bytes| to_hex(&bytes))
}

pub fn open(sealed: &str) -> Option<String> {
    if sealed.is_empty() {
        return Some(String::new());
    }
    let bytes = from_hex(sealed)?;
    let plain = imp::unprotect(&bytes)?;
    String::from_utf8(plain).ok()
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
