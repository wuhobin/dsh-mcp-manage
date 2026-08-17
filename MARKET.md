# awesome-dsh-plugin.com — 市场注册材料 (dsh-mcp-manage)

> 依据：官方市场仓库 `awesome-dsh-plugin/awesome-dsh-plugin` 的 `README.zh.md` + `contributing.md`（这是**提交 PR 的权威规则**）。
> 收录方式：**不要手工改 README/plugins.json**——在 `data/plugins/` 新增一个 YAML，由脚本重新生成 README。
> `category` 可用取值（contributing.md 为准）：`ui usage theme model session memory tools vision skill workflow notify dev market fun`。
> MCP 管理类归 `dev`（`dsh-mcp-panel`、`dsh-mcp-lens` 均 `dev`）。

---

## 一、要提交的 PR 内容（单个 YAML 文件）

新增文件：**`data/plugins/wuhobin__dsh-mcp-manage.yml`**

```yaml
url: https://github.com/wuhobin/dsh-mcp-manage
name: wuhobin/dsh-mcp-manage
category: dev
description:
  en: Management UI for the official DSH MCP client (dsh-mcp-client): list/add/edit/delete the MCP servers in cordis.patch.yml and run a real MCP initialize connection handshake (streamable-http session or stdio process) per server to see at a glance whether each MCP service connects.
  zh: 官方 DSH MCP 客户端（dsh-mcp-client）的管理面板：列出/新增/编辑/删除 cordis.patch.yml 中注册的 MCP 服务，并对每个服务建立真实 MCP initialize 连接握手（streamable-http 会话或 stdio 进程）以直观判断各 MCP 服务是否连通。
```

要点（细节来自 contributing.md）：

- `url` 必须与仓库完全一致；`name` 填 **`owner/repo`**（不是 npm 包名）。
- 只要求 `description.en`；`zh` 可留空由维护者补。描述**只能陈述功能、不得营销/夸大**，且会对代码核对。
- 描述里含 `: `（冒号+空格）必须给整行加引号，否则 YAML 会解析成嵌套键（上面 en 描述用了 `initialize` 无 `: `，安全）。
- YAML 提交后要**在本仓库跑 `npm ci && node scripts/generate-readme.mjs`，把重新生成的两个 README 一起提交**。
- （可选，推荐）把 1–8 张截图加入 `data/screenshots.json`，以仓库 GitHub URL 为 key。

> ⚠️ 之前的 `plugins.json` JSON 条目是市场**生成产物**，不是投稿格式；现按官方规则以 YAML 为准。

---

## 二、入库门槛核查（**当前未全部满足** —— 见下方结论）

| 检查项（contributing.md 硬性要求） | 实测状态 |
| --- | --- |
| `package.json` 声明 **`dsh.bundle`**（pr 自动校验，#1 被打回原因） | ✅ master 已提交 `dsh: { bundle: { patch: "./static/cordis.patch.yml" }, client: { platform: "web" }, label }` |
| 仓库为**静态**插件、真实可用代码（非占位/纯 README） | ✅ 宿主+客户端 bundle+patch 均已实测装通 |
| 已添加 **`dsh-plugin`** topic | ✅ topics 含 `dsh-plugin`（共 7 个：cordis, deepseek-harness, dsh-plugin, harness, mcp, mcp-client, model-context-protocol） |
| 仓库**创建满 1 天** | ❌ 创建于 2026-08-17 05:07（约 1 小时前） |
| **提交数 ≥ 10** | ❌ 现仅 4 条（59d0c4e, f842e31, de86b5d, fab4aff） |

---

## 三、与既有同类插件的区隔（避免被当作重复/撞车）

市场已存在若干 MCP 主题插件，注册条目在描述里已刻意拉开差异：

| 既有插件 | 定位 | 与 dsh-mcp-manage 的差异 |
| --- | --- | --- |
| `dsh-mcp-panel` (npm, `dev`) | **只读**运行时面板：展示连接状态/已注册工具/错误/重连计数，仅给启停 patch 建议 | 我们**可读写**：直接编辑 `cordis.patch.yml` 增删改，并做**真实 initialize 握手**（不是仅读状态） |
| `dsh-mcp-lens` (`dev`) | MCP 审查/透视方向 | 我们聚焦日常 **CRUD + 连通性检测** 管理 |
| `dsh-mcp-bridge` / `dsh-mcpguard` / `dsh-plugin-setting-mcp` | 代理 / 保护 / MCP 客户端配置 | 不做网络代理或访问控制，只做注册项管理与握手检测 |

一句话卖点（可作 README 顶部/市场副标题）：**“官方 dsh-mcp-client 的配置管理页 + 真实连接握手体检”——管理 `cordis.patch.yml` 里每个 MCP 服务，一条命令安装、重启仍在、状态一屏看清。**

---

## 四、提交方式与当前结论

**提交渠道**：给 `awesome-dsh-plugin/awesome-dsh-plugin` 仓库开 PR，新增 `data/plugins/wuhobin__dsh-mcp-manage.yml`（第一节内容），
并在本仓库/或按市场脚本在本机 `npm ci && node scripts/generate-readme.mjs` 后把重新生成的两个 README 一并提交。PR 标题示例：
> `Add dsh-mcp-manage (dev) — MCP client config manager + real initialize handshake`

**结论：现在还不能提 PR —— 未过"创建满 1 天 + 提交数 ≥ 10"这道 CI 硬门槛。**

- 仓库创建于 2026-08-17 05:07，现约 1 小时；提交仅 4 条。contributing.md 明说这道门槛由 CI 自动检查、专为过滤"PR 前几分钟才建"的仓库；**不是对插件质量的否定**，达标后重新提交即可，不因重新提交受任何影响。
- 其余门槛均已满足：`dsh.bundle` ✓、`dsh-plugin` topic ✓、真实可装代码 ✓、分类 `dev` 合理 ✓。

**我（本会话）能做 / 不能做**：
- ✅ 已把 YAML 条目、门槛核对、区隔说明整理到可提交程度（本文件）。
- ✅ 可帮你复验 `pnpm add dsh-mcp-manage`／`dsh plugin add` 安装仍是通的。
- ⏳ 可在仓库满 1 天并凑够 ≥10 条真实提交后、正式开 PR（PR 本体 = 一个 YAML + 生成的两个 README）。多出的提交建议是有意义的完善（文档、测试、示例截图、README 截图资产等），不是为凑数而空提交 —— 避免被当成刚建好就刷提交的仓库。
- ❌ 我不能替你以你的账号向该第三方市场仓库推送。

> 可选推荐项：在仓库加一个 `assets/` 放 1–3 张「设置 → MCP 服务」界面截图，并按规则补进 `data/screenshots.json`（以仓库 URL 为 key），市场详情页即可展示 App Store 风格截图。

---

*生成于 2026-08-17；版本基线 `dsh-mcp-manage@1.1.0`；依据 `awesome-dsh-plugin/awesome-dsh-plugin` README.zh.md + contributing.md。*
