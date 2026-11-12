# Security Policy

## Supported versions

Security fixes are applied to the latest published `0.8.x` release and `main`.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting:

https://github.com/cypwlp/kumoSwitch/security/advisories/new

Do not include API keys, provider tokens, full config files, or other secrets in a
public issue. A minimal reproduction with placeholder credentials is enough.

## Security model

kumoSwitch is a local desktop application. It has no account system, telemetry, or
cloud sync. Network access is limited to:

- provider connectivity tests requested by the user;
- the optional local reverse proxy forwarding to configured providers;
- GitHub Releases update checks and downloads.

Provider API keys are encrypted at rest with Windows DPAPI, or with AES-256-GCM
using a master key stored in macOS Keychain / Linux Secret Service. On Unix the
application data directory is restricted to the current user.

## In scope

- bypass or corruption of provider-config diff and backup safeguards;
- exposure of API keys or local configuration data;
- unsafe updater signature handling;
- path traversal or arbitrary file write through backup restore;
- request smuggling, credential leakage, or cross-provider failover errors in the
  local proxy;
- privilege escalation through installers or updater artifacts.

The [MIT license](LICENSE) applies to the software. This file describes reporting
expectations, not a bug-bounty program or a warranty.