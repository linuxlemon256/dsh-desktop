<div align="center">

# dsh-desktop

**DeepSeek Harness（深度求索 Harness）的轻量桌面客户端。**

`dsh-desktop` 用 Electron 把 `dsh web` 服务（DeepSeek Harness 的浏览器界面）封装成原生桌面应用：服务没启动就自动拉起，等服务就绪后打开界面。不需要终端、不需要手动执行 `dsh web`、没有写死的路径。

[English](README.md) | 中文

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Electron-43+-47848F.svg)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

</div>

---

## 为什么需要它？

DeepSeek Harness 以 CLI 形式分发，界面要靠 `dsh web` 在浏览器里打开。如果你更想要一个真正的桌面应用——双击启动、任务栏图标、关闭窗口时自动清理服务——这个项目就是补上这块缺口的。

## 功能特性

- **一键启动** —— `dsh web` 服务没在运行时自动拉起
- **复用已有服务** —— 如果 `dsh web` 已经在跑，直接连上，退出时绝不误杀外部服务
- **无硬编码路径** —— `dsh` CLI 从 `PATH` 环境变量中解析
- **生命周期干净** —— 应用退出时终止自己拉起的子进程树
- **单实例保护** —— 重复启动只聚焦已有窗口，不会起第二个服务
- **端口可配置** —— 通过环境变量 `DSH_PORT` 覆盖（默认 `3080`）
- **跨平台** —— Windows / macOS / Linux

## 环境要求

**安装包无需任何环境依赖**——Node.js 运行时、`dsh` CLI 和 `pnpm` 都已打进应用里。安装即用。

仅从源码运行时需要：

- [Node.js](https://nodejs.org/) >= 22.12
- 全局安装 `dsh` CLI：

```sh
npm install -g @deepseek-ai/dsh
```

## 快速开始

```sh
git clone https://github.com/linuxlemon256/dsh-desktop.git
cd dsh-desktop
npm install
npm start
```

## 配置项

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DSH_PORT` | `3080` | `dsh web` 服务的 TCP 端口（设置后以 `dsh web --port` 传递） |
| `DSH_SKIP_PLUGIN_INSTALL` | 未设置 | 设为 `1` 关闭 IDE 工作台插件的自动安装 |

## 扩展 UI（社区插件）

`dsh web` profile 支持第三方插件，给 harness 界面加 IDE 级功能。
**应用会在首次启动时自动安装下面的 IDE 工作台插件**（当 `web` profile 里没有时）——
拉下来启动就能用，无需手动配置。设 `DSH_SKIP_PLUGIN_INSTALL=1` 可关闭自动安装。
首次启动因安装插件会稍慢。两个已验证的选项：

### 1. IDE 工作台：`dsh-better-sidebar`（推荐，自动安装）

在 harness 里直接获得完整工作台，无需打开其他 IDE：

- **文件工作台**：懒加载目录树 + **CodeMirror 编辑器**
- **真实终端**：xterm.js + node-pty
- **Git 面板**：VSCode 式 diff（暂存/提交/还原）
- 内嵌浏览器、后台任务页、可拆分分栏布局

手动安装（与应用自动安装等价）：

```sh
dsh plugin --profile web add dsh-better-sidebar
```

详见 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)（MIT）。

### 2. 文件树 + 预览面板：`@linxin666/dsh-web-ui-all`

一条命令装齐（Apache-2.0）：

- **资源管理器面板**：文件树、文件名搜索、git 变更（暂存/取消/丢弃）
- **预览面板**：10+ 格式多标签预览（markdown、代码、pdf、office、图片等）
- **任务看板**、**git 图**、**皮肤中心**、**实时统计** 等

```sh
npm install -g pnpm
dsh plugin --profile web add @linxin666/dsh-web-ui-all
```

> pnpm ≥ 11 默认拦截原生依赖构建（如 `ssh2`、`node-pty`），命令可能报
> `ERR_PNPM_IGNORED_BUILDS` 失败。此时打开
> `~/.dsh/profiles/web/pnpm-workspace.yaml`，把 `allowBuilds` 各项设为
> `true`，然后**重新执行一次 `dsh plugin ... add`**——必须成功退出（退出码 0）
> 插件才会写进 `dsh.profile.bundles` 并生效。

装完重启应用，打开**项目会话**（带工作目录的会话）即可看到效果。用法详见各插件仓库。

## 构建安装包

```sh
npm run prepare:resources  # 把 node + dsh + pnpm 打进 resources/（构建前必跑）
npm run build:win          # Windows：NSIS 安装包
npm run build:mac          # macOS：DMG（需要 macOS 机器）
npm run build:linux        # Linux：AppImage（需要 Linux 机器）
```

产物输出到 `dist/` 目录。发布官方多平台产物时，推送 `v*` 标签即可触发
[release 工作流](.github/workflows/release.yml)，GitHub Actions 会在三个平台
分别构建并把文件（含 `SHA256SUMS.txt`）自动挂到 Release 上。

## 工作原理

1. 启动时探测 `http://127.0.0.1:3080` 是否有 `dsh web` 服务在运行。
2. 1.5 秒内无响应，就从 `PATH` 中解析 `dsh`，以子进程方式执行 `dsh web`（设置了 `DSH_PORT` 时附加 `--port` 参数）。
3. 轮询端口直到服务就绪（60 秒超时），然后在 Electron 窗口中加载界面。若服务在启动期间崩溃，只会弹出一个明确的错误框，不会挂着白屏窗口。
4. 关闭窗口时终止子进程树——**仅当服务是本应用拉起的**。外部已运行的服务保持不动。

完整的架构说明和与 DeepSeek Harness 的派生关系见
[docs/deepseek-harness-integration.md](docs/deepseek-harness-integration.md)（二次开发说明文档）。

## 项目结构

```
dsh-desktop/
├── .github/               # Issue 与 PR 模板
├── docs/                  # DeepSeek Harness 集成说明（二次开发文档）
├── src/main.js            # Electron 主进程（整个应用就这一个文件）
├── package.json
├── LICENSE                # MIT
└── THIRD_PARTY_NOTICES.md # 上游版权声明
```

## 路线图

- [ ] 窗口打开期间 `dsh web` 崩溃时自动重启
- [ ] 设置界面（端口、开机自启）

## 参与贡献

欢迎提交贡献！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；上报安全问题前请阅读 [SECURITY.md](SECURITY.md)。

## 许可证

MIT —— 详见 [LICENSE](LICENSE)。

本项目是对 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
（MIT，© 2026 DeepSeek）的二次开发，版权归属说明见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
