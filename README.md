<h1 align="center">dsh-input-history</h1>

<p align="center">
  <strong>简体中文</strong> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/topics/dsh-plugin"><img alt="dsh-plugin" src="https://img.shields.io/badge/dsh-plugin-4d6bfe?style=flat&logo=deepseek&logoColor=white" /></a>
  <a href="https://opensource.org/licenses/MIT"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-yellow.svg?style=flat" /></a>
  <a href="https://www.npmjs.com/package/@deepseek-ai/dsh"><img alt="DSH >=0.2.2-rc.2" src="https://img.shields.io/badge/dsh-%3E%3D0.2.2--rc.2-4d6bfe?style=flat" /></a>
</p>

<p align="center">
  <strong>终端式输入历史，用 <kbd>↑</kbd>/<kbd>↓</kbd> 翻查本会话发过的消息。</strong><br>
  纯客户端插件，无宿主侧改动 — <code>/history</code> 指令提供可搜索的历史面板。
</p>

## 🎬 演示

<p align="center">
  <img src="assets/demo.webp" alt="输入历史演示">
</p>

## ✨ 功能

本插件给每个会话注入两条互补的输入历史召回通道：

- **⌨️ 终端式方向键翻查** — 仿 shell 命令历史，**不弹列表**，<kbd>↑</kbd>/<kbd>↓</kbd> 直接替换输入框内容
- **📋 `/history` 历史面板** — 可搜索的悬浮列表，支持鼠标点选与键盘操作

### ⌨️ 方向键翻查

| 操作 | 效果 |
|---|---|
| <kbd>↑</kbd> / <kbd>↓</kbd>（空输入框或光标在最前） | 开始翻查，取回最近一条已发送消息 |
| <kbd>Esc</kbd> | 还原草稿并退出翻查 |

### 📋 `/history` 面板

| 方式 | 召回语义 |
|---|---|
| 斜杠菜单选中 `/history` | **插入模式**：消息插入到 `/history` 词元位置，前后文保留 |

面板支持**搜索过滤**、鼠标点选与 <kbd>↑</kbd>/<kbd>↓</kbd> + <kbd>Enter</kbd> 操作；<kbd>Esc</kbd> 或点击面板外取消。

> 数据读取自当前会话的完整日志（含分页），按会话严格隔离；相邻重复消息自动折叠。

## 🚀 安装
从 NPM 安装（DSH `>=0.2.2-rc.2`）：
```
dsh plugin --profile web add @loommii/dsh-input-history@0.4.0
```

或从 GitHub 安装：

```
dsh plugin --profile web add github:loommii/dsh-input-history
```

> 安装后，插件列表显示为 **输入历史 (@loommii/dsh-input-history)**。

### DSH 版本兼容

`0.4.0` 起只支持 DSH `>=0.2.2-rc.2`，直接使用当前公开的 `conversation.input.for()`、`remote.session.events`、`sessions`、`slots`（含 `inputActions`）和 `inputTriggers` 接口，不再保留旧版本兼容分支。

| DSH 版本 | 状态 | 说明 |
|---|---|---|
| `>=0.2.2-rc.2` | ✅ 支持 | 0.4.0 的最低版本；开发与验证基线为 `0.2.2-rc.2` |
| `0.2.2-rc.3` | ✅ 支持 | 最新候选版（npm `next` 标签）；已按发布产物逐包核对，本插件用到的接口与 `0.2.2-rc.2` 完全一致；GUI 验证基线仍是 `0.2.2-rc.2` |
| `<0.2.2-rc.2` | ❌ 不支持 | 请继续使用 `0.3.1`（最后一个兼容 `0.1.7-rc.1+` 的版本） |

`0.4.0` 的破坏性变更：

- 最低 DSH 版本从 `0.1.7-rc.1` 提升到 `0.2.2-rc.2`
- 移除旧版本兼容代码：未使用的裸 `remote` 服务注入、旧服务形状探测、旧主题 token 回退
- 改用 `remote.session.events`（`page` 已弃用）以及槽位 `inputActions` / `captureInsertion()` / `insertText()`，移除手写 DOM 光标探测和 `RuntimeDraft` 镜像
- 功能不变；菜单插入路径会保留 `/history` 词元直到选中历史行，选中后只替换该词元，保留周围内容与撤销历史

> npm 的 `latest` 当前指向 `0.2.2-rc.1`，`next` 指向 `0.2.2-rc.3`（`0.2.2-rc.2` 已不在任何标签上，只能显式写版本号）；安装 DSH 时请显式指定版本。升级 DSH 后请整页刷新 GUI。

如果你的 DSH 早于 `0.2.2-rc.2`，请继续使用 `0.3.1`：

```
dsh plugin --profile web add @loommii/dsh-input-history@0.3.1
```

安装后重启 profile（`dsh web` / `dsh --profile <name>`）。

升级 / 卸载：

```
dsh plugin --profile web update @loommii/dsh-input-history
dsh plugin --profile web remove @loommii/dsh-input-history
```

## 💡 使用

聚焦任意会话的聊天输入框：

- **空输入框**按 <kbd>↑</kbd>/<kbd>↓</kbd>，或光标移到**最前**按 <kbd>↑</kbd>：开始终端式翻查。
- 输入 <code>/history</code> 并从斜杠菜单选中，或直接回车：打开历史面板。


## 🏗️ 架构

本插件是纯客户端 UI：历史通过 `remote.session.events` 从宿主完整会话日志分页读取（按会话隔离缓存），回填优先使用槽位 `inputActions`（`setDraft` / `insertText`），源回调兜底使用 `conversation.input.for(actx)`。

<p align="center">
  <img src="assets/architecture.png" alt="dsh-input-history 架构图">
</p>


## 📄 许可

MIT
