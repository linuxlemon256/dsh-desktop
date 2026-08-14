# DeepSeek Harness Integration (二次开发说明)

This document explains how `dsh-desktop` relates to the upstream
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) project,
how the integration works, and the design decisions behind it.

## 1. Relationship to upstream

| | Upstream | dsh-desktop |
| --- | --- | --- |
| Project | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | this repository |
| Distributable | `@deepseek-ai/dsh` CLI (npm) | Electron app (source + installers) |
| Role | Agent harness + browser UI (`dsh web`) | Desktop shell around the harness |
| License | MIT (© 2026 DeepSeek) | MIT, derivative work |

`dsh-desktop` does **not** vendor or modify upstream code. It treats the `dsh`
CLI as an external runtime dependency (installed via `npm install -g @deepseek-ai/dsh`)
and talks to it exactly the way a human would in a terminal:

```
dsh web
```

Upstream license obligations are met — see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## 2. Boot sequence

```
app starts
    │
    ├─ probe http://127.0.0.1:<port> (1.5s)
    │     ├─ responds ──► server already running → attach, do NOT kill on exit
    │     └─ no response
    │            ├─ resolve `dsh` from PATH (where / which)
    │            │     └─ not found → error dialog, quit
    │            ├─ spawn `dsh web` (+ `--port <port>` when DSH_PORT is set)
    │            │     (cmd.exe /c on Windows, detached on POSIX)
    │            ├─ poll port until healthy (60s timeout)
    │            │     ├─ dsh crashed mid-startup → abort wait, single error dialog
    │            │     └─ timeout → kill child tree, error dialog, quit
    │            └─ ready
    │
    └─ create BrowserWindow (hidden) → load → show on `ready-to-show`
```

## 2.1 Startup-crash handling

If `dsh web` exits while the startup probe is still polling, the `exit` handler
cancels the wait (`startupAbort`) and records the exit code. `ensureDsh` then
shows exactly one dialog (mentioning the crash code) instead of a second
"timed out" dialog appearing later. After startup completes, an unexpected
`dsh web` exit shows the "stopped" dialog and quits the app.

## 3. Design decisions

### 3.1 No hardcoded paths

The original local version hardcoded an absolute path to `node.exe` and the
global npm `dsh` installation. That worked only on one machine. Now the CLI is
located through `PATH` (`where` on Windows, `which` on POSIX) and spawned by
name. Users are expected to run `npm install -g @deepseek-ai/dsh` first, which
is the officially supported way to install `dsh`.

### 3.2 Windows: npm shims through `cmd.exe`

npm global binaries on Windows are `*.cmd` shim files, which Node cannot execute
directly with `spawn`/`execFile` (`shell: false` → `EINVAL`). Two common
approaches exist:

- `spawn('dsh.cmd', ['web'], { shell: true })` — works, but triggers Node's
  `DEP0190` deprecation warning (args are concatenated, not escaped).
- `execFile(process.env.ComSpec, ['/d', '/s', '/c', 'dsh web'], { windowsHide: true })`
  — the documented pattern; no warning, no flash of a terminal window.

This project uses the second approach on Windows and a plain
`spawn('dsh', ['web'], { detached: true })` on POSIX systems.

### 3.3 Process-tree termination

`dsh web` spawns its own children (workers, plugin processes). Killing only the
immediate PID would leak them:

- Windows — `taskkill /pid <pid> /T /F` kills the whole tree.
- POSIX — the child is spawned in its own process group (`detached: true`),
  so `process.kill(-pid, 'SIGTERM')` signals every process in the group;
  a fallback `proc.kill('SIGTERM')` covers the case where the group leader is
  already gone. `dshProc` is nulled immediately so double-kills are impossible.

### 3.4 Ownership of the server

A port probe decides ownership:

- Server **already up** → attach, and do **not** kill on exit (someone else
  started it — possibly another app instance or a manual `dsh web`).
- Server **started by us** → terminated on exit.

### 3.5 Single instance

`app.requestSingleInstanceLock()` guarantees one app instance per user, so two
instances can never race to spawn two `dsh web` servers on the same port. A
second launch simply focuses the existing window.

### 3.6 Configurable port

The port is read from `DSH_PORT` (default `3080`) at startup and validated
(positive integer below 65536; invalid values fall back with a warning). When
`DSH_PORT` is explicitly set, the spawned command becomes `dsh web --port <port>`
so the server and the probe agree. When it is not set, `dsh web` runs exactly as
a user would run it manually.

## 4. Where to extend

| Concern | File |
| --- | --- |
| Electron app entry / boot sequence | `main.js` |
| Health check & spawn logic | `main.js` (`isServerUp`, `waitForStartup`, `startDsh`, `ensureDsh`) |
| Startup-crash abort | `main.js` (`startupAbort`, `startupCrashCode`) |
| Shutdown / cleanup | `main.js` (`killDsh`, `window-all-closed`, `before-quit`) |
| Load failure handling | `main.js` (`did-fail-load`) |
| Packaging metadata | `package.json` → `build` section |
| Docs | `docs/`, `README.md`, `README.zh-CN.md` |

## 5. Upstream resources

- Repository: <https://github.com/deepseek-ai/deepseek-harness>
- CLI package: [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh)
- Entry modes: `dsh --profile <name>`, `dsh web` (alias of `--profile web`),
  `dsh plugin`, `dsh --profile headless "<job>"`

## 6. License

This document is part of `dsh-desktop` (MIT). Upstream DeepSeek Harness code is
MIT © 2026 DeepSeek — see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
