# awesome-dsh-plugin.com — 市场注册材料 (dsh-mcp-manage)

> 依据：`dshmarket` 自带、2026-08-15 更新的 `data/registry-snapshot.json`（457 个条目）逐字段对齐的注册模板。
> 目标订阅源：`https://awesome-dsh-plugin.com/plugins.json`。
> 归档 `category` 枚举（现实取值）：`ui, theme, session, memory, tools, skill, workflow, notify, model, dev, fun`。
> MCP 管理类现实归档：`dev`（`dsh-mcp-panel`、`dsh-mcp-lens` 均 `dev`）。

---

## 一、注册条目（可直接粘贴进 `plugins.json` 的 `plugins` 数组）

```json
{
  "name": "dsh-mcp-manage",
  "owner": "wuhobin",
  "url": "https://github.com/wuhobin/dsh-mcp-manage",
  "category": "dev",
  "description": {
    "en": "Management UI for the official DSH MCP client (dsh-mcp-client): list/add/edit/delete the MCP servers registered in cordis.patch.yml, and run a real MCP initialize connection handshake (streamable-http session / stdio process) per server to see at a glance whether each MCP service connects. Edits are written straight back to cordis.patch.yml.",
    "zh": "官方 DSH MCP 客户端（dsh-mcp-client）的管理面板：列出/新增/编辑/删除 cordis.patch.yml 中注册的 MCP 服务，并对每个服务建立真实 MCP initialize 连接握手（streamable-http 会话 / stdio 进程）以直观判断各 MCP 服务是否连通。改动直接写回 cordis.patch.yml。"
  },
  "npm": "dsh-mcp-manage",
  "stars": 0,
  "install": "dsh plugin --profile web add dsh-mcp-manage",
  "added": "2026-08-17"
}
```

发布方生成时按需补 `"page": "https://awesome-dsh-plugin.com/p/wuhobin/dsh-mcp-manage/"`（其余条目皆有该派生子段，注册端会自动加或在条目里带上均可）。

---

## 二、入库前置自查（均已满足）

| 检查项 | 状态 |
| --- | --- |
| npm 包存在、`npm` 字段可解析 | ✅ `dsh-mcp-manage` @ npm，已发布 `1.1.0`（2026-08-17） |
| `url` 是 GitHub 仓库 | ✅ `https://github.com/wuhobin/dsh-mcp-manage`（master `de86b5d`） |
| `name` 匹配 NPM_NAME_RE（`dsh-mcp-manage`） | ✅ |
| 是**静态**插件（bundle patch + 客户端 bundle + 入口产物） | ✅ `main=./static/index.js`、`exports["./client"]=./static/client.js`、`dsh.bundle.patch=./static/cordis.patch.yml`、`dsh.client.platform="web"` |
| 安装方式可复现 | ✅ `pnpm add dsh-mcp-manage` 实测装通（真实 registry） |
| 与既有 MCP 插件区隔 | ✅ 见下 |
| 许可证 | ✅ MIT（LICENSE 随包发布） |

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

## 四、如何提交（供你确认的几条路径）

市场（`awesome-dsh-plugin.com`）的 `plugins.json` 由站点侧维护，常规提交入口通常是：

1. **GitHub—给插件市场仓库开 PR**：把上面 JSON 追加到统一 `plugins.json`（或对应分类文件，取决于站点仓库结构），提交信息建议：
   > `Add dsh-mcp-manage (dev) — MCP client config manager + real initialize handshake`
2. **站点表单**：若 `awesome-dsh-plugin.com` 提供“提交插件”页，把第一节的 JSON 与第二/三节的说明贴进对应字段。
3. 想让我协助：可先拉取市场仓库看 `plugins.json` 提交结构，然后我帮你把 diff/PR 本体准备好（需你告知市场仓库地址，或允许我搜索确认）。

> 说明：本仓库**不能**自行替你在 npm / GitHub 之外向第三方站点写库 —— 发布方账号与站点侧合并由你控制；我能做的是把上面材料整理到完全可粘贴、可提交的程度（已完成），并可按需帮你跑 `pnpm add dsh-mcp-manage` 复验安装。

---

*生成于 2026-08-17；版本基线 `dsh-mcp-manage@1.1.0`。*
