# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-16

### Added

- Documentation for community UI plugins (file tree / preview / IDE features
  via `@linxin666/dsh-web-ui-all`), including install steps and pnpm build
  approval notes — see `README.md` and `docs/deepseek-harness-integration.md`.

### Fixed

- CI release pipeline: explicitly install the Electron binary (`npm` 11 blocks
  postinstall scripts) and disable electron-builder's implicit publishing
  (`--publish never`; it required `GH_TOKEN`).
- Package metadata: author email specified (required by electron-builder 26).

## [1.0.0] - 2026-08-14

### Added

- Electron desktop wrapper for DeepSeek Harness (`dsh web`).
- Automatic detection of an already-running `dsh web` server on port `3080`
  (attach without killing it on exit).
- Automatic startup of `dsh web` from `PATH` when the server is not running.
- Port health probing with a 60-second startup timeout.
- Graceful process-tree cleanup of the spawned server on exit
  (`taskkill /T` on Windows, `SIGTERM` process group on POSIX).
- Single-instance lock (second launch focuses the existing window).
- `DSH_PORT` environment variable to override the default port (passed to
  `dsh web --port` when set).
- App icon: multi-size `build/icon.ico` (Windows) and `build/icon.png` (Linux)
  generated from the project logo bitmap; wired into the window and installers.
- Cross-platform packaging config (Windows NSIS/portable, macOS DMG, Linux AppImage).
- Open-source scaffolding: MIT `LICENSE`, `README.md` / `README.zh-CN.md`,
  `THIRD_PARTY_NOTICES.md` (upstream attribution), `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, GitHub issue & PR templates,
  and `docs/deepseek-harness-integration.md` (secondary-development documentation).
- `private: true` in `package.json` to prevent accidental `npm publish`.
- GitHub Actions release workflow (`.github/workflows/release.yml`): pushing a
  `v*` tag builds installers on Windows/macOS/Linux and publishes them with
  checksums to a GitHub Release.

### Fixed

- `DSH_PORT` now actually works: the spawned command becomes
  `dsh web --port <port>` so the server and the health probe agree.
- No more double error dialogs when `dsh web` crashes during startup: the
  pending health probe is aborted and a single dialog (with the exit code)
  is shown.
- `did-fail-load` (main frame only) now shows an error dialog instead of a
  silent white window.
- POSIX cleanup kills the whole process group (`detached` + `kill(-pid)`),
  matching the `taskkill /T` behavior on Windows.
- Health probes have a request timeout so a hung server cannot stall startup.
- `DSH_PORT` is validated (positive integer < 65536); invalid values fall
  back to the default with a warning.
- Window is created hidden and shown on `ready-to-show` (no white flash).
- `engines` corrected to `node >= 22.12` (electron-builder 26 requirement);
  `package-lock.json` re-synced.
- Fixed the electron-builder link in `THIRD_PARTY_NOTICES.md`.
