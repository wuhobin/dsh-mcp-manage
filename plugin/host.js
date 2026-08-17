// dsh-mcp-manage — Host half (dynamic Cordis Plugin)
// Reads/writes the MCP servers registered in cordis.patch.yml and runs a real MCP initialize handshake per server.
// Runs in the DSH Node.js host process. Uses harness.handle (package-private JSON-RPC) and the fs/subprocess services.
const HELPER_SRC = `
const path = require('node:path');
const spec = JSON.parse(process.argv[2]);
const S = spec.sdkRoot;
function load(sub){ return require(path.join(S, '@modelcontextprotocol', 'sdk', 'dist', 'cjs', sub)); }
function out(o){ try { process.stdout.write('RESULT' + JSON.stringify(o) + String.fromCharCode(10)); } catch(e){} }
const hard = setTimeout(function(){ try { process.exit(2); } catch(e){} }, spec.timeoutMs || 15000);
(async function(){
  try {
    var Client = load('client/index.js').Client;
    var StdioClientTransport = load('client/stdio.js').StdioClientTransport;
    var StreamableHTTPClientTransport = load('client/streamableHttp.js').StreamableHTTPClientTransport;
    var client = new Client({ name: 'dsh-mcp-probe', version: '0.0.1' }, { capabilities: {} });
    var transport;
    if (spec.transport === 'stdio') {
      var env = Object.assign({}, spec.env || {});
      transport = new StdioClientTransport({ command: spec.command, args: spec.args || [], env: env, cwd: spec.cwd || void 0 });
    } else {
      var hdrs = spec.headers || {};
      var init = {};
      if (Object.keys(hdrs).length) init.requestInit = { headers: hdrs };
      transport = new StreamableHTTPClientTransport(new URL(spec.url), init);
    }
    await client.connect(transport);
    var payload = { ok: true };
    if (client.getServerVersion) { try { var v = client.getServerVersion() || {}; if (v.name) payload.name = String(v.name); if (v.version !== undefined) payload.ver = String(v.version); } catch(e2){} }
    if (client.getServerInfo && payload.name === undefined) { try { var vi = client.getServerInfo() || {}; if (vi.name) payload.name = String(vi.name); if (vi.version !== undefined && payload.ver === undefined) payload.ver = String(vi.version); } catch(e2){} }
    clearTimeout(hard);
    out(payload);
    try { await client.close(); } catch(e3){}
    try { process.exit(0); } catch(e4){}
  } catch(e) {
    clearTimeout(hard);
    out({ ok: false, error: String((e && e.message) || e) });
    try { process.exit(1); } catch(e5){}
  }
})();
`

