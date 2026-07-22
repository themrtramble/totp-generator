# Contributing

Thanks for improving TOTP Generator.

## Guidelines

- Keep the app **static** (no required build step).
- Prefer small, focused commits with clear messages.
- Secrets must stay client-side — never log or upload them.
- Test by opening `public/index.html` via a local static server.

## Local check

```bash
cd public && python -m http.server 8080
```
