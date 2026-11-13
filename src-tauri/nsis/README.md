# kumoSwitch NSIS theme

This folder contains the Windows installer branding used by Tauri's NSIS bundler.

- `installer.nsi` is a branded copy of Tauri's NSIS template. Keep the Tauri-specific
  sections in sync when upgrading the Tauri CLI major version.
- `header.bmp` and `header-uninstall.bmp` are the 150 × 57 page header images.
- `sidebar.bmp` is the 164 × 314 welcome/finish image.
- `languages/*.nsh` contain Tauri's installer strings and the kumoSwitch welcome text.

Build locally with:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npx tauri build --bundles nsis
```