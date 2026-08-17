// Standalone validation of the MCP patch YAML parser used by the plugin.
// Run: node test-parse.js  (must be run with cwd = this project dir, file path hardcoded below)
const fs_node = require('fs')
const PATCH_PATH = 'C:/Users/12890/.dsh/profiles/web/cordis.patch.yml'
const content = fs_node.readFileSync(PATCH_PATH, 'utf8')

// ---- copy of host parser ----
const CLIENT_NAME = '@deepseek-ai/dsh-mcp-client'
function indentOf(line){const m=line.match(/^\s*/);return m?m[0].length:0}
function stripInlineComment(s){const i=s.search(/\s+#/);return i>=0?s.slice(0,i):s}
function _isScalar(v){if(v===null||v===undefined)return true;if(typeof v!=='object')return true;if(v.__jsExpr!==undefined)return true;return false}
function parseScalar(s_){let v=stripInlineComment(String(s_).trim());if(v===''||v==='null'||v==='~')return null;if(v==='true')return true;if(v==='false')return false;if(/^-?\d+$/.test(v))return Number(v);if(/^-?\d+\.\d+$/.test(v))return Number(v);if(/^\[.*\]$/.test(v)){const inner=v.slice(1,-1).trim();if(inner==='')return[];if(!/[,'"]/.test(inner)&&inner.indexOf(':')<0)return inner.split(/\s+/).filter(Boolean).map(x=>parseScalar(x));return inner.split(',').map(x=>parseScalar(x)).filter(x=>x!==null)}if(/^!!js\s+/.test(v))return{__jsExpr:v.replace(/^!!js\s+/,'')};if(v[0]==="'"&&v[v.length-1]==="'"||v[0]==='"'&&v[v.length-1]==='"'){let body=v.slice(1,-1);if(v[0]==="'")body=body.replace(/''/g,"'");else if(v[0]==='"')body=body.replace(/\\"/g,'"').replace(/\\n/g,'\n');return body}return v}
function skipNoise(lines,i,n){while(i<n&&(lines[i].trim()===''||/^\s*#/.test(lines[i])))i++;return i}
function parseMap(lines,i,ind,n){const obj={};while(i<n){const l=lines[i];if(l.trim()===''||/^\s*#/.test(l)){i++;continue}const lind=indentOf(l);if(lind<ind||lind!==ind)break;const t=l.trim();if(t.startsWith('- '))break;const m=t.match(/^([^:]+):\s*(.*)$/);if(!m){i++;continue}const key=m[1].trim(),rest=m[2];if(rest===''){const k=skipNoise(lines,i+1,n);if(k<n&&indentOf(lines[k])>ind){const sl=lines[k];const r=sl.trim().startsWith('- ')?parseSeq(lines,k,indentOf(sl),n):parseMap(lines,k,indentOf(sl),n);obj[key]=r.value;i=r.next}else{obj[key]=null;i++}}else{obj[key]=parseScalar(rest);i++}}return{value:obj,next:i}}
function parseSeq(lines,i,ind,n){const arr=[];while(i<n){const l=lines[i];const dashInd=indentOf(l);if(indentOf(l)!==ind||(l.trim().startsWith('- ')===false&&l.trim()!=='-'))break;const body=l.slice(dashInd).replace(/^-[ ]?/,'');if(body===''){const k=skipNoise(lines,i+1,n);if(k<n&&indentOf(lines[k])>dashInd){const sl=lines[k];const r=sl.trim().startsWith('- ')?parseSeq(lines,k,indentOf(sl),n):parseMap(lines,k,indentOf(sl),n);arr.push(r.value);i=r.next}else{arr.push(null);i++}}else{const m=body.match(/^([^:]+):\s*(.*)$/);if(m){const item={},key=m[1].trim(),rest=m[2];if(rest===''){const k=skipNoise(lines,i+1,n);if(k<n&&indentOf(lines[k])>dashInd){const sl=lines[k];const r=sl.trim().startsWith('- ')?parseSeq(lines,k,indentOf(sl),n):parseMap(lines,k,indentOf(sl),n);item[key]=r.value;i=r.next}else{item[key]=null;i++}}else{item[key]=parseScalar(rest);i++}const k2=skipNoise(lines,i,n);if(k2<n&&indentOf(lines[k2])===dashInd+2&&lines[k2].trim().startsWith('- ')===false&&lines[k2].trim()!=='-'){const r2=parseMap(lines,k2,dashInd+2,n);for(const kk of Object.keys(r2.value))item[kk]=r2.value[kk];i=r2.next}arr.push(item)}else{arr.push(parseScalar(body));i++}}}return{value:arr,next:i}}
function yamlScalar(v){if(v===null||v===undefined)return 'null';if(typeof v==='boolean'||typeof v==='number')return String(v);if(v&&v.__jsExpr!==undefined)return '!!js '+v.__jsExpr;const s=String(v);if(s==='')return "''";if(/[#\-? :\[\]\{\},&*!|>"'%@`]/.test(s)||/^\s/.test(s)||/^[-0-9]/.test(s))return "'"+s.replace(/'/g,"''")+"'";return s}
function yamlKey(k){return /^[A-Za-z0-9_]+$/.test(k)?k:"'"+k.replace(/'/g,"''")+"'"}
function dumpValue(v,pad){const out=[];if(v&&typeof v==='object'&&!Array.isArray(v)&&v.__jsExpr!==undefined){out.push(pad+'!!js '+v.__jsExpr);return out}if(Array.isArray(v)){if(v.length===0){out.push(pad+'[]');return out}if(v.every(_isScalar)){out.push(pad+'['+v.map(yamlScalar).join(', ')+']');return out}for(const item of v){if(item&&typeof item==='object'&&!Array.isArray(item)&&item.__jsExpr!==undefined)out.push(pad+'- '+'!!js '+item.__jsExpr);else if(item&&typeof item==='object'&&!Array.isArray(item))out.push.apply(out,dumpMapItem(item,pad));else out.push(pad+'- '+yamlScalar(item))}return out}if(v&&typeof v==='object'){out.push.apply(out,dumpMap(v,pad));return out}out.push(pad+yamlScalar(v));return out}
function dumpMap(obj,pad){const out=[];for(const k of Object.keys(obj)){const val=obj[k];if(_isScalar(val))out.push(pad+yamlKey(k)+': '+yamlScalar(val));else if(Array.isArray(val)){if(val.every(_isScalar))out.push(pad+yamlKey(k)+': ['+val.map(yamlScalar).join(', ')+']');else{out.push(pad+yamlKey(k)+':');out.push.apply(out,dumpValue(val,pad+'  '))}}else{out.push(pad+yamlKey(k)+':');out.push.apply(out,dumpValue(val,pad+'  '))}}return out}
function dumpMapItem(item,pad){const keys=Object.keys(item);if(keys.length===0)return[pad+'-'];const k=keys[0],val=item[k];if(_isScalar(val))return[pad+'- '+yamlKey(k)+': '+yamlScalar(val)];if(Array.isArray(val)&&val.every(_isScalar))return[pad+'- '+yamlKey(k)+': ['+val.map(yamlScalar).join(', ')+']'];const head=[pad+'- '+yamlKey(k)+':'];const rest=dumpValue(val,pad+'  ');return head.concat(rest)}
function splitParts(content){const lines=content.split(/\r?\n/);const n=lines.length;const parts=[];let i=0;let pending=[];const flushText=()=>{if(pending.length){parts.push({kind:'text',lines:pending.map(x=>x)});pending=[]}};while(i<n){const l=lines[i];const t=l.trim();if(t===''||/^\s*#/.test(t)){pending.push(l);i++;continue}if(t.startsWith('- insert')){const block=[l];i++;while(i<n){const cl=lines[i],ct=cl.trim();if((ct.startsWith('-')&&indentOf(cl)===0&&!/^\s*#/.test(cl)))break;block.push(cl);i++}let parsed=null;try{parsed=parseSeq(block,0,indentOf(block[0]),block.length).value}catch(e){parsed=null}let row=null;if(Array.isArray(parsed)){for(const it of parsed){if(it&&Array.isArray(it.insert)&&it.insert.length){row=it.insert[0];break}}}const name=row&&typeof row.name==='string'?row.name:null;if(row&&name===CLIENT_NAME){flushText();parts.push({kind:'mcp',server:normalizeServer(row.config||{},row.id),raw:block.join('\n')})}else{flushText();parts.push({kind:'text',lines:block})}}else{pending.push(l);i++}}flushText();return parts}
function normalizeServer(cfg,id){const rec={id:id||cfg.serverName||'',serverName:cfg.serverName||id||'',transport:(cfg.transport==='streamable-http')?'streamable-http':'stdio'};if(rec.transport==='streamable-http'){rec.url=cfg.url||'';if(cfg.headers&&typeof cfg.headers==='object')rec.headers=cloneMap(cfg.headers)}else{rec.command=cfg.command||'';rec.args=Array.isArray(cfg.args)?cfg.args.map(toStr):[];if(cfg.cwd)rec.cwd=toStr(cfg.cwd);if(cfg.env&&typeof cfg.env==='object')rec.env=cloneMap(cfg.env)}if(typeof cfg.toolCallTimeoutMs==='number')rec.toolCallTimeoutMs=cfg.toolCallTimeoutMs;if(typeof cfg.failOnStartupError==='boolean')rec.failOnStartupError=cfg.failOnStartupError;if(cfg.reconnect&&typeof cfg.reconnect==='object')rec.reconnect=cfg.reconnect;return rec}
function cloneMap(o){const out={};for(const k of Object.keys(o)){const v=o[k];out[k]=(v&&typeof v==='object'&&v.__jsExpr!==undefined)?{__jsExpr:v.__jsExpr}:toStr(v)}return out}
function toStr(v){return String(v===null||v===undefined?'':v)}
function buildConfig(rec){const cfg={serverName:rec.serverName,transport:rec.transport};if(rec.transport==='streamable-http'){if(rec.url)cfg.url=rec.url;if(rec.headers&&Object.keys(rec.headers).length)cfg.headers=rec.headers}else{if(rec.command)cfg.command=rec.command;if(Array.isArray(rec.args)&&rec.args.length)cfg.args=rec.args;if(rec.cwd)cfg.cwd=rec.cwd;if(rec.env&&Object.keys(rec.env).length)cfg.env=rec.env}if(typeof rec.toolCallTimeoutMs==='number')cfg.toolCallTimeoutMs=rec.toolCallTimeoutMs;if(typeof rec.failOnStartupError==='boolean')cfg.failOnStartupError=rec.failOnStartupError;if(rec.reconnect&&typeof rec.reconnect==='object'&&Object.keys(rec.reconnect).length)cfg.reconnect=rec.reconnect;return cfg}
function serializeServer(server){const out=['- insert:','    - id: '+yamlScalar(server.id),"      name: '"+CLIENT_NAME+"'",'      config:'];out.push.apply(out,dumpMap(buildConfig(server),'        '));return out.join('\n')}
function joinParts(parts){return parts.map(p=>p.kind==='text'?p.lines.join('\n'):serializeServer(p.server)).join('\n')}
// ----

const parts = splitParts(content)
console.log('=== parsed parts ===')
console.log('total parts:', parts.length)
parts.forEach((p,i)=>{
  if(p.kind==='mcp') console.log('mcp['+i+']', JSON.stringify(p.server))
  else console.log('text['+i+']', JSON.stringify(p.lines.join('\n').slice(0,60))+'...')
})

// Verify a no-op save is byte-identical (keeps raw text of unchanged blocks)
function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ak = Object.keys(a), bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (const k of ak) { if (!(k in b)) return false; if (!deepEqual(a[k], b[k])) return false }
  return true
}
// simulate save: preserve order, keep raw for unchanged, reserialize changed, append new
function saveSimulate(parts, inputEntries) {
  const byId = {}
  for (const p of parts) if (p.kind === 'mcp') byId[p.server.id] = p
  const seen = new Set()
  const emitted = []
  for (const p of parts) {
    if (p.kind === 'text') { emitted.push(p); continue }
    const rec = inputEntries.find(e => e.id === p.server.id && toStr(e.id).trim() === p.server.id)
    if (!rec) continue // deleted
    seen.add(p.server.id)
    const normalized = normalizeServer(configFromRecord(rec), rec.id)
    normalized.id = rec.id
    if (deepEqual(normalized, p.server)) emitted.push({ kind: 'mcp', server: p.server, raw: p.raw })
    else emitted.push({ kind: 'mcp', server: normalized, raw: null })
  }
  for (const rec of inputEntries) {
    if (seen.has(toStr(rec.id))) continue
    const nn = normalizeServer(configFromRecord(rec), rec.id)
    nn.id = rec.id
    emitted.push({ kind: 'mcp', server: nn, raw: null })
  }
  return emitted.map(p => p.kind === 'text' ? p.lines.join('\n') : (p.raw != null ? p.raw : serializeServer(p.server))).join('\n')
}
function configFromRecord(rec) {
  const cfg = { serverName: rec.serverName, transport: rec.transport }
  if (rec.transport === 'streamable-http') { if (rec.url) cfg.url = rec.url; if (rec.headers && Object.keys(rec.headers).length) cfg.headers = rec.headers }
  else { if (rec.command) cfg.command = rec.command; if (Array.isArray(rec.args) && rec.args.length) cfg.args = rec.args; if (rec.cwd) cfg.cwd = rec.cwd; if (rec.env && Object.keys(rec.env).length) cfg.env = rec.env }
  if (typeof rec.toolCallTimeoutMs === 'number') cfg.toolCallTimeoutMs = rec.toolCallTimeoutMs
  if (typeof rec.failOnStartupError === 'boolean') cfg.failOnStartupError = rec.failOnStartupError
  if (rec.reconnect && typeof rec.reconnect === 'object' && Object.keys(rec.reconnect).length) cfg.reconnect = rec.reconnect
  return cfg
}
const entries = []
for (const p of parts) if (p.kind === 'mcp') entries.push({ ...p.server })
const rebuilt = saveSimulate(parts, entries)
console.log('=== no-op round-trip identical? ===')
console.log(rebuilt === content ? 'YES' : 'NO')
if (rebuilt !== content) { console.log('--- rebuilt ---'); console.log(rebuilt) }

// Simulate: rename github serverName + add a new server via headers, verify comments preserved
const edited = entries.map(e => e.id === 'mcp-github' ? { ...e, serverName: 'github-renamed' } : e)
edited.push({ id: 'mcp-test', serverName: 'test-server', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'], env: { FOO: 'bar' } })
const rebuilt2 = saveSimulate(parts, edited)
console.log('\n=== after edit+add: comments preserved & new block present? ===')
console.log('preamble/comment preserved:', rebuilt2.includes('桥接阿里云云效 DevOps') && rebuilt2.includes('# Your patch layer'))
console.log('renamed github block:', rebuilt2.includes('github-renamed'))
console.log('github raw preserved intact:', rebuilt2.includes('GITHUB_PERSONAL_ACCESS_TOKEN: github_pat_'))
console.log('args raw kept:', rebuilt2.includes('args: [stdio]'))
console.log('new server added:', rebuilt2.includes('id: test-server') || rebuilt2.includes("id: 'test-server'"))
console.log('--- new server block excerpt ---')
const idx = rebuilt2.indexOf('test-server')
console.log(rebuilt2.slice(Math.max(0, rebuilt2.indexOf('- insert:', idx) - 10), idx + 400))
