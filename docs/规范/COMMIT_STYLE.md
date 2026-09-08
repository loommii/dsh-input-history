# Git Commit 规范（dsh-provider-usage）

> 本规范基于 DSH 生态调研（`deepseek-ai/deepseek-harness`、`zhu1090093659/dsh-web`、`wingsky-1/dsh-plugin-hub`、`omdsh-dev/DSH-better-sidebar`、`Ychris12138/dsh-usage-stats`、`anywhere-labs/dsh-desktop`、`xmanrui/dsh-im`）与本项目自身历史风格综合制定。
> 适用本仓库全部 commit（含 PR squash、个人提交、bot 自动提交）。
> 最后修订：v0.6.0 立项时。

---

## 1. 规范要点（TL;DR）

| 维度 | 选择 | 理由 |
|---|---|---|
| **风格** | Conventional Commits（DSH 生态主流） | 官方、zhu1090093659、wingsky-1、Ychris12138、anywhere-labs 一致采用 |
| **格式** | `<type>(<scope>): <subject>` 或 `vX.Y.Z: <subject>` | 沿用本项目历史双轨制 |
| **scope** | **可选**，但推荐使用模块名（client / host / card / settings / docs / test） | 项目非 monorepo，scope = 模块前缀 |
| **语言** | subject/body 用**中文**（与项目历史一致） | DSH 生态中文项目普遍做法；本仓库 README/CHANGELOG 全中文 |
| **emoji** | **禁止**（commit message / code / docs / UI 全栈） | 与 zhu1090093659 AGENTS.md 一致 |
| **body** | 默认不写；如有 body 写**根因+复现**，不写 what 清单 | 与 DSH 官方风格一致 |
| **多要点分隔** | 用 `;`（中文半角分号） | **本项目历史习惯**（v0.5.1/v0.5.2 等均如此） |
| **版本号尾缀** | 涉及发版时尾缀 `; vX.Y.Z` | 历史习惯（v0.4.0~v0.5.2 沿用） |
| **breaking** | `feat!:` 或 `feat(scope)!:`（在 subject 前加 `!`） | omdsh-dev 用法，CC 标准做法 |
| **PR 引用** | subject 末尾可选 `(#PR号)`（仅当从 GitHub PR squash 来时） | Ychris12138/zhu1090093659/wingsky-1 一致采用 |

---

## 2. 两种 commit 形式

本项目根据"是否跨模块 / 是否发版"使用两种 title 形态：

### 2.1 普通变更 commit：`<type>(<scope>): <subject>`

适用于：单模块小改、bugfix、refactor、docs、test。

```
feat(card): 月窗口未推算时隐藏整行，避免「0% 还没用」误读
fix(client): 窗口重置字段 resetAt 改名为 resetsAt（卡片倒计时恒空白）
refactor(client): <table> 替换字符串拼接; 提取 MODEL_COLS 常量
docs: 新增 commandcode-support-plan.md 方案评估
test(host): 场景 20b~20f 覆盖 Command Code 全场景
chore: UA 版本号改从 package.json 读取（告别硬编码残留）
fix(provider-usage): 余额卡片副标题精简 (#346)
```

> **从 GitHub PR squash 来的 commit**，按 Ychris12138 / zhu1090093659 / wingsky-1 的做法，subject 末尾追加 `(#PR号)`。

### 2.2 发版 commit：`vX.Y.Z: <subject>`

适用于：跨越多模块、需要一次性封版的里程碑合并（**按 git 工作流**：通常由发版 PR squash 产生）。

```
v0.6.0: 新增 Command Code 提供方（订阅+余额混合卡）; 窗口重置字段命名修复; UA 改读 package.json; subscriptionTimeoutMs 短超时; 月%不可推算时隐藏整行
```

**注意**：发版 commit **不再单独**写 type 前缀——它本身就是发布动作。`CHANGELOG.md` 与此 commit 1:1 对应。

