# TOTP Generator

**Generate TOTP one-time codes entirely in your browser — offline, private, no server.**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-themrtramble%2Ftotp-generator-181717?logo=github)](https://github.com/themrtramble/totp-generator)

A modern, client-side **time-based one-time password (TOTP)** generator. Paste a Base32 secret and get authenticator codes instantly — nothing is sent to any server.

Useful when you lose access to your phone or authenticator app but still have the secret key.

---

## Features

- Fully offline — runs 100% in the browser
- Smooth countdown ring + digit tiles with flip animation
- Tap code or button to copy
- Paste `otpauth://totp/...` URIs (auto-imports secret + settings)
- Export `otpauth://` URI and private share links (`#` fragment)
- Previous / next period codes for clock-skew recovery
- Local preferences (secret + settings) via `localStorage`
- Keyboard shortcuts: `c` copy · `s` share · `p` adjacent · `/` focus secret · `Ctrl+Enter` copy
- Tab visibility pause (saves CPU when backgrounded)
- Advanced options:
  - Digits: 6 / 7 / 8
  - Period: 15s / 30s / 60s / 90s
  - Algorithm: SHA-1, SHA-256, SHA-512
- Secret show/hide, clean, and clear controls
- URL parameters for key, digits, period, and algorithm
- Clean dark glass UI

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

### Option B — local server (recommended)

```bash
# Python
cd public && python -m http.server 8080

# Node
npx serve public
```

Then visit `http://localhost:8080`.

---

## Usage

1. Enter your **Base32 secret key** (from your authenticator setup / backup).
2. The current TOTP code appears in the digit tiles.
3. Copy the code (tap the digits or **Copy code**).
4. Optionally open **Advanced options** to change digits, period, or algorithm.

> **Privacy:** Your secret never leaves your device. Generation is done locally with [otpauth](https://github.com/hectorm/otpauth).

---

## URL parameters

You can pre-fill settings via the URL.

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
│   ├── index.html          # App shell
│   ├── css/
│   │   └── app.css         # Modern UI styles
│   ├── js/
│   │   ├── app.js          # Vue app + TOTP logic
│   │   └── assets/         # Vue, otpauth, clipboard
│   ├── img/
│   └── favicon.ico
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

No bundler, no npm install — static files only.

---

## Security notes

- Prefer opening the app from a trusted local copy or your own host.
- Avoid putting secrets in shared URLs (browser history, screenshots, logs).
- Fragment (`#/key`) is not sent to servers on navigation; query `?key=` may appear in logs — prefer fragment when possible.
- This tool does not replace a proper authenticator app for everyday use.

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
