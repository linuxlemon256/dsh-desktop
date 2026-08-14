<div align="center">

# dsh-desktop

**A lightweight desktop client for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).**

`dsh-desktop` wraps the `dsh web` server — DeepSeek Harness's browser UI — in a
native Electron window. It boots the server if it isn't running, waits until it
is healthy, and opens the UI. No terminal, no manual `dsh web`, no hardcoded paths.

[English](README.md) | [中文](README.zh-CN.md)

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Electron-43+-47848F.svg)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

</div>

---

## Why?

DeepSeek Harness ships as a CLI whose UI is opened with `dsh web` in a browser.
If you prefer a real desktop app — double-click to launch, a taskbar entry, and
a server that is automatically cleaned up when you close the window — this is
the missing piece.

## Features

- **One-click launch** — starts the `dsh web` server automatically when it is not running
- **Reuses an existing server** — if `dsh web` is already up, the app simply connects to it and never kills it on exit
- **No hardcoded paths** — the `dsh` CLI is resolved from your `PATH`
- **Clean lifecycle** — the spawned server's process tree is terminated when the app exits
- **Single-instance guard** — launching the app twice focuses the existing window instead of starting a second server
- **Configurable port** — override with the `DSH_PORT` environment variable (default `3080`)
- **Cross-platform** — Windows / macOS / Linux

## Requirements

- [Node.js](https://nodejs.org/) >= 20
- The `dsh` CLI installed globally:

```sh
npm install -g @deepseek-ai/dsh
```

## Getting started

```sh
git clone https://github.com/linuxlemon256/dsh-desktop.git
cd dsh-desktop
npm install
npm start
```

## Configuration

| Environment variable | Default | Description |
| --- | --- | --- |
| `DSH_PORT` | `3080` | TCP port of the `dsh web` server |

## Building installers

```sh
npm run build:win     # NSIS installer + portable .exe (Windows)
npm run build:mac     # DMG (macOS)
npm run build:linux   # AppImage (Linux)
```

Output goes to `dist/`.

## How it works

1. On startup, the app probes `http://127.0.0.1:3080` for a running `dsh web` server.
2. If nothing responds within 1.5s, it resolves `dsh` from `PATH` and spawns `dsh web` as a child process.
3. It polls the port until the server is healthy (60s timeout) and loads the UI in an Electron window.
4. When the window is closed, the child process tree is terminated — **only if** this app started it. An externally running server is left untouched.

See [docs/deepseek-harness-integration.md](docs/deepseek-harness-integration.md)
for the full architecture and how this project is derived from DeepSeek Harness.

## Project structure

```
dsh-desktop/
├── .github/               # Issue & PR templates
├── docs/                  # DeepSeek Harness integration docs (二次开发说明)
├── main.js                # Electron main process (the whole app)
├── package.json
├── LICENSE                # MIT
└── THIRD_PARTY_NOTICES.md # Upstream license attribution
```

## Roadmap

- [ ] App icon and installer branding
- [ ] Auto-restart `dsh web` when it crashes while the window is open
- [ ] Settings UI (port, auto-start)
- [ ] CI build pipeline (GitHub Actions) for all three platforms

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first,
and check [SECURITY.md](SECURITY.md) before reporting a vulnerability.

## License

MIT — see [LICENSE](LICENSE).

This project is a secondary development of
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(MIT, © 2026 DeepSeek). Attribution details in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
