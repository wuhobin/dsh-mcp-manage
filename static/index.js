// dsh-mcp-manage — STATIC host half (ESM Cordis plugin)
// A real, installable DSH plugin. Runs in the normal (non-sandbox) host plane:
// real process, node:fs, node:os, node:child_process, ctx, ctx.inject(['webServer']).
// Mounts HTTP routes that list / probe / edit the MCP servers registered in
// cordis.patch.yml. The browser (static client bundle) fetches these routes.
//
// Package contract satisfied for the DSH market (dshmarket):
//   - ESM module exporting `name` + `apply(ctx, config)`
//   - package.json `main` -> this file (entry artifact)
//   - `dsh` manifest (bundle.patch / client) -> hasDshManifest

import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, sep } from 'node:path'
import { spawn } from 'node:child_process'

export const name = 'dsh-mcp-manage'

const CLIENT_NAME = '@deepseek-ai/dsh-mcp-client'

// ---- Auto-detection (normal Node, so this is simpler than the dynamic host) ----
// DSH_HOME already IS the `.dsh` directory (~/.dsh). HOME is the user home.
// Profiles live under <DSH_HOME>/profiles (or ~/.dsh/profiles when no DSH_HOME).
function profilesRootOf() {
  if (process.env.DSH_HOME) return join(process.env.DSH_HOME, 'profiles')
  const home = process.env.HOME || homedir()
  return home ? join(home, '.dsh', 'profiles') : ''
}
function dirOf(p) {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i > 0 ? p.slice(0, i) : p
}
function locatePatch(profilesRoot) {
  let entries = []
  try { entries = readdirSync(profilesRoot, { withFileTypes: true }) } catch (e) { entries = [] }
  let fallback = ''
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const yml = join(profilesRoot, e.name, 'cordis.patch.yml')
    if (!existsSync(yml)) continue
    if (!fallback) fallback = yml
    try { if (readFileSync(yml, 'utf8').includes(CLIENT_NAME)) return yml } catch (err) { /* keep scanning */ }
  }
  return fallback
}
function resolvePaths() {
  const profilesRoot = profilesRootOf()
  const PATCH_PATH = profilesRoot ? locatePatch(profilesRoot) : ''
  const SDK_DIR = join(profilesRoot || '', 'node_modules')
  const PATCH_DIR = PATCH_PATH ? dirOf(PATCH_PATH) : profilesRoot
  return { PATCH_PATH, PATCH_DIR, SDK_DIR, profilesRoot }
}

