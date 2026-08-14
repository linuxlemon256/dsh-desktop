# Contributing to dsh-desktop

Thanks for your interest in improving `dsh-desktop`!

## Code of Conduct

By participating in this project you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## How to contribute

### Reporting bugs

Open an issue using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).
Please include:

- OS and versions (`node -v`, `dsh --version` if available)
- Whether `dsh web` was already running before you started the app
- Console output from the app (run `npm start` from a terminal to see it)

### Suggesting features

Open an issue using the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml).

### Submitting code

1. Fork the repository and create a feature branch:
   `git checkout -b feat/your-feature`
2. Make your changes. Keep `main.js` self-contained unless the change genuinely
   requires a new module.
3. Test locally:

   ```sh
   npm install
   npm start
   ```

   The app must start `dsh web` when it is not running, attach when it is,
   and clean up its own child process on exit.
4. Add/update docs if behavior changed (READMEs, `docs/`, `CHANGELOG.md`).
5. Open a pull request using the [PR template](.github/PULL_REQUEST_TEMPLATE.md).

## Development notes

- The whole app lives in `main.js` (Electron main process). Keep the boot
  sequence readable: probe → resolve → spawn → wait → load → cleanup.
- Do not hardcode machine-specific paths. Resolve `dsh` from `PATH`.
- On Windows, npm shims are `*.cmd` files — they must be launched through
  `cmd.exe` (`execFile(process.env.ComSpec, ['/d', '/s', '/c', 'dsh web'])`),
  see `docs/deepseek-harness-integration.md`.
- Commit messages: concise, imperative mood ("Fix ...", "Add ...").