---

## 3. type 清单

| type | 含义 | 示例 |
|---|---|---|
| `feat` | 新功能 | `feat(card): 新增月窗口隐藏逻辑` |
| `fix` | 修复 bug | `fix(card): 重置倒计时恒空白` |
| `refactor` | 重构（既不修 bug 也不加功能） | `refactor(client): 抽取 MODEL_COLS 常量` |
| `perf` | 性能优化 | `perf(host): 缓存命中率优化` |
| `docs` | 仅文档 | `docs: 更新 README 版本号` |
| `test` | 仅测试 | `test(host): 增加 20b 场景断言` |
| `chore` | 杂项（构建/依赖/工具） | `chore: UA 改读 package.json` |
| `release` | 显式发布动作（**本项目目前未使用**，统一用 `vX.Y.Z:` 形式） | – |

**禁止使用**（避免歧义）：`update`、`polish`、`WIP`、`tmp`、`misc`。

---

## 4. scope 命名约定

scope 是可选的，但**推荐使用**——便于 `git log --grep` 检索。

### 4.1 本项目推荐的 scope 集合

| scope | 适用对象 |
|---|---|
| `client` | `lib/client.js`（React UI） |
| `host` | `lib/index.js`（Cordis 插件主体、HTTP 路由） |
| `card` | client 中的卡片组件（cross-file） |
| `settings` | client 中的设置面板 |
| `secure-store` | `lib/secure-store.js`（AES 加密存储） |
| `daily-stats` | `lib/daily-stats.js`（本地统计） |
| `tests` | `tests/*.mjs` |
| `docs` | `docs/*` |
| `readme` | `README.md`（当与 docs 改动不重合时） |
| `package` | `package.json` / `package-lock.json` |
| `release` | CHANGELOG + 版本号升（与 version commit 配套） |
| 无 scope | 跨多模块的小改 / 通用 chore |

### 4.2 scope 命名规则

- 小写英文，**单数**
- 不用 file extension（`host` 不是 `host.js`）
- 不用下划线（`secure-store` 用 `-` 分隔）
- 跨多模块时省略 scope

---

## 5. subject 写作规则

### 5.1 长度

- **≤ 72 字符**（含 type 和 scope）；理想 50 字符以内
- 一句话讲清"做了什么"
- 中文标点全角，英文标点半角（与本项目历史一致）

### 5.2 时态与语态

- **动词开头**，省略主语"我"
- 中文用动词原形（"修复"、"新增"、"抽取"、"移除"）
- 不加句号、感叹号（中文项目惯例——本项目历史 commit 均无尾标点）

### 5.3 多要点分隔

**用 `;`（中文半角分号）**——这是本项目历史习惯（v0.4.0 ~ v0.5.2 全部如此）：

```
fix(card): 重置倒计时恒空白; 字段命名 resetAt → resetsAt; 兼容读旧缓存
```

不要用：

- ❌ `,` 逗号（信息层次不清）
- ❌ `、`顿号（语气偏口语）
- ❌ `\n` 换行（与本项目单行风格不符）

> **例外**：发版 commit（§2.2）若 subject 装不下全部要点，可在 body 用 `-` bullet 列出（参考历史 v0.5.1 `1b6cfea`）。但**普通 commit 仍坚持单行 + `;`**——本项目 22 条历史中只有 1 条用了 bullet body，是少数派。

---

## 6. body 写作规则

### 6.1 默认不写 body

本项目 22 条历史 commit 中只有 1 条写了 body（`1b6cfea v0.5.1` 的 `- ` 列表形式）。**默认 commit 只用 subject 一行**。

### 6.2 何时需要 body

满足以下任一条件时，写 1-3 段 body：

- 修复了一个**非显然 bug**：需要解释根因 + 复现路径
- 引入了**架构性决策**：需要记录权衡（DSH 官方风格）
- 影响了**对外协议/API**：需要说明兼容性影响
- 涉及**多个独立改动**：subject 一行讲不清