// ---- tiny YAML subset (only what cordis.patch.yml MCP entries need) ----
function indentOf(line) { const m = line.match(/^\s*/); return m ? m[0].length : 0 }
function stripInlineComment(s) { const i = s.search(/\s+#/); return i >= 0 ? s.slice(0, i) : s }
function _isScalar(v) { if (v === null || v === undefined) return true; if (typeof v !== 'object') return true; if (v && v.__jsExpr !== undefined) return true; return false }
function parseScalar(s_) {
  let v = stripInlineComment(String(s_).trim())
  if (v === '' || v === 'null' || v === '~') return null
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
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
  if (/[#\-? :\[\]\{\},&*!|>\"'%@`]/.test(s) || /^\s/.test(s) || /^[-0-9]/.test(s)) return "'" + s.replace(/'/g, "''") + "'"
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
      const nam = row && typeof row.name === 'string' ? row.name : null
      if (row && nam === CLIENT_NAME) { flushText(); parts.push({ kind: 'mcp', server: normalizeServer(row.config || {}, row.id), raw: block.join('\n') }) }
      else { flushText(); parts.push({ kind: 'text', lines: block }) }
    } else { pending.push(l); i++ }
  }
  flushText(); return parts
}
function normalizeServer(cfg, id) {
  const dic = { id: id || cfg.serverName || '', serverName: cfg.serverName || id || '', transport: (cfg.transport === 'streamable-http') ? 'streamable-http' : 'stdio' }
  if (dic.transport === 'streamable-http') { dic.url = cfg.url || ''; if (cfg.headers && typeof cfg.headers === 'object') dic.headers = cloneMap(cfg.headers) }
  else { dic.command = cfg.command || ''; dic.args = Array.isArray(cfg.args) ? cfg.args.map(toStr) : []; if (cfg.cwd) dic.cwd = toStr(cfg.cwd); if (cfg.env && typeof cfg.env === 'object') dic.env = cloneMap(cfg.env) }
  if (typeof cfg.toolCallTimeoutMs === 'number') dic.toolCallTimeoutMs = cfg.toolCallTimeoutMs
  if (typeof cfg.failOnStartupError === 'boolean') dic.failOnStartupError = cfg.failOnStartupError
  if (cfg.reconnect && typeof cfg.reconnect === 'object') dic.reconnect = cfg.reconnect
  return dic
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
function readParts(paths) {
  if (!paths.PATCH_PATH || !existsSync(paths.PATCH_PATH)) {
    return { exists: false, parts: [], detectError: '未能自动定位 cordis.patch.yml（未找到 ' + CLIENT_NAME + ' 引用的 profile patch）' }
  }
  const content = readFileSync(paths.PATCH_PATH, 'utf8')
  return { exists: true, parts: splitParts(content) }
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
function configFromRecord(rec) {
  const cfg = { serverName: rec.serverName, transport: rec.transport }
  if (rec.transport === 'streamable-http') { if (rec.url) cfg.url = rec.url; if (rec.headers && Object.keys(rec.headers).length) cfg.headers = rec.headers }
  else { if (rec.command) cfg.command = rec.command; if (Array.isArray(rec.args) && rec.args.length) cfg.args = rec.args.map(toStr); if (rec.cwd) cfg.cwd = rec.cwd; if (rec.env && Object.keys(rec.env).length) cfg.env = rec.env }
  if (typeof rec.toolCallTimeoutMs === 'number') cfg.toolCallTimeoutMs = rec.toolCallTimeoutMs
  if (typeof rec.failOnStartupError === 'boolean') cfg.failOnStartupError = rec.failOnStartupError
  if (rec.reconnect && typeof rec.reconnect === 'object' && Object.keys(rec.reconnect).length) cfg.reconnect = rec.reconnect
  return cfg
}
function trunc(x) { x = String(x); return x.length > 180 ? x.slice(0, 177) + '…' : x }

// ---- probe helper written next to the patch (same proven logic as the dynamic plugin) ----
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

// ---- real MCP initialize handshake via node subprocess + probe ----
function checkOne(s, paths) {
  return new Promise((resolve) => {
    const PROBE_FILE = join(paths.PATCH_DIR || '', 'dsh-mcp-probe.cjs')
    try { writeFileSync(PROBE_FILE, HELPER_SRC) } catch (e) { /* best effort */ }
    if (!existsSync(PROBE_FILE) || !existsSync(join(paths.SDK_DIR, '@modelcontextprotocol'))) {
      return resolve({ status: 'error', message: '未能自动定位 SDK 或探测脚本，无法握手' })
    }
    const spec = { sdkRoot: paths.SDK_DIR, transport: s.transport, command: s.command || '', args: s.args || [], env: s.env || {}, cwd: s.cwd || void 0, url: s.url || '', headers: s.headers || {}, timeoutMs: 15000 }
    let child
    try {
      child = spawn(process.execPath, [PROBE_FILE, JSON.stringify(spec)], { cwd: paths.PATCH_DIR, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) { return resolve({ status: 'error', message: '启动探测失败：' + trunc(String((e && e.message) || e)) }) }
    let text = ''
    const done = () => {
      const m = (text || '').match(/RESULT\s*=?(\{.*\})/)
      if (m) { let j = null; try { j = JSON.parse(m[1]) } catch (e) { j = null }
        if (j && j.ok === true) {
          const nm = (j.name && String(j.name)) || ''
          const ver = (j.ver != null && String(j.ver)) || ''
          const label = nm ? '已握手：' + nm : '已建立连接'
          return resolve({ status: 'ok', message: ver ? (label + ' · ' + ver) : label })
        }
        return resolve({ status: 'error', message: trunc((j && j.error) || (text || '握手失败')) })
      }
      if (code === 2) return resolve({ status: 'error', message: '握手超时（15s）' })
      if (code === 0) return resolve({ status: 'reachable', message: '进程已退出但未返回握手结果' })
      return resolve({ status: 'error', message: trunc(text || ('退出码 ' + String(code))) })
    }
    let code = null
    child.stdout.on('data', (d) => { text += String(d) })
    child.on('error', (e) => { code = -1; return resolve({ status: 'error', message: '探测进程异常：' + trunc(String((e && e.message) || e)) }) })
    child.on('close', (c) => { code = c; done() })
    setTimeout(() => { if (code === null) { try { child.kill() } catch (e) {} code = 2; done() } }, 16000)
  })
}

function sendJson(response, status, obj) {
  const body = JSON.stringify(obj)
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': 'same-origin', 'cache-control': 'no-store' })
  response.end(body)
}
function readBody(request) {
  return new Promise((resolve) => {
    let data = ''
    request.on('data', (d) => { data += String(d); if (data.length > 1e6) request.destroy() })
    request.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { resolve({}) } })
    request.on('error', () => resolve({}))
  })
}
function sameOrigin(request) {
  const origin = request.headers.origin
  const host = request.headers.host
  if (typeof origin !== 'string' || typeof host !== 'string') return false
  try { return new URL(origin).host === host.split(':')[0] } catch (e) { return false }
}

export function apply(ctx, config) {
  ctx.inject(['webServer'], (hostCtx) => {
    const webServer = hostCtx.webServer

    const listRoute = webServer.register({
      kind: 'exact',
      path: '/dsh-mcp/list',
      handler: async (request, response) => {
        if (request.method !== 'GET') { response.writeHead(405, { allow: 'GET' }); response.end(); return }
        try {
          const paths = resolvePaths()
          const { exists, parts, detectError } = readParts(paths)
          const entries = toListResult(parts)
          if (detectError) return sendJson(response, 200, { ok: false, exists: false, path: paths.PATCH_PATH, entries: [], error: detectError })
          return sendJson(response, 200, { ok: true, exists, path: paths.PATCH_PATH, entries, entryCount: entries.length })
        } catch (e) { return sendJson(response, 500, { ok: false, path: resolvePaths().PATCH_PATH, entries: [], error: String((e && e.message) || e) }) }
      },
    })

    const checkRoute = webServer.register({
      kind: 'exact',
      path: '/dsh-mcp/check',
      handler: async (request, response) => {
        if (request.method !== 'GET') { response.writeHead(405, { allow: 'GET' }); response.end(); return }
        try {
          const paths = resolvePaths()
          const { parts } = readParts(paths)
          const results = []
          for (const p of parts) { if (p.kind !== 'mcp') continue; const s = p.server; const c = await checkOne(s, paths); results.push({ id: s.id, serverName: s.serverName, transport: s.transport, status: c.status, message: c.message }) }
          return sendJson(response, 200, { ok: true, results })
        } catch (e) { return sendJson(response, 500, { ok: false, results: [], error: String((e && e.message) || e) }) }
      },
    })

    const saveRoute = webServer.register({
      kind: 'exact',
      path: '/dsh-mcp/save',
      handler: async (request, response) => {
        if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return }
        if (!sameOrigin(request)) { sendJson(response, 403, { error: 'untrusted origin' }); return }
        try {
          const body = await readBody(request)
          const input = (body && Array.isArray(body.entries)) ? body.entries : null
          if (!input) return sendJson(response, 400, { ok: false, error: 'entries is required' })
          const paths = resolvePaths()
          const { exists, parts } = readParts(paths)
          if (!exists) return sendJson(response, 400, { ok: false, error: parts.detectError || 'patch not found' })
          const byId = {}; for (const p of parts) if (p.kind === 'mcp') byId[p.server.id] = p
          const seen = new Set(); const normalizedList = []
          for (const rec of input) { if (!rec || typeof rec !== 'object') continue; const rid = toStr(rec.id).trim(), sr = toStr(rec.serverName).trim(); if (!rid || !sr) continue; seen.add(rid); seen.add(sr); const n = normalizeServer(configFromRecord(rec), rid); n.id = rid; normalizedList.push(n) }
          const emitted = []
          for (const p of parts) { if (p.kind === 'text') { emitted.push(p); continue }; const n = normalizedList.find(x => x.id === p.server.id); if (!n) continue; const old = byId[n.id]; if (old && deepEqual(n, old.server)) emitted.push({ kind: 'mcp', server: old.server, raw: old.raw }); else emitted.push({ kind: 'mcp', server: n, raw: null }) }
          const emittedIds = new Set(emitted.filter(p => p.kind === 'mcp').map(p => p.server.id))
          for (const n of normalizedList) if (!emittedIds.has(n.id)) emitted.push({ kind: 'mcp', server: n, raw: null })
          const out = emitted.map(partToText).join('\n')
          writeFileSync(paths.PATCH_PATH, out)
          return sendJson(response, 200, { ok: true, path: paths.PATCH_PATH, entries: toListResult(emitted) })
        } catch (e) { return sendJson(response, 500, { ok: false, error: String((e && e.message) || e) }) }
      },
    })

    return () => { listRoute(); checkRoute(); saveRoute() }
  })
}
