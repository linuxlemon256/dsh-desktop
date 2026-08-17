# Third-party notices

This project is a **secondary development (二次开发)** built on top of
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The original
project's license requires that its copyright and license notices are preserved.

## DeepSeek Harness

- Homepage: https://github.com/deepseek-ai/deepseek-harness
- Components used:
  - `@deepseek-ai/dsh` (the `dsh` CLI) — launched as a child process by this app
  - `dsh web` profile — the browser UI rendered inside the Electron window
- License: MIT

---

### MIT License — Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Runtime / build dependencies

| Package | License | Used for |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | MIT | Desktop runtime (Chromium + Node.js) |
| [electron-builder](https://www.electron.build/) | MIT | Packaging installers for Windows / macOS / Linux |
| [Node.js](https://nodejs.org/) | MIT | Bundled portable runtime that runs the bundled `dsh` CLI (zero-dependency installers) |
| [pnpm](https://pnpm.io/) | MIT | Bundled package manager used by the `dsh` plugin auto-installer |
| `@deepseek-ai/dsh` | MIT | Bundled DeepSeek Harness CLI (see section above) |

See `package.json` for exact versions.
