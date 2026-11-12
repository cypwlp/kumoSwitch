use std::fs::{self, OpenOptions};
#[cfg(unix)]
use std::fs::File;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

fn temp_path(path: &Path) -> io::Result<PathBuf> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;
    let name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no file name"))?
        .to_string_lossy();
    Ok(parent.join(format!(
        ".{name}.{}.{}.tmp",
        std::process::id(),
        TEMP_SEQ.fetch_add(1, Ordering::Relaxed)
    )))
}

/// Create a directory only traversable by the current user on Unix.
pub fn ensure_private_dir(path: &Path) -> io::Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

/// Atomically replace a private application file with mode 0600 on Unix.
pub fn write_private(path: &Path, text: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        ensure_private_dir(parent)?;
    }
    write_atomic(path, text, true)
}

/// Atomically replace a user-owned config while preserving its existing mode.
/// New files are created with mode 0600.
pub fn write_preserving(path: &Path, text: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    write_atomic(path, text, false)
}

fn write_atomic(path: &Path, text: &str, private: bool) -> io::Result<()> {
    let tmp = temp_path(path)?;
    let existing_permissions = if private {
        None
    } else {
        fs::metadata(path).ok().map(|metadata| metadata.permissions())
    };

    let result = (|| -> io::Result<()> {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&tmp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        drop(file);

        if let Some(permissions) = existing_permissions {
            fs::set_permissions(&tmp, permissions)?;
        }

        fs::rename(&tmp, path)?;

        #[cfg(unix)]
        if let Some(parent) = path.parent() {
            if let Ok(directory) = File::open(parent) {
                let _ = directory.sync_all();
            }
        }
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "kumoswitch-secure-fs-{tag}-{}-{}",
            std::process::id(),
            TEMP_SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn private_write_is_atomic_and_leaves_no_temp_file() {
        let dir = temp_dir("atomic");
        let file = dir.join("providers.json");
        write_private(&file, "first").unwrap();
        write_private(&file, "second").unwrap();

        assert_eq!(fs::read_to_string(&file).unwrap(), "second");
        let leftovers = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .count();
        assert_eq!(leftovers, 0);
        fs::remove_dir_all(dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn private_write_uses_restrictive_modes() {
        use std::os::unix::fs::PermissionsExt;

        let base = temp_dir("modes");
        let dir = base.join("private");
        let file = dir.join("providers.json");
        write_private(&file, "{}").unwrap();

        assert_eq!(fs::metadata(&dir).unwrap().permissions().mode() & 0o777, 0o700);
        assert_eq!(fs::metadata(&file).unwrap().permissions().mode() & 0o777, 0o600);
        fs::remove_dir_all(base).ok();
    }

    #[cfg(unix)]
    #[test]
    fn preserving_write_keeps_existing_mode() {
        use std::os::unix::fs::PermissionsExt;

        let dir = temp_dir("preserve");
        let file = dir.join("config.toml");
        fs::write(&file, "old").unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o640)).unwrap();
        write_preserving(&file, "new").unwrap();

        assert_eq!(fs::read_to_string(&file).unwrap(), "new");
        assert_eq!(fs::metadata(&file).unwrap().permissions().mode() & 0o777, 0o640);
        fs::remove_dir_all(dir).ok();
    }
}