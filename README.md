# dsh-mcp-manage

> **Label: `dsh plugin`** · A [DeepSeek Harness (DSH)][dsh] plugin that adds an **MCP 服务** management page in **Settings**.

Manage the MCP servers DSH registers through `cordis.patch.yml`: list / add / edit / delete each MCP service, and — most importantly — **run a real MCP `initialize` connection handshake** against every server so you can see at a glance whether each MCP service connects normally.

![dsh-plugins](https://img.shields.io/badge/dsh-plugin-_)
![mcp](https://img.shields.io/badge/mcp-initialize-4a5fff)
![mit](https://img.shields.io/badge/license-MIT-blue)

---

## TL;DR

- Register a **Settings → MCP 服务** section (`settings.section` → id `mcp-manage`, order 30).
- Each configured MCP server gets a card with its id / serverName / transport / command-or-url / headers-or-env.
- A **status badge** (已连接 / 异常 / 未知 …) shows whether the service connects normally.
- Detecting a service does a **real MCP protocol handshake**, not just a ping:
  - `streamable-http` → a real authenticated `POST initialize` session via the official MCP SDK.
  - `stdio` → actually spawns the server command and completes an MCP `initialize` over stdio.
- Buttons: 添加服务 (create), 编辑 (edit), 删除 (delete), 检测 (probe one), 重新检测全部 (probe all).
- Changes are persisted back to `cordis.patch.yml` (insert-blocks for `@deepseek-ai/dsh-mcp-client`).

---

## About the DSH plugin model

DSH is built on [Cordis][cordis]. Dynamic plugins loaded by an agent session (via the `cordis_define` / `cordis_run`
workflow) run through the **dynamic-plugin runner** (`dsh-cordis-host-runner` / `dsh-cordis-client-runner`), which provides
a package-private RPC pair:

- **Host** registers JSON-RPC methods with `harness.handle(name, handler)`.
- **Client** calls them with `host.call(name, args)`.
- **Client UI** registers into a Slot (here `settings.section`) with `slots.register({ name, id, order, label }, render)`.

This repository ships the **verified source** for that dynamic plugin (the exact code currently running in this harness),
plus the standalone Node probe script it shells out to. It is published as a **`dsh plugin` labeled source artifact**
so the implementation is reviewable, reusable, and easy to re-load in any DSH session.

> The probe helper (`probe/dsh-mcp-probe.cjs`) is **standalone** — it only needs Node.js and an install of
> `@modelcontextprotocol/sdk`; it does not depend on DSH and can be exercised directly (see below).

---

## Layout

```
dsh-mcp-manage/
├── package.json              # dsh manifest, dsh-plugin keywords/label
├── README.md
├── LICENSE                   # MIT
├── plugin/
│   ├── host.js               # Host half: parse/serialize cordis.patch.yml, spawn probe, expose mcp/list|check|save
│   └── client.js             # Client half: Settings → MCP 服务 UI + status badges
├── probe/
│   └── dsh-mcp-probe.cjs     # Standalone real-MCP-initialize handshake (official @modelcontextprotocol/sdk)
└── test-parse.js             # YAML subset parse test used during development
```

---

## How it works

### Host half (`plugin/host.js`)

1. Reads `cordis.patch.yml` with a small YAML **subset** parser that understands the insert-block shape used by
   `@deepseek-ai/dsh-mcp-client` (`- insert: [ { id, name, config: {...} } ]`).
2. Exposes three package-private JSON-RPC methods:

   | method | purpose |
   | --- | --- |
   | `mcp/list` | list servers + the profile path |
   | `mcp/check` | run a real handshake per server, return `{status, message}` per server |
   | `mcp/save` | persist the edited server list back to `cordis.patch.yml` |

3. `mcp/check` shells out to `probe/dsh-mcp-probe.cjs` in a dedicated `node` subprocess (via the DSH `subprocess`
   service), passing the server spec as JSON (transport / command / args / env / url / headers), then parses the
   returned `RESULT{...}` line.

### Standalone probe (`probe/dsh-mcp-probe.cjs`)

Builds the correct transport from the SDK:

```js
stdio               -> new StdioClientTransport({ command, args, env, cwd })
streamable-http     -> new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } })
```

then performs a **real** `client.connect(transport)` (an actual MCP `initialize`), reports
`RESULT{"ok":true,"name":...,"ver":...}` or `RESULT{"ok":false,"error":...}`, and exits.
A hard 15s timeout self-terminates the process so the harness/browser never hangs.
Credentials (e.g. `Authorization: Bearer …`, `GITHUB_PERSONAL_ACCESS_TOKEN`) go only into the probe process; the
result reports only `ok` / `name` / `ver` / `error`, never the headers.

### Client half (`plugin/client.js`)

Renders the Settings section, keeps in-memory state, and calls the host methods over `host.call`. After a check it
labels each server with a status badge:

| status | label |
| --- | --- |
| `ok` | 已连接 (green) |
| `reachable` | 可达 |
| `errror` / `unreachable` | 异常 (red) |
| `unknown` | 未知 |
| `checking` | 检测中 |

---

## Loading it into a DSH session

Because DSH currently catalogues **dynamic** plugins as the authored path, load this plugin in any agent session that
has the `cordis` (dynamic plugin) preset enabled by pasting its host/client source into `cordis_define`:

1. `cordis_define` a new Plugin, e.g. `idPrefix: "mcpsv", name: "MCP Server Manager"`:
   - `code.host` ← contents of `plugin/host.js`
   - `code.client` ← contents of `plugin/client.js`
2. `cordis_run` to activate.
3. Open **Settings → MCP 服务** to manage and probe the configured MCP servers.

The probe script is written to the profile directory (`<profile>/dsh-mcp-probe.cjs`) by the host on startup, so a
restart of the plugin keeps the fixed helper.

### Directly exercising the probe (no DSH needed)

```bash
# stdio server
node probe/dsh-mcp-probe.cjs "{\"sdkRoot\":\"/abs/path/node_modules\",\"transport\":\"stdio\",\"command\":\"/abs/path/server\",\"args\":[\"stdio\"],\"env\":{\"TOKEN\":\"...\"},\"timeoutMs\":15000}"

# streamable-http server
node probe/dsh-mcp-probe.cjs "{\"sdkRoot\":\"/abs/path/node_modules\",\"transport\":\"streamable-http\",\"url\":\"https://host/mcp\",\"headers\":{\"Authorization\":\"Bearer ...\"},\"timeoutMs\":15000}"
```

`probe` is also wired as an npm script: `npm run probe -- "<spec-json>"`.

---

## Acknowledgements

- [DeepSeek Harness][dsh] for the dynamic-plugin runtime (`harness.handle` / `host.call` / `slots`).
- [Model Context Protocol SDK][mcp-sdk] (`@modelcontextprotocol/sdk`) for the real `initialize` handshake.
- [Cordis][cordis] for the plugin/event/service framework.

[dsh]: https://github.com/deepseek-ai/deepseek-harness
[cordis]: https://github.com/cordiverse/cordis
[mcp-sdk]: https://github.com/modelcontextprotocol/typescript-sdk