return {
  inject: ['fs'],
  async apply(ctx) {
    const fs = ctx.fs
    const subprocess = ctx.get('subprocess')
    const CLIENT_NAME = '@deepseek-ai/dsh-mcp-client'

    // ---- Auto-detect runtime paths (no hardcoded absolute paths) ----
    // The dynamic Host sandbox exposes no process/env, so we derive $HOME by
    // spawning a tiny `node -e` and reading its stdout (same spawn pattern the
    // probe uses). Everything else derives from $HOME:
    //   SDK_ROOT   = $HOME/.dsh/profiles/node_modules   (holds @modelcontextprotocol/sdk + zod + dsh-mcp-client)
    //   patch      = first $HOME/.dsh/profiles/<p>/cordis.patch.yml that references the mcp-client package
    function dirOf(p) { const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')); return i > 0 ? p.slice(0, i) : p }
    async function detectHome() {
      if (!subprocess) return ''
      let nodeExe = null
      try { nodeExe = await subprocess.resolveExecutable('node', {}) } catch (e) { nodeExe = null }
      if (!nodeExe) return ''
      const code = 'process.stdout.write(String(process.env.HOME||process.env.USERPROFILE||""))'
      try {
        const h = subprocess.spawn({ argv: [nodeExe, '-e', code], stdio: { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 8192 } }, graceMs: 3000 })
        await h.done
        const r = h.collected && h.collected.stdout ? h.collected.stdout.readFrom(0) : null
        return (r && r.text) ? r.text.replace(/[\r\n]+$/, '').trim() : ''
      } catch (e) { return '' }
    }
    async function locatePatch(profilesRoot) {
      let dirTarget = null
      try { dirTarget = await fs.resolve(profilesRoot) } catch (e) { return '' }
      let entries = []
      try { entries = await fs.listDir(dirTarget) } catch (e) { return '' }
      let fallback = ''
      for (const e of entries) {
        const en = (e && (typeof e.name === 'string' ? e.name : String((e.path) || ''))) || ''
        if (!en) continue
        const yml = profilesRoot + '/' + en + '/cordis.patch.yml'
        let ok = false
        try { const t = await fs.resolve(yml); ok = !!t } catch (e) { ok = false }
        if (!ok) continue
        if (!fallback) fallback = yml
        try { const c = await fs.readText(await fs.resolve(yml)); if (c.indexOf(CLIENT_NAME) >= 0) return yml } catch (e) {}
      }
      return fallback
    }
    const home = await detectHome()
    const profilesRoot = home ? home + '/.dsh/profiles' : ''
    // Absolute path to a node_modules tree containing @modelcontextprotocol/sdk (>=1.30) + zod (hoisted).
    const SDK_DIR = profilesRoot ? (profilesRoot + '/node_modules') : ''
    const PATCH_PATH = profilesRoot ? await locatePatch(profilesRoot) : ''
    const PATCH_DIR = PATCH_PATH ? dirOf(PATCH_PATH) : (home ? home + '/.dsh/profiles' : '')
    const PROBE_FILE = PATCH_DIR ? (PATCH_DIR + '/dsh-mcp-probe.cjs') : ''
    // Write the standalone probe helper used for connection checks (survives a plugin restart).
    try { const ft = await fs.resolve(PROBE_FILE); await fs.writeText(ft, HELPER_SRC) } catch (e) {}

    function indentOf(line) { const m = line.match(/^\s*/); return m ? m[0].length : 0 }
    function stripInlineComment(s) { const i = s.search(/\s+#/); return i >= 0 ? s.slice(0, i) : s }
    function _isScalar(v) { if (v === null || v === undefined) return true; if (typeof v !== 'object') return true; if (v && v.__jsExpr !== undefined) return true; return false }
    function parseScalar(s_) {
      let v = stripInlineComment(String(s_).trim())
      if (v === '' || v === 'null' || v === '~') return null
      if (v === 'true') return true
      if (v === 'false') return false
      if (/^-?\d+$/.test(v)) return Number(v)
      if (/^-?\d+\.\d+$/.test(v)) return Number(v)
      if (/^\[.*\]$/.test(v)) { const inner = v.slice(1, -1).trim(); if (inner === '') return []; if (!/[,'"]/.test(inner) && inner.indexOf(':') < 0) return inner.split(/\s+/).filter(Boolean).map(x => parseScalar(x)); return inner.split(',').map(x => parseScalar(x)).filter(x => x !== null) }
      if (/^!!js\s+/.test(v)) return { __jsExpr: v.replace(/^!!js\s+/, '') }
      if ((v[0] === "'" && v[v.length - 1] === "'") || (v[0] === '"' && v[v.length - 1] === '"')) {
        let body = v.slice(1, -1)
        if (v[0] === "'") body = body.replace(/''/g, "'")
        else if (v[0] === '"') body = body.replace(/\\"/g, '"').replace(/\\n/g, '\n')
        return body
      }
      return v
    }
    function skipNoise(lines, i, n) { while (i < n && (lines[i].trim() === '' || /^\s*#/.test(lines[i]))) i++; return i }
    function parseMap(lines, i, ind, n) {
      const obj = {}
      while (i < n) {
        const l = lines[i]; if (l.trim() === '' || /^\s*#/.test(l)) { i++; continue }
        const lind = indentOf(l); if (lind < ind || lind !== ind) break; const t = l.trim(); if (t.startsWith('- ')) break
        const m = t.match(/^([^:]+):\s*(.*)$/); if (!m) { i++; continue }
        const key = m[1].trim(), rest = m[2]
        if (rest === '') {
          const k = skipNoise(lines, i + 1, n)
          if (k < n && indentOf(lines[k]) > ind) { const sl = lines[k]; const r = sl.trim().startsWith('- ') ? parseSeq(lines, k, indentOf(sl), n) : parseMap(lines, k, indentOf(sl), n); obj[key] = r.value; i = r.next } else { obj[key] = null; i++ }
        } else { obj[key] = parseScalar(rest); i++ }
      }
      return { value: obj, next: i }
    }
    function parseSeq(lines, i, ind, n) {
      const arr = []
      while (i < n) {
        const l = lines[i]; const dashInd = indentOf(l)
        if (indentOf(l) !== ind || (l.trim().startsWith('- ') === false && l.trim() !== '-')) break
        const body = l.slice(dashInd).replace(/^-[ ]?/, '')
        if (body === '') {
          const k = skipNoise(lines, i + 1, n)
          if (k < n && indentOf(lines[k]) > dashInd) { const sl = lines[k]; const r = sl.trim().startsWith('- ') ? parseSeq(lines, k, indentOf(sl), n) : parseMap(lines, k, indentOf(sl), n); arr.push(r.value); i = r.next } else { arr.push(null); i++ }
        } else {
          const m = body.match(/^([^:]+):\s*(.*)$/)
          if (m) {
            const item = {}, key = m[1].trim(), rest = m[2]
            if (rest === '') {
              const k = skipNoise(lines, i + 1, n)
              if (k < n && indentOf(lines[k]) > dashInd) { const sl = lines[k]; const r = sl.trim().startsWith('- ') ? parseSeq(lines, k, indentOf(sl), n) : parseMap(lines, k, indentOf(sl), n); item[key] = r.value; i = r.next } else { item[key] = null; i++ }
            } else { item[key] = parseScalar(rest); i++ }
            const k2 = skipNoise(lines, i, n)
            if (k2 < n && indentOf(lines[k2]) === dashInd + 2 && lines[k2].trim().startsWith('- ') === false && lines[k2].trim() !== '-') { const r2 = parseMap(lines, k2, dashInd + 2, n); for (const kk of Object.keys(r2.value)) item[kk] = r2.value[kk]; i = r2.next }
            arr.push(item)
          } else { arr.push(parseScalar(body)); i++ }
        }
      }
      return { value: arr, next: i }
    }
    function yamlScalar(v) {
      if (v === null || v === undefined) return 'null'
      if (typeof v === 'boolean' || typeof v === 'number') return String(v)
      if (v && v.__jsExpr !== undefined) return '!!js ' + v.__jsExpr
      const s = String(v); if (s === '') return "''"
      if (/[#\-? :\[\]\{\},&*!|>"'%@`]/.test(s) || /^\s/.test(s) || /^[-0-9]/.test(s)) return "'" + s.replace(/'/g, "''") + "'"
      return s
    }
    function yamlKey(k) { return /^[A-Za-z0-9_]+$/.test(k) ? k : "'" + k.replace(/'/g, "''") + "'" }
    function dumpValue(v, pad) {
      const out = []
      if (v && typeof v === 'object' && !Array.isArray(v) && v.__jsExpr !== undefined) { out.push(pad + '!!js ' + v.__jsExpr); return out }
      if (Array.isArray(v)) {
        if (v.length === 0) { out.push(pad + '[]'); return out }
        if (v.every(_isScalar)) { out.push(pad + '[' + v.map(yamlScalar).join(', ') + ']'); return out }
        for (const item of v) { if (item && typeof item === 'object' && !Array.isArray(item) && item.__jsExpr !== undefined) out.push(pad + '- ' + '!!js ' + item.__jsExpr); else if (item && typeof item === 'object' && !Array.isArray(item)) out.push.apply(out, dumpMapItem(item, pad)); else out.push(pad + '- ' + yamlScalar(item)) }
        return out
      }
      if (v && typeof v === 'object') { out.push.apply(out, dumpMap(v, pad)); return out }
      out.push(pad + yamlScalar(v)); return out
    }
    function dumpMap(obj, pad) {
      const out = []
      for (const k of Object.keys(obj)) {
        const val = obj[k]
        if (_isScalar(val)) out.push(pad + yamlKey(k) + ': ' + yamlScalar(val))
        else if (Array.isArray(val)) { if (val.every(_isScalar)) out.push(pad + yamlKey(k) + ': [' + val.map(yamlScalar).join(', ') + ']'); else { out.push(pad + yamlKey(k) + ':'); out.push.apply(out, dumpValue(val, pad + '  ')) } }
        else { out.push(pad + yamlKey(k) + ':'); out.push.apply(out, dumpValue(val, pad + '  ')) }
      }
      return out
    }
    function dumpMapItem(item, pad) {
      const keys = Object.keys(item); if (keys.length === 0) return [pad + '-']
      const k = keys[0], val = item[k]
      if (_isScalar(val)) return [pad + '- ' + yamlKey(k) + ': ' + yamlScalar(val)]
      if (Array.isArray(val) && val.every(_isScalar)) return [pad + '- ' + yamlKey(k) + ': [' + val.map(yamlScalar).join(', ') + ']']
      return [pad + '- ' + yamlKey(k) + ':'].concat(dumpValue(val, pad + '  '))
    }
    function splitParts(content) {
      const lines = content.split(/\r?\n/); const n = lines.length; const parts = []; let i = 0; let pending = []
      const flushText = () => { if (pending.length) { parts.push({ kind: 'text', lines: pending.map(x => x) }); pending = [] } }
      while (i < n) {
        const l = lines[i]; const t = l.trim()
        if (t === '' || /^\s*#/.test(t)) { pending.push(l); i++; continue }
        if (t.startsWith('- insert')) {
          const block = [l]; i++
          while (i < n) { const cl = lines[i], ct = cl.trim(); if (ct.startsWith('-') && indentOf(cl) === 0 && !/^\s*#/.test(cl)) break; block.push(cl); i++ }
          let parsed = null; try { parsed = parseSeq(block, 0, indentOf(block[0]), block.length).value } catch (e) { parsed = null }
          let row = null; if (Array.isArray(parsed)) { for (const it of parsed) { if (it && Array.isArray(it.insert) && it.insert.length) { row = it.insert[0]; break } } }
          const name = row && typeof row.name === 'string' ? row.name : null
          if (row && name === CLIENT_NAME) { flushText(); parts.push({ kind: 'mcp', server: normalizeServer(row.config || {}, row.id), raw: block.join('\n') }) }
          else { flushText(); parts.push({ kind: 'text', lines: block }) }
        } else { pending.push(l); i++ }
      }
      flushText(); return parts
    }
    function normalizeServer(cfg, id) {
      const rec = { id: id || cfg.serverName || '', serverName: cfg.serverName || id || '', transport: (cfg.transport === 'streamable-http') ? 'streamable-http' : 'stdio' }
      if (rec.transport === 'streamable-http') { rec.url = cfg.url || ''; if (cfg.headers && typeof cfg.headers === 'object') rec.headers = cloneMap(cfg.headers) }
      else { rec.command = cfg.command || ''; rec.args = Array.isArray(cfg.args) ? cfg.args.map(toStr) : []; if (cfg.cwd) rec.cwd = toStr(cfg.cwd); if (cfg.env && typeof cfg.env === 'object') rec.env = cloneMap(cfg.env) }
      if (typeof cfg.toolCallTimeoutMs === 'number') rec.toolCallTimeoutMs = cfg.toolCallTimeoutMs
      if (typeof cfg.failOnStartupError === 'boolean') rec.failOnStartupError = cfg.failOnStartupError
      if (cfg.reconnect && typeof cfg.reconnect === 'object') rec.reconnect = cfg.reconnect
      return rec
    }
    function cloneMap(o) { const out = {}; for (const k of Object.keys(o)) { const v = o[k]; out[k] = (v && typeof v === 'object' && v.__jsExpr !== undefined) ? { __jsExpr: v.__jsExpr } : toStr(v) } return out }
    function toStr(v) { return String(v === null || v === undefined ? '' : v) }
    function deepEqual(a, b) {
      if (a === b) return true
      if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
      const ak = Object.keys(a), bk = Object.keys(b); if (ak.length !== bk.length) return false
      for (const k of ak) { if (!(k in b)) return false; if (!deepEqual(a[k], b[k])) return false }; return true
    }
    function buildConfig(rec) {
      const cfg = { serverName: rec.serverName, transport: rec.transport }
      if (rec.transport === 'streamable-http') { if (rec.url) cfg.url = rec.url; if (rec.headers && Object.keys(rec.headers).length) cfg.headers = rec.headers }
      else { if (rec.command) cfg.command = rec.command; if (Array.isArray(rec.args) && rec.args.length) cfg.args = rec.args; if (rec.cwd) cfg.cwd = rec.cwd; if (rec.env && Object.keys(rec.env).length) cfg.env = rec.env }
      if (typeof rec.toolCallTimeoutMs === 'number') cfg.toolCallTimeoutMs = rec.toolCallTimeoutMs
      if (typeof rec.failOnStartupError === 'boolean') cfg.failOnStartupError = rec.failOnStartupError
      if (rec.reconnect && typeof rec.reconnect === 'object' && Object.keys(rec.reconnect).length) cfg.reconnect = rec.reconnect
      return cfg
    }
    function serializeServer(server) {
      const out = ['- insert:', '    - id: ' + yamlScalar(server.id), "      name: '" + CLIENT_NAME + "'", '      config:']
      out.push.apply(out, dumpMap(buildConfig(server), '        ')); return out.join('\n')
    }
    function partToText(p) { return p.kind === 'text' ? p.lines.join('\n') : (typeof p.raw === 'string' ? p.raw : serializeServer(p.server)) }
    async function readParts() {
      if (!PATCH_PATH) return { exists: false, parts: [], detectError: '未能自动定位 cordis.patch.yml（未找到 $HOME/.dsh/profiles/*/cordis.patch.yml）' }
      const target = await fs.resolve(PATCH_PATH); const info = await fs.stat(target)
      if (!info) return { exists: false, parts: [] }
      const content = await fs.readText(target); return { exists: true, parts: splitParts(content) }
    }
    function toListResult(parts) {
      const entries = []
      for (const p of parts) { if (p.kind !== 'mcp') continue; const s = p.server; const out = { id: s.id, serverName: s.serverName, transport: s.transport }
        if (s.command) out.command = s.command; if (Array.isArray(s.args) && s.args.length) out.args = s.args; if (s.cwd) out.cwd = s.cwd
        if (s.env && Object.keys(s.env).length) out.env = s.env; if (s.url) out.url = s.url; if (s.headers && Object.keys(s.headers).length) out.headers = s.headers
        if (typeof s.toolCallTimeoutMs === 'number') out.toolCallTimeoutMs = s.toolCallTimeoutMs
        if (typeof s.failOnStartupError === 'boolean') out.failOnStartupError = s.failOnStartupError
        if (s.reconnect && typeof s.reconnect === 'object') out.reconnect = s.reconnect
        entries.push(out) }
      return entries
    }
    function trunc(x) { x = String(x); return x.length > 180 ? x.slice(0, 177) + '…' : x }

    // Run a real MCP initialize handshake for one server via a node subprocess running the probe helper.
    async function checkOne(s) {
      const subp = ctx.get('subprocess')
      if (subp === undefined) return { status: 'unknown', message: 'subprocess 服务不可用，无法建立连接' }
      if (!PROBE_FILE || !SDK_DIR) return { status: 'error', message: '未能自动定位 SDK 或探测脚本，无法握手' }
      let nodeExe = null
      try { nodeExe = await subp.resolveExecutable('node', {}) } catch (e) { nodeExe = null }
      if (!nodeExe) return { status: 'error', message: '无法定位 node 可执行文件，无法握手' }
      const spec = { sdkRoot: SDK_DIR, transport: s.transport, command: s.command || '', args: s.args || [], env: s.env || {}, cwd: s.cwd || void 0, url: s.url || '', headers: s.headers || {}, timeoutMs: 15000 }
      let handle
      try {
        handle = subp.spawn({ argv: [nodeExe, PROBE_FILE, JSON.stringify(spec)], cwd: PATCH_DIR, stdio: { stdin: 'ignore', stdout: { maxBytes: 16384 }, stderr: { maxBytes: 16384 } }, graceMs: 4000 })
      } catch (e) { return { status: 'error', message: '启动探测失败：' + trunc(String((e && e.message) || e)) } }
      let outcome
      try { outcome = await handle.done } catch (e) { return { status: 'error', message: '探测进程异常：' + trunc(String((e && e.message) || e)) } }
      let text = ''
      try { const r = handle.collected && handle.collected.stdout ? handle.collected.stdout.readFrom(0) : null; if (r && r.text) text = r.text } catch (e) {}
      const m = (text || '').match(/RESULT\s*=?(\{.*\})/)
      if (m) { let j = null; try { j = JSON.parse(m[1]) } catch (e) { j = null }
        if (j && j.ok === true) {
          const nm = (j.name && String(j.name)) || ''
          const ver = (j.ver != null && String(j.ver)) || ''
          const label = nm ? '已握手：' + nm : '已建立连接'
          return { status: 'ok', message: ver ? (label + ' · ' + ver) : label }
        }
        return { status: 'error', message: trunc((j && j.error) || (text || '握手失败')) }
      }
      if (outcome && outcome.exitCode === 2) return { status: 'error', message: '握手超时（15s）' }
      if (outcome && outcome.exitCode === 0) return { status: 'reachable', message: '进程已退出但未返回握手结果' }
      return { status: 'error', message: trunc(text || ('退出码 ' + String(outcome ? outcome.exitCode : '?'))) }
    }

    // List the MCP servers from cordis.patch.yml.
    harness.handle('mcp/list', async () => {
      try { const { exists, parts, detectError } = await readParts(); const entries = toListResult(parts); if (detectError) return { ok: false, exists: false, path: PATCH_PATH, entries: [], error: detectError }
        return { ok: true, exists, path: PATCH_PATH, entries, entryCount: entries.length } }
      catch (e) { return { ok: false, exists: false, path: PATCH_PATH, entries: [], error: String((e && e.message) || e) } }
    })

    // Real connection handshake for every server.
    harness.handle('mcp/check', async () => {
      try { const { parts } = await readParts(); const results = []
        for (const p of parts) { if (p.kind !== 'mcp') continue; const s = p.server; const c = await checkOne(s); results.push({ id: s.id, serverName: s.serverName, transport: s.transport, status: c.status, message: c.message }) }
        return { ok: true, results }
      } catch (e) { return { ok: false, results: [], error: String((e && e.message) || e) } }
    })

    // Persist the edited server list back to cordis.patch.yml.
    harness.handle('mcp/save', async (args) => {
      const input = (args && Array.isArray(args.entries)) ? args.entries : null
      if (!input) return { ok: false, error: 'entries is required' }
      try {
        const { exists, parts } = await readParts(); const byId = {}; for (const p of parts) if (p.kind === 'mcp') byId[p.server.id] = p
        const seen = new Set(); const normalizedList = []
        for (const rec of input) { if (!rec || typeof rec !== 'object') continue; const rid = toStr(rec.id).trim(), sr = toStr(rec.serverName).trim(); if (!rid || !sr) continue; seen.add(rid); seen.add(sr); const n = normalizeServer(configFromRecord(rec), rid); n.id = rid; normalizedList.push(n) }
        const emitted = []
        for (const p of parts) { if (p.kind === 'text') { emitted.push(p); continue }; const n = normalizedList.find(x => x.id === p.server.id); if (!n) continue; const old = byId[n.id]; if (old && deepEqual(n, old.server)) emitted.push({ kind: 'mcp', server: old.server, raw: old.raw }); else emitted.push({ kind: 'mcp', server: n, raw: null }) }
        const emittedIds = new Set(emitted.filter(p => p.kind === 'mcp').map(p => p.server.id))
        for (const n of normalizedList) if (!emittedIds.has(n.id)) emitted.push({ kind: 'mcp', server: n, raw: null })
        const out = emitted.map(partToText).join('\n'); const target = await fs.resolve(PATCH_PATH); await fs.writeText(target, out)
        return { ok: true, path: PATCH_PATH, entries: toListResult(emitted) }
      } catch (e) { return { ok: false, error: String((e && e.message) || e) } }
    })

    function configFromRecord(rec) {
      const cfg = { serverName: rec.serverName, transport: rec.transport }
      if (rec.transport === 'streamable-http') { if (rec.url) cfg.url = rec.url; if (rec.headers && Object.keys(rec.headers).length) cfg.headers = rec.headers }
      else { if (rec.command) cfg.command = rec.command; if (Array.isArray(rec.args) && rec.args.length) cfg.args = rec.args.map(toStr); if (rec.cwd) cfg.cwd = rec.cwd; if (rec.env && Object.keys(rec.env).length) cfg.env = rec.env }
      if (typeof rec.toolCallTimeoutMs === 'number') cfg.toolCallTimeoutMs = rec.toolCallTimeoutMs
      if (typeof rec.failOnStartupError === 'boolean') cfg.failOnStartupError = rec.failOnStartupError
      if (rec.reconnect && typeof rec.reconnect === 'object' && Object.keys(rec.reconnect).length) cfg.reconnect = rec.reconnect
      return cfg
    }
  }
}
