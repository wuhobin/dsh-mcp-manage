# dsh-mcp-manage

> **Label: `dsh plugin`** · A [DeepSeek Harness (DSH)][dsh] **static plugin** that adds an **MCP 服务** management page in **Settings**.

Manage the MCP servers DSH registers through `cordis.patch.yml`: list / add / edit / delete each MCP service, and — most importantly — **run a real MCP `initialize` connection handshake** against every server so you can see at a glance whether each MCP service connects normally.

![dsh-plugins](https://img.shields.io/badge/dsh-plugin-_)
![mcp](https://img.shields.io/badge/mcp-initialize-4a5fff)
![mit](https://img.shields.io/badge/license-MIT-blue)

---

## Install — one command, restart-persistent

This is a **static DSH plugin** (the same shape as a plugin-market package): once installed it is a dependency of the
profile and is loaded by the bundle layer on every boot — it **survives restarts**, no pasting code, no `cordis_define`.

From anywhere a package is installed into a DSH profile:

```bash
# link straight from this repo
pnpm add github:wuhobin/dsh-mcp-manage   # or an npm registry entry when published

# restart the dsh process (e.g. `dsh web`), then open Settings → MCP 服务
```

The package carries a `dsh.bundle.patch` (`static/cordis.patch.yml`) that inserts

```yaml
- insert:
    - id: dsh-mcp-manage
      name: 'dsh-mcp-manage'
```

so DSH's bundle layer turns it into an **active loader entry** automatically. You only need to add the dependency
once; the UI page and routes appear after a restart.

> Its manifest is also compatible with the built-in plugin market (`dshmarket`), so it **could** be listed there too —
> but this package is primarily distributed as an npm package: `pnpm add dsh-mcp-manage`.

---

## TL;DR (what you get)

- A **Settings → MCP 服务** section (`settings.section` → id `mcp-manage`, order 30).
- One card per configured MCP server: id / serverName / transport / command-or-url / headers-or-env plus a **status
  badge** (已连接 / 可达 / 异常 / 未知).
- 检测 (probe one) / 重新检测全部 run a **real MCP `initialize` handshake**, not a ping:
  - `streamable-http` → a real authenticated `POST initialize` session via the official MCP SDK.
  - `stdio` → actually spawns the server command and completes an MCP `initialize` over stdio.
- 添加服务 / 编辑 / 删除 persist changes straight back to `cordis.patch.yml` (`insert:`-blocks for
  `@deepseek-ai/dsh-mcp-client`).

---

## Architecture — this is a real static plugin

The dynamic plugin the author originally shipped used the dynamic-runner sandbox APIs (`harness.handle` / `host.call`),
which only exist inside `dsh-cordis-*-runner`. A **static** plugin runs in the normal (non-sandbox) plane and gets no
`harness`/`host.call`; it uses the real services instead. This package is ported to that model:

| layer | file | does what |
| --- | --- | --- |
| Host (Node) | `static/index.js` | ESM Cordis plugin exporting `name` + `apply(ctx, config)`. `ctx.inject(['webServer'], …)` mounts HTTP routes `/dsh-mcp/list`, `/dsh-mcp/check`, `/dsh-mcp/save`. Uses real `node:fs` / `node:os` / `node:child_process`. |
| Client (browser) | `static/client.js` | A `window.__ModuleLoader__.load({ id, factory })` bundle (only external is `react`). Registers `settings.section` via `ctx.slots.inject(...)` and `fetch()`es the host routes. |
| Bundle patch | `static/cordis.patch.yml` | `dsh.bundle.patch` → inserts `{ id: dsh-mcp-manage, name: 'dsh-mcp-manage' }` so the loader activates it. |
| Probe | `probe/dsh-mcp-probe.cjs` | Standalone real-MCP `initialize` handshake (official `@modelcontextprotocol/sdk`), self-terminating. |

### Host routes

| route | method | purpose |
| --- | --- | --- |
| `/dsh-mcp/list` | GET | list servers + the auto-detected profile patch path |
| `/dsh-mcp/check` | GET | run a real handshake per server → `{id, status, message}` each |
| `/dsh-mcp/save` | POST | persist the edited server list back to `cordis.patch.yml` (same-origin only) |

### Auto-detection (no hardcoded paths)

The host derives the runtime layout the same way the dynamic host did, but with real Node:

- `DSH_HOME` (an existing `.dsh` directory) **or** `HOME` → `<profilesRoot>`.
- `profilesRoot = <DSH_HOME>/profiles` (or `<HOME>/.dsh/profiles`).
- `SDK_ROOT = <profilesRoot>/node_modules`.
- `PATCH_PATH` = first `<profilesRoot>/<p>/cordis.patch.yml` whose content references `@deepseek-ai/dsh-mcp-client`;
  `PATCH_DIR` = its directory, where `dsh-mcp-probe.cjs` is written.

---

## Package manifest (what makes it a static, installable plugin)

`package.json` satisfies the exact contract the DSH client loader validates, so the package loads as a real static
plugin once installed (and would also be eligible for a plugin-market listing):

- `main` → `./static/index.js` (host entry artifact).
- `exports["./client"]` → `./static/client.js` (browser bundle).
- `dsh.client.platform: "web"` (+ optional `inject`).
- `dsh.bundle.patch` → `static/cordis.patch.yml`.
- `peerDependencies["@deepseek-ai/cordis"]` ≥ `^4.0.1`.

These match what `dshmarket` itself ships and what `dsh-client-modules` requires
(`parseDshClient` needs `platform:"web"`, `clientExportOf` needs `exports["./client"]`).

---

## Layout

```
dsh-mcp-manage/
├── package.json              # static-plugin manifest (dsh.bundle.patch + dsh.client.platform + main/exports)
├── README.md
├── LICENSE                   # MIT
├── static/
│   ├── index.js              # Host: ESM Cordis plugin → webServer routes list/check/save
│   ├── client.js             # Client: __ModuleLoader__.load bundle → Settings → MCP 服务 UI
│   └── cordis.patch.yml      # dsh.bundle.patch → inserts { id, name } into the composed entry list
├── probe/
│   └── dsh-mcp-probe.cjs     # Standalone real-MCP-initialize handshake
└── test-parse.js             # YAML-subset parse test used during development
```

> `plugin/` (the original **dynamic** `harness.handle`/`host.call` version) is kept in the git history for reference;
> the installable package uses `static/`. If you want the dynamic, session-only variant instead, see the
> `plugin/*.js` source in an earlier commit.

---

## Standalone probe (no DSH needed)

```bash
# stdio server
node probe/dsh-mcp-probe.cjs "{\"sdkRoot\":\"/abs/path/node_modules\",\"transport\":\"stdio\",\"command\":\"/abs/path/server\",\"args\":[\"stdio\"],\"env\":{\"TOKEN\":\"...\"},\"timeoutMs\":15000}"

# streamable-http server
node probe/dsh-mcp-probe.cjs "{\"sdkRoot\":\"/abs/path/node_modules\",\"transport\":\"streamable-http\",\"url\":\"https://host/mcp\",\"headers\":{\"Authorization\":\"Bearer ...\"},\"timeoutMs\":15000}"
```

`probe` is also wired as an npm script: `npm run probe -- "<spec-json>"`.

Credentials (e.g. `Authorization: Bearer …`, `GITHUB_PERSONAL_ACCESS_TOKEN`) go only into the probe process; the
result reports only `ok` / `name` / `ver` / `error`, never the headers.

---

## Acknowledgements

- [DeepSeek Harness][dsh] for the static-plugin load path (`dsh.bundle.patch` / `dsh.client` / `webServer` / client-modules).
- [Model Context Protocol SDK][mcp-sdk] (`@modelcontextprotocol/sdk`) for the real `initialize` handshake.
- [Cordis][cordis] for the plugin/event/service framework.

[dsh]: https://github.com/deepseek-ai/deepseek-harness
[cordis]: https://github.com/cordiverse/cordis
[mcp-sdk]: https://github.com/modelcontextprotocol/typescript-sdk
