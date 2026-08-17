<div align="center">

# dsh-desktop 🖥️🐋

**The "I just want to double-click it" desktop client for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).**

No terminal. No `dsh web`. No "wait, why isn't Node.js installed?!" —
`dsh-desktop` bundles everything, boots the server for you, and politely
cleans up after itself when you close the window.

[English](README.md) | [中文](README.zh-CN.md)

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Electron-43+-47848F.svg)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

</div>

---

## Why? 🤔

DeepSeek Harness ships as a CLI. Its UI lives behind `dsh web`, which means you
need a terminal, a browser tab, and a few seconds of existential dread about
whether the server is still running somewhere.

If you'd rather **double-click a thing** than type a command — with a taskbar
entry, and a server that disappears when you close the window — this is the
missing piece you've been looking for.

## Features ✨

- **One-click launch** — starts `dsh web` automatically when it's not running
- **Reuses existing servers** — if `dsh web` is already up, it just connects. It never murders servers it didn't start (it's polite like that)
- **Zero dependencies** — Node.js, the `dsh` CLI and `pnpm` are bundled inside the installer. Your machine can stay pristine
- **Clean lifecycle** — the server's process tree is terminated on exit. No zombies, no orphans, no "what's eating my RAM"
- **Single-instance guard** — launching twice just focuses the existing window. No duplicate servers fighting over a port
- **Configurable port** — set `DSH_PORT` (default `3080`) and it does what you say
- **Cross-platform** — Windows / macOS / Linux, take your pick

## Requirements 📦

**The packaged installers need NOTHING.** Node.js, `dsh`, `pnpm` — all bundled.
Install, double-click, done. That's it. Go make a coffee.

Only if you're a source-runner (we see you, tinkerers):

- [Node.js](https://nodejs.org/) >= 22.12
- The `dsh` CLI installed globally:

```sh
npm install -g @deepseek-ai/dsh
```

## Getting started 🚀

```sh
git clone https://github.com/linuxlemon256/dsh-desktop.git
cd dsh-desktop
npm install
npm start
```

## Configuration 🎛️

| Environment variable | Default | Description |
| --- | --- | --- |
| `DSH_PORT` | `3080` | TCP port of the `dsh web` server (passed to `dsh web --port` when set) |
| `DSH_SKIP_PLUGIN_INSTALL` | unset | Set to `1` to skip the automatic IDE workbench installation |

## Extending the UI (community plugins) 🧩

The `dsh web` profile supports third-party plugins that add IDE-like features
to the harness UI. **The app auto-installs the IDE workbench on first launch**
(when the `web` profile lacks it) — clone, start, done. Set
`DSH_SKIP_PLUGIN_INSTALL=1` if you'd rather keep things vanilla. First launch
takes a bit longer while the plugin is installed; that's it spending your
patience budget, spend it well.

### 1. IDE workbench: `dsh-better-sidebar` (recommended, auto-installed) 🛠️

A full workbench inside the harness — no separate IDE needed. Yes, really:

- **File explorer** (lazy-loading directory tree) + **CodeMirror editor**
- **Real terminal** (xterm.js + node-pty)
- **Git panel** with VSCode-style diffs (stage / commit / revert)
- Embedded browser, background task view, split-pane layout

Manual install (equivalent to what the app does, if you enjoy typing):

```sh
dsh plugin --profile web add dsh-better-sidebar
```

See [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) (MIT).

### 2. Explorer + Preview panels: `@linxin666/dsh-web-ui-all`

A one-command install (Apache-2.0) that adds:

- **Explorer panel**: file tree, filename search, git changes (stage/unstage/discard)
- **Preview panel**: multi-tab preview of 10+ formats (markdown, code, pdf, office, images…)
- **Task board**, **git graph**, **skin center**, **live stats**, and more

```sh
npm install -g pnpm
dsh plugin --profile web add @linxin666/dsh-web-ui-all
```

> **pnpm ≥ 11 is a bit paranoid**: it may report `ERR_PNPM_IGNORED_BUILDS`
> (native deps like `ssh2` / `node-pty` are blocked by default). If that
> happens, open `~/.dsh/profiles/web/pnpm-workspace.yaml`, set every
> `allowBuilds` entry to `true`, and run the `dsh plugin ... add` command
> again — it must succeed once (exit code 0) for the plugin to register.

After installing, restart the app and open a **project session** (a session
with a working directory). The panels are shy — they only show up when there's
a project to look at.

## Building installers 🔨

```sh
npm run prepare:resources  # bundle node + dsh + pnpm into resources/ (needed before building)
npm run build:win          # NSIS installer (Windows)
npm run build:mac          # DMG (macOS — requires a macOS machine)
npm run build:linux        # AppImage (Linux — requires a Linux machine)
```

Output goes to `dist/`. For official multi-platform release assets, push a
`v*` tag and the [release workflow](.github/workflows/release.yml) builds all
three platforms on GitHub Actions and attaches the files (plus `SHA256SUMS.txt`)
to the release. CI does the heavy lifting; you do the tagging.

## How it works 🧠

1. On startup, the app probes `http://127.0.0.1:3080` for a running `dsh web` server.
2. If nothing responds within 1.5s, it spawns `dsh web` using its **bundled runtime** (or your `PATH` as a fallback), passing `--port <DSH_PORT>` when configured.
3. It polls the port until the server is healthy (60s timeout) and loads the UI in an Electron window. If the server crashes during startup, the app retries (up to 3 times) and shows one clear error dialog instead of a hung window.
4. When the window is closed, the child process tree is terminated — **only if** this app started it. An externally running server is left untouched.

See [docs/deepseek-harness-integration.md](docs/deepseek-harness-integration.md)
for the full architecture and how this project is derived from DeepSeek Harness.

## Project structure 🗂️

```
dsh-desktop/
├── .github/               # Issue & PR templates
├── docs/                  # DeepSeek Harness integration docs (二次开发说明)
├── scripts/               # prepare-resources.mjs — bundles the runtime
├── src/main.js            # Electron main process (the whole app)
├── package.json
├── LICENSE                # MIT
└── THIRD_PARTY_NOTICES.md # Upstream license attribution
```

## Roadmap 🗺️

- [ ] Auto-restart `dsh web` when it crashes while the window is open
- [ ] Settings UI (port, auto-start)

## Contributing 🤝

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first,
and check [SECURITY.md](SECURITY.md) before reporting a vulnerability.

## License 📄

MIT — see [LICENSE](LICENSE).

This project is a secondary development of
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(MIT, © 2026 DeepSeek). Attribution details in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