### 6.3 body 写法（DSH 官方风格）

body 写 **why**（为什么这么做）和 **how to reproduce**（如何复现），**不写 what**：

```
fix(agent-presets): register the display subpath in tsconfig paths

CI's coverage lane runs on a clean tree where workspace imports resolve
through tsconfig paths to src; the value import of
@deepseek-ai/dsh-agent-presets/display therefore needs its own paths row
beside ./types. Locally the built lib masked the gap; reproduced by moving
lib aside, fixed, and re-run green under the same condition.
```

**禁止**：
- ❌ "修改了 A 文件的 B 函数，新增了 C 参数" 这种 what 清单（diff 已经能看到）
- ❌ 大段贴日志/截图（应放在 PR 描述或 commit 评论）
- ❌ AI 元信息（"由 claude-sonnet-4 协助完成"——属于 PR 元数据，不进 commit）

---

## 7. 版本号与发版流程

### 7.1 版本号格式

遵循 [Semantic Versioning](https://semver.org/) + 本项目已有约定（`v0.X.Y`）：

| 变更类型 | bump | 示例 |
|---|---|---|
| 破坏性 / 新提供方 | `minor` | `0.5.2` → `0.6.0`（新增 Command Code） |
| 新功能 / 兼容性改进 | `minor` | `0.5.1` → `0.5.2` |
| Bug 修复 | `patch` | `0.4.1` → `0.4.2` |

预发布版本用 `-alpha.N` / `-beta.N` 后缀（与 DSH 主仓对齐）。

### 7.2 发版 commit 模板

```
v<新版本号>: <改动概述，使用 ; 分隔多个并列要点>
```

```
v0.6.0: 新增 Command Code 提供方（订阅+余额混合卡）; 窗口重置字段命名修复; UA 改读 package.json; subscriptionTimeoutMs 短超时; 月%不可推算时隐藏整行
```

发版 commit 应同时包含：
- `CHANGELOG.md` 的新版本条目（顶部插入）
- `package.json` 的 `version` 字段更新
- `README.md` 顶部版本号徽标更新

### 7.3 版本号尾缀（普通 commit）

涉及版本演进的普通 commit 在 subject 末尾加 `; vX.Y.Z`，便于 `git log --grep="v0.6.0"` 检索：

```
feat(card): 月窗口未推算时隐藏整行; v0.6.0
fix(client): 窗口重置字段命名修复; v0.6.0
```

**不是每个 commit 都要加**——只有当该 commit 属于某个待发布版本时才加。

---

## 8. Breaking Change 标记

跨版本不兼容变更用 `!` 标记：

```
feat(host)!: 移除 legacy provider id 兼容层; v1.0.0
refactor(client)!: 卡片组件 API 重构（props 从 object 改为扁平）; v1.0.0
```

并在 body 第一行写明：

```
BREAKING CHANGE: <具体影响>
```

---

## 9. Revert 回滚

```
revert: feat(card): 月窗口未推算时隐藏整行

This reverts commit <full-sha>.
```

由 `git revert` 自动生成，无需手写。

---

## 10. 完整示例

### ✅ 推荐写法

```
v0.6.0: 新增 Command Code 提供方（订阅+余额混合卡）; 窗口重置字段命名修复; UA 改读 package.json; subscriptionTimeoutMs 短超时; 月%不可推算时隐藏整行

feat(client): Command Code 适配 UI（CC 占位 logo + 混合卡布局）; v0.6.0
fix(client): 窗口重置字段 resetAt → resetsAt（卡片倒计时恒空白）; v0.6.0
fix(host): UA 版本号硬编码 0.5.0 残留 → 改读 package.json; v0.6.0
feat(host): 新增 subscriptionTimeoutMs（默认 5s）防止次要端点挂起拖累整体响应; v0.6.0
feat(host): Command Code 月%不可推算时隐藏整行（避免「0% 还没用」误读）; v0.6.0
feat(host): Command Code 双端点并行查询 + 5 档计划映射 + 订阅端点失败安全降级; v0.6.0
test(host): 场景 1/10/20/20b~20f 覆盖 UA 版本/templates/Command Code 全场景; v0.6.0
docs: 新增 commandcode-support-plan.md（方案评估）; v0.6.0
docs(readme): 升版本号 v0.4.2 → v0.6.0 + 新增 Command Code 行; v0.6.0
chore(release): CHANGELOG.md v0.6.0 条目 + package.json version 升 0.6.0; v0.6.0
```

### ❌ 反例

```
❌ "Update code"                  // 无 type 无信息
❌ "fix bug"                       // 无 scope 无具体说明
❌ "feat(card): 新增功能"          // subject 太泛
❌ "feat(card): 新增 Command Code 提供方支持。修复了重置字段。"  // 末尾句号、多模块塞一条
❌ "feat(card): 🎉 新增 CC 提供方" // emoji（zhu1090093659 明文禁止）
❌ "fix(card): 修改了 lib/client.js 的 WindowRow 组件"  // what 清单，不写 why
❌ "feat: add Command Code"        // 英文（项目历史全中文）
❌ "update docs"                   // 错 type（DSH 生态 xmanrui 真实反例）
❌ "fix error"                     // 无具体说明（DSH 生态 xmanrui 真实反例）
❌ "Update README.md"              // GitHub web 默认（WYH66666666 真实反例）
❌ "polish(client): 小调整"        // 禁 type（SeverusZh 偶尔用，但本规范禁用）
```

---

## 11. 工具与自动化

### 11.1 本项目**目前未配置** commit-msg 钩子

本项目 git hooks 当前为空（与 DSH 官方 `lefthook.yml` 配置 pre-commit/pre-push 风格不同——本项目体量小，依赖人工规范 + PR review）。

### 11.2 建议的未来扩展

- **commitlint + husky**：未来若启用，配置对应本规范 type 清单（feat/fix/refactor/perf/docs/test/chore/release）
- **release-please / semantic-release**：发版 commit 自动生成（但本项目目前手工管理版本号）
- **PR title 检查**：PR squash → commit title 应符合本规范

---

## 12. 与 DSH 生态的关系

| 维度 | 本规范 | DSH 官方 | zhu1090093659 | wingsky-1 | Ychris12138 |
|---|---|---|---|---|---|
| type 体系 | feat/fix/refactor/perf/docs/test/chore/release | feat/fix/docs/test/refactor/chore/release/perf | feat/fix/docs/test/refactor/chore | feat/fix/docs/refactor/test/chore/ci/perf | feat/fix/docs/chore |
| scope | 推荐，模块名 | 推荐，包名 | 推荐，包名 | 推荐，插件名 | 无 |
| subject 语言 | 中文 | 英文为主 | – | 中文 | 英文 |
| emoji | ❌ 禁 | ❌ 禁（隐含） | ❌ 明文禁 | – | – |
| body | 默认无，必要时写 why | 散文式 why | – | – | – |
| 多要点分隔 | `;`（历史习惯） | bullet | bullet | bullet | bullet |
| 发版形式 | `vX.Y.Z: ...` | `release(dsh): ...` / `release(vendor): ...` | `chore(release): ...` | `chore(release): ...` | `chore: prepare release` |
| PR 引用 | 可选 `(#PR号)` | – | ✅ | ✅ | ✅ 100% |

**差异说明**：

- 本项目中文 subject + `;` 分隔是中文项目历史习惯，与 DSH 官方英文 + bullet 略有差异，但**不影响** `git log` 检索与自动 changelog 生成。
- `release:` 类型是 DSH 官方自创；本项目用 `vX.Y.Z: ...` 双轨制（沿用历史），更直观。
- scope 命名上：DSH 官方用包名（monorepo），本项目用模块名（单仓），但本质都是"scope = 改动域"。

### 12.1 生态中**应当避免**的写法（来自真实反例）

| 反例 | 来源 | 原因 |
|---|---|---|
| `update docs` / `update README.md` / `fix error` / `修改readme` | xmanrui、WYH66666666、xuanyuanzhifeng | 缺 type / 缺具体说明 / 中文混英文 |
| `Update README.md`（GitHub Web 默认） | WYH66666666 | 无 type |
| `polish(orchestrate): ...` | SeverusZh | 非标准 type |
| emoji 🎉 / 🖥️ / 🚀 | 多见 | zhu1090093659 明文禁止 |
| body 列"修改了 A 文件的 B 函数" | 本项目反例 | 写 what 不写 why（DSH 官方偏好） |

---

## 附录 A：参考资料

### A.1 外部规范来源

- [Conventional Commits 规范](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)

### A.2 DSH 生态直接参考

| 来源 | 关键条款 | 与本规范对应 |
|---|---|---|
| `deepseek-ai/deepseek-harness` AGENTS.md | 实际 200 条 commit 100% 遵循 `type(scope): subject`，无明文规范 | type 体系、scope 推荐 |
| `deepseek-ai/deepseek-harness` | 自创 `release:` 类型（`release(dsh):` / `release(vendor):`） | 本规范改用 `vX.Y.Z:` 形式（项目历史习惯） |
| `zhu1090093659/dsh-web` AGENTS.md | "Use Conventional Commits: `type(scope): subject`, with types such as `feat`, `fix`, `docs`, `test`, `refactor`, and `chore`. **Do not include emoji**." | type 清单（不含 `perf`）、禁 emoji |
| `zhu1090093659/dsh-web` AGENTS.md Repository Rules | "Do not use emoji in code, comments, documentation, UI text, scripts, or **commit messages**." | 全栈禁 emoji |
| `zhu1090093659/dsh-web` CONTRIBUTING.md | "提交信息禁止 emoji（全仓规则）" | 同上 |
| `wingsky-1/dsh-plugin-hub` CONTRIBUTING.md | 8 种 type（`feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `ci` / `perf`）；scope = 插件名或省略；subject 动词开头 | 多出 `ci` 类型；scope = 子模块名 |
| `omdsh-dev/DSH-better-sidebar` | `feat!:` breaking 标记；中文标题也允许 | breaking 标记 |
| `Ychris12138/dsh-usage-stats` | `type: subject (#PR)` 100% 命中，无 scope | PR 引用格式 |

### A.3 调研数据规模

- DSH 官方主仓：200 条非 merge commit + CONTRIBUTING/AGENTS/lefthook 完整文档
- DSH 生态插件：15 个仓库 commit 标题样本（49 个候选仓库去重）
- 本项目历史：22 条非 merge commit 全量分析
- 数据采集时间：2026-08-31

## 附录 B：本规范的历史兼容性

本规范是**本项目历史风格的归纳与显式化**：

| 历史 commit | 本规范对应形式 |
|---|---|
| `v0.5.2: 按模型汇总改语义化表格...` | 2.2 发版 commit |
| `feat(local-stats): M3 ...; v0.5.0` | 2.1 普通 commit + 7.3 版本号尾缀 |
| `fix(card): reset time as compact countdown (Rainytoken widget style); v0.4.2` | 2.1 普通 commit + 7.3 |
| `fix(dialog): anchor 12px above whale (remove double size offset); right-edge clamp...; v0.1.7` | 2.1 + ; 分隔多要点 |
| `feat: M1 provider usage plugin - ...` | 2.1 无 scope 形式 |
| `docs: public release prep — drop 方案.md, move CHANGELOG into docs/...` | 2.1 + — em dash |

历史 22 条 commit **全部符合**本规范，未发现违规。