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

- [Node.js](https://nodejs.org/) >= 20
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
| `DSH_PORT` | `3080` | `dsh web` 服务的 TCP 端口 |

## 构建安装包

```sh
npm run build:win     # Windows：NSIS 安装包 + 便携版 .exe
npm run build:mac     # macOS：DMG
npm run build:linux   # Linux：AppImage
```

产物输出到 `dist/` 目录。

## 工作原理

1. 启动时探测 `http://127.0.0.1:3080` 是否有 `dsh web` 服务在运行。
2. 1.5 秒内无响应，就从 `PATH` 中解析 `dsh`，以子进程方式执行 `dsh web`。
3. 轮询端口直到服务就绪（60 秒超时），然后在 Electron 窗口中加载界面。
4. 关闭窗口时终止子进程树——**仅当服务是本应用拉起的**。外部已运行的服务保持不动。

完整的架构说明和与 DeepSeek Harness 的派生关系见
[docs/deepseek-harness-integration.md](docs/deepseek-harness-integration.md)（二次开发说明文档）。

## 项目结构

```
dsh-desktop/
├── .github/               # Issue 与 PR 模板
├── docs/                  # DeepSeek Harness 集成说明（二次开发文档）
├── main.js                # Electron 主进程（整个应用就这一个文件）
├── package.json
├── LICENSE                # MIT
└── THIRD_PARTY_NOTICES.md # 上游版权声明
```

## 路线图

- [ ] 应用图标与安装包品牌化
- [ ] 窗口打开期间 `dsh web` 崩溃时自动重启
- [ ] 设置界面（端口、开机自启）
- [ ] 三平台 CI 构建流水线（GitHub Actions）

## 参与贡献

欢迎提交贡献！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；上报安全问题前请阅读 [SECURITY.md](SECURITY.md)。

## 许可证

MIT —— 详见 [LICENSE](LICENSE)。

本项目是对 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
（MIT，© 2026 DeepSeek）的二次开发，版权归属说明见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
