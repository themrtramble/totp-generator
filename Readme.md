# TOTP Generator

**Ultra-modern TOTP one-time codes — fully offline, private, multi-account vault.**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-themrtramble%2Ftotp-generator-181717?logo=github)](https://github.com/themrtramble/totp-generator)

A polished, client-side **time-based one-time password (TOTP)** generator. Paste a Base32 secret (or `otpauth://` URI), save accounts in a local vault, export QR codes, and copy codes instantly — nothing is sent to any server.

Useful when you lose access to your phone or authenticator app but still have the secret key.

---

## Features

### Core
- Fully offline — runs 100% in the browser
- Smooth countdown ring + digit tiles with flip animation
- Tap code or button to copy (with optional haptic feedback)
- Paste / drop `otpauth://totp/...` URIs (auto-imports secret + settings)
- Export `otpauth://` URI, private share links (`#` fragment), and **QR codes**
- Previous / next period codes for clock-skew recovery
- Manual **clock offset** slider (−60s … +60s)
- Advanced options: digits (6/7/8), period (15/30/60/90s), SHA-1/256/512

### Vault & productivity
- **Multi-account vault** with search, pin, color tags, import/export JSON
- Account label + issuer fields
- Recently copied history (session + local prefs)
- Auto-copy when the code refreshes (optional)
- Keyboard shortcuts (`?` for help) including vault save / quick switch `1`–`9`

### Ultra-modern UI
- Glass morphism layout with ambient mesh/grid
- Dark / light / system themes
- Accent palettes: violet, cyan, rose, emerald, amber
- Comfortable / compact density
- Reduce-motion toggle
- Settings + help modals
- Installable **PWA** with offline service worker

### Privacy
- Local preferences + vault via `localStorage` only
- Tab visibility pause (saves CPU when backgrounded)
- Online/offline status badge (codes still work offline)

---

## Quick start

No build step required. Open the app from the `public` folder:

### Option A — open directly

1. Clone the repo:
   ```bash
   git clone https://github.com/themrtramble/totp-generator.git
   cd totp-generator
   ```
2. Open `public/index.html` in your browser.

### Option B — local server (recommended for PWA / clipboard)

```bash
# Python
cd public && python -m http.server 8080

# Node
npx serve public
```

Then visit `http://localhost:8080`.

### Option C — GitHub Pages

If Pages is enabled on the repository, the `public/` folder is deployed automatically via the included workflow.

---

## Usage

1. Enter your **Base32 secret key** (or paste an `otpauth://` URI).
2. Optionally set **Account label** and **Issuer**, then **Save to vault**.
3. Copy the code (tap the digits, **Copy code**, or press `c`).
4. Use **QR** to scan into another authenticator, or **URI** to copy the otpauth link.
5. Open **Settings** for theme, accent, auto-copy, and data tools.

> **Privacy:** Your secret never leaves your device. Generation is done locally with [otpauth](https://github.com/hectorm/otpauth).

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `c` | Copy current code |
| `Ctrl/Cmd+Enter` | Copy current code (works in inputs) |
| `s` | Copy private share link |
| `q` | Show QR code |
| `p` | Toggle adjacent codes |
| `v` | Save current account to vault |
| `b` | Toggle vault panel |
| `/` | Focus secret field |
| `,` | Open settings |
| `?` | Help |
| `1`–`9` | Load vault account by visible index |
| `Esc` | Close modals / blur secret |

---

## URL parameters

### Secret key

URI fragment or query parameter:

```
#/YOUR_SECRET_KEY
?key=YOUR_SECRET_KEY
```

### Digits, period, algorithm

```
?digits=6&period=30&algorithm=SHA1&key=YOUR_SECRET_KEY
```

| Parameter   | Description              | Examples              |
|------------|--------------------------|------------------------|
| `key`      | Base32 secret            | `JBSWY3DPEHPK3PXP`     |
| `digits`   | Code length              | `6`, `7`, `8`          |
| `period`   | Validity window (sec)    | `15`, `30`, `60`, `90` |
| `algorithm`| Hash algorithm           | `SHA1`, `SHA256`, `SHA512` |

Example:

```
public/index.html?digits=6&period=30&algorithm=SHA256&key=JBSWY3DPEHPK3PXP
```

Supported algorithms: see [otpauth docs](https://github.com/hectorm/otpauth#supported-hashing-algorithms).

---

## Project structure

```
totp-generator/
├── public/
│   ├── index.html              # App shell
│   ├── manifest.webmanifest    # PWA manifest
│   ├── sw.js                   # Offline service worker
│   ├── css/
│   │   └── app.css             # Ultra-modern UI styles
│   ├── js/
│   │   ├── app.js              # Vue app + vault + TOTP logic
│   │   └── assets/             # Vue, otpauth, clipboard, QR
│   ├── img/
│   └── favicon.ico
├── CHANGELOG.md
├── SECURITY.md
├── LICENSE
└── README.md
```

---

## Tech stack

| Library | Role |
|---------|------|
| [Vue 3](https://vuejs.org/) | UI reactivity |
| [otpauth](https://github.com/hectorm/otpauth) | TOTP generation |
| [clipboard.js](https://clipboardjs.com/) | One-click copy |
| [qrcodejs](https://github.com/davidshimjs/qrcodejs) | Offline QR rendering |

No bundler, no npm install — static files only.

---

## Security notes

- Prefer opening the app from a trusted local copy or your own host.
- Avoid putting secrets in shared URLs (browser history, screenshots, logs).
- Fragment (`#/key`) is not sent to servers on navigation; query `?key=` may appear in logs — prefer fragment when possible.
- Vault export JSON contains secrets — store it securely.
- This tool does not replace a proper authenticator app for everyday use.

See [SECURITY.md](SECURITY.md) for more.

---

## License

This project is licensed under the **GNU General Public License v3.0** — see [LICENSE](LICENSE).

```
Copyright (C) 2026 MrTramble
```

---

## Author

**MrTramble** · tramble · mrtramble · itsmrtramble

- GitHub: [@themrtramble](https://github.com/themrtramble)
- Repository: [github.com/themrtramble/totp-generator](https://github.com/themrtramble/totp-generator)
