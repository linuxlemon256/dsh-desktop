# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-08-14

### Added

- Electron desktop wrapper for DeepSeek Harness (`dsh web`).
- Automatic detection of an already-running `dsh web` server on port `3080`
  (attach without killing it on exit).
- Automatic startup of `dsh web` from `PATH` when the server is not running.
- Port health probing with a 60-second startup timeout.
- Graceful process-tree cleanup of the spawned server on exit
  (`taskkill /T` on Windows, `SIGTERM` on POSIX).
- Single-instance lock (second launch focuses the existing window).
- `DSH_PORT` environment variable to override the default port.
- Cross-platform packaging config (Windows NSIS/portable, macOS DMG, Linux AppImage).
- Open-source scaffolding: MIT `LICENSE`, `README.md` / `README.zh-CN.md`,
  `THIRD_PARTY_NOTICES.md` (upstream attribution), `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, GitHub issue & PR templates,
  and `docs/deepseek-harness-integration.md` (secondary-development documentation).
