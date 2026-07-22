# Security

This TOTP generator is **fully client-side**. Secrets and vault data stay in your browser (`localStorage`).

## Recommendations

- Prefer opening a trusted copy (your clone or GitHub Pages deployment you control).
- Avoid putting secrets in shared query strings; prefer `#/` fragments when sharing with yourself.
- Vault export JSON contains secrets — treat it like a password file.
- This tool is a recovery aid, not a full replacement for a hardened authenticator app.

## Reporting issues

Open a GitHub issue on this repository for security-sensitive documentation fixes. Do not paste live production secrets into issues.
