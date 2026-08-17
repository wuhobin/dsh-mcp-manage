// dsh-mcp-manage — Client half (dynamic Cordis Plugin)
// Register the Settings → "MCP 服务" section and render server cards + connection-status badges.
// Runs in the browser. React.createElement only; no JSX / import / TS. Uses host.call for package-private JSON-RPC.
const S = {
  page: { padding: '8px 4px', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif', color: 'var(--fg, #1f2328)' },
  head: { marginBottom: '8px' }, title: { margin: '0 0 4px', fontSize: '18px', fontWeight: 600 },
  subtitle: { margin: '0', fontSize: '13px', opacity: .78, lineHeight: 1.5 }, path: { margin: '8px 0 0', fontSize: '12px', opacity: .6, fontFamily: 'monospace', overflowWrap: 'anywhere' },
  error: { margin: '8px 0', padding: '8px 12px', borderRadius: '6px', background: 'rgba(220,60,60,.1)', color: '#c22', fontSize: '13px' }, hint: { margin: '16px 0', fontSize: '13px', opacity: .6 },
  toolbar: { margin: '12px 0', display: 'flex', gap: '8px', alignItems: 'center' }, addBtn: { padding: '7px 14px', borderRadius: '6px', border: 'none', background: '#3572ef', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  checkBtn: { padding: '7px 14px', borderRadius: '6px', border: '1px solid rgba(128,128,128,.4)', background: 'transparent', color: 'inherit', fontSize: '13px', cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  card: { border: '1px solid rgba(128,128,128,.28)', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', background: 'var(--bg, transparent)' },
  cardMain: { minWidth: 0 }, cardTitleRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' }, serverName: { fontWeight: 600, fontSize: '14px' },
  cardMeta: { fontSize: '12px', opacity: .72, marginTop: '2px' }, muted: { fontSize: '12px', opacity: .7 }, mono: { fontFamily: 'monospace', fontSize: '12px', opacity: .85, overflowWrap: 'anywhere' },
  cardActions: { display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' },
  smallBtn: { padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(128,128,128,.4)', background: 'transparent', cursor: 'pointer', fontSize: '12px' },
  dangerBtn: { padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(220,60,60,.5)', background: 'rgba(220,60,60,.08)', color: '#c22', cursor: 'pointer', fontSize: '12px' },
  formCard: { background: 'var(--bg, #fff)', color: 'var(--fg, #1f2328)', borderRadius: '10px', padding: '20px', width: 'min(540px, 100%)', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,.25)' },
  formTitle: { margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }, label: { display: 'block', margin: '8px 0 4px', fontSize: '12px', fontWeight: 600 },
  input: { width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: '6px', border: '1px solid rgba(128,128,128,.4)', background: 'transparent', color: 'inherit', fontSize: '13px' },
  varRow: { display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }, varKey: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(128,128,128,.4)', background: 'transparent', color: 'inherit', fontSize: '13px' },
  varVal: { flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(128,128,128,.4)', background: 'transparent', color: 'inherit', fontFamily: 'monospace', fontSize: '13px' }, removeRow: { border: 'none', background: 'transparent', color: '#c22', cursor: 'pointer', fontSize: '16px', lineHeight: 1 },
  addRow: { marginTop: '4px', padding: '4px 8px', border: '1px dashed rgba(128,128,128,.5)', background: 'transparent', cursor: 'pointer', fontSize: '12px', borderRadius: '6px' },
  formActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' },
}
const STATUS_TXT = { ok: { label: '已连接', color: 'rgba(30,170,120,.18)', fg: '#1d9e68' }, reachable: { label: '可达', color: 'rgba(70,90,255,.16)', fg: '#4a5fff' }, unreachable: { label: '不可达', color: 'rgba(220,60,60,.15)', fg: '#c22' }, error: { label: '异常', color: 'rgba(220,60,60,.15)', fg: '#c22' }, unknown: { label: '未知', color: 'rgba(128,128,128,.18)', fg: '#6b7280' }, checking: { label: '检测中', color: 'rgba(230,160,60,.18)', fg: '#b57614' } }

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    slots.register(
      { name: 'settings.section', id: 'mcp-manage', order: 30, label: () => 'MCP 服务' },
      () => SettingsSection(),
    )
  }
}

function SettingsSection(props) {
  const h = React.createElement
  const [state, setState] = React.useState({ loading: true, entries: [], error: null, path: '' })
  const [editing, setEditing] = React.useState(null)
  const [checks, setChecks] = React.useState({})
  const [checking, setChecking] = React.useState(false)
  const refresh = React.useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await host.call('mcp/list', {})
      if (!res || !res.ok) { setState(s => ({ ...s, loading: false, error: (res && res.error) || '读取失败' })); return }
      setState(s => ({ ...s, loading: false, entries: res.entries || [], path: res.path || '' }))
      loadChecks()
    } catch (e) { setState(s => ({ ...s, loading: false, error: String((e && e.message) || e) })) }
  }, [])
  const loadChecks = React.useCallback(async () => {
    setChecking(true)
    try {
      const res = await host.call('mcp/check', {})
      if (res && res.ok && Array.isArray(res.results)) {
        const map = {}
        for (const r of res.results) map[r.id] = r
        setChecks(map)
      }
    } catch (e) { }
    setChecking(false)
  }, [])
  React.useEffect(() => { refresh() }, [])
  const remove = (id) => { doSave(state.entries.filter(e => e.id !== id), refresh, setState) }
  const submit = (rec) => {
    const next = (editing && editing.mode === 'create') ? state.entries.concat(rec) : state.entries.map(e => e.id === rec.id ? rec : e)
    doSave(next, refresh, setState).then(ok => { if (ok) setEditing(null) })
  }
  return h('div', { style: S.page },
    h('div', { style: S.head },
      h('h2', { style: S.title }, 'MCP 服务管理'),
      h('p', { style: S.subtitle }, '管理 DSH 通过 cordis.patch.yml 注册的 MCP 服务。状态为对每个服务建立真实 MCP initialize 连接握手（HTTP 会话 / stdio 进程）的检测结果。'),
    ),
    state.path ? h('p', { style: S.path }, '配置文件：' + state.path) : null,
    state.error ? h('div', { style: S.error }, '错误：' + state.error) : null,
    state.loading ? h('p', { style: S.hint }, '加载中…') :
      h('div', {},
        h('div', { style: S.toolbar },
          h('button', { style: S.addBtn, onClick: () => setEditing({ mode: 'create' }) }, '+ 添加服务'),
          h('button', { style: S.checkBtn, onClick: loadChecks, disabled: checking }, checking ? '检测中…' : '重新检测全部'),
        ),
        state.entries.length === 0
          ? h('p', { style: S.hint }, '尚未配置任何 MCP 服务。点击“添加服务”开始。')
          : h('div', { style: S.list }, state.entries.map(rec => h(ServerCard, { key: rec.id, rec, check: checks[rec.id], checking, onCheck: loadChecks, onEdit: () => setEditing({ mode: 'edit', record: rec }), onDelete: () => remove(rec.id) }))),
      ),
    editing ? h(FormPanel, { record: editing.mode === 'edit' ? editing.record : null, onSubmit: submit, onCancel: () => setEditing(null) }) : null,
  )
}

function doSave(entries, refresh, setState) {
  return host.call('mcp/save', { entries }).then(res => {
    if (res && res.ok) { refresh(); return true }
    if (setState) setState(s => ({ ...s, error: (res && res.error) || '保存失败' }))
    return false
  }).catch(e => { if (setState) setState(s => ({ ...s, error: String((e && e.message) || e) })); return false })
}

function ServerCard(props) {
  const h = React.createElement
  const { rec, check, checking, onCheck, onEdit, onDelete } = props
  const isHttp = rec.transport === 'streamable-http'
  const extra = isHttp ? countKeys(rec.headers) : countKeys(rec.env)
  const st = (check && check.status && STATUS_TXT[check.status]) ? STATUS_TXT[check.status] : null
  return h('div', { style: S.card },
    h('div', { style: S.cardMain },
      h('div', { style: S.cardTitleRow },
        h('span', { style: S.serverName }, rec.serverName),
        h('span', { style: tip(rec.transport) }, rec.transport),
        st ? h('span', { style: badge(st) }, st.label) : null,
      ),
      h('div', { style: S.cardMeta }, h('span', { style: S.muted }, 'id: '), h('span', { style: S.mono }, rec.id)),
      h('div', { style: S.cardMeta }, h('span', { style: S.mono }, isHttp ? (rec.url || '') : (rec.command || ''))),
      (check && check.message) ? h('div', { style: S.cardMeta }, h('span', { style: S.mono }, check.message)) : null,
      (extra > 0) ? h('div', { style: S.cardMeta }, isHttp ? (String(extra) + ' 个请求头') : (String(extra) + ' 个环境变量')) : null,
      (rec.args && rec.args.length) ? h('div', { style: S.cardMeta }, h('span', { style: S.mono }, 'args: ' + rec.args.join(' '))) : null,
    ),
    h('div', { style: S.cardActions },
      h('button', { style: S.smallBtn, onClick: onCheck, disabled: checking }, '检测'),
      h('button', { style: S.smallBtn, onClick: onEdit }, '编辑'),
      h('button', { style: S.dangerBtn, onClick: onDelete }, '删除'),
    ),
  )
}

function FormPanel(props) {
  const h = React.createElement
  const r = props.record || {}
  const [serverName, setServerName] = React.useState(r.serverName || '')
  const [transport, setTransport] = React.useState(r.transport || 'stdio')
  const [id, setId] = React.useState(r.id || '')
  const [command, setCommand] = React.useState(r.command || '')
  const [args, setArgs] = React.useState(r.args ? r.args.join(' ') : '')
  const [cwd, setCwd] = React.useState(r.cwd || '')
  const [url, setUrl] = React.useState(r.url || '')
  const [timeout, setTimeout_] = React.useState(r.toolCallTimeoutMs != null ? String(r.toolCallTimeoutMs) : '')
  const [env, setEnv] = React.useState(toRows(r.env))
  const [headers, setHeaders] = React.useState(toRows(r.headers))
  const [formError, setFormError] = React.useState(null)
  const rows = transport === 'streamable-http' ? headers : env
  const setRows = transport === 'streamable-http' ? setHeaders : setEnv
  const doSubmit = () => {
    const finalServer = serverName.trim()
    const finalId = (id || serverName).trim()
    if (!finalServer) { setFormError('serverName 不能为空'); return }
    if (!finalId) { setFormError('id 不能为空'); return }
    if (transport === 'streamable-http' && !url.trim()) { setFormError('URL 不能为空'); return }
    if (transport !== 'streamable-http' && !command.trim()) { setFormError('command 不能为空'); return }
    const rec = { id: finalId, serverName: finalServer, transport, toolCallTimeoutMs: timeout ? Number(timeout) : undefined }
    if (transport === 'streamable-http') { rec.url = url.trim(); rec.headers = rowsToMap(rows) }
    else { rec.command = command.trim(); rec.cwd = cwd.trim() || undefined; rec.args = args.trim() ? args.trim().split(/\s+/).filter(Boolean) : []; rec.env = rowsToMap(rows) }
    props.onSubmit(rec)
  }
  return h('div', { style: modal() },
    h('div', { style: S.formCard },
      h('div', { style: S.formTitle }, props.record ? '编辑服务' : '添加服务'),
      h(Field, { label: 'serverName（命名空间） *', value: serverName, onChange: setServerName }),
      h(Field, { label: 'id（配置项标识） *', value: id, onChange: setId }),
      h('label', { style: S.label }, '传输方式'),
      h('select', { style: S.input, value: transport, onChange: (e) => setTransport(e.target.value) }, h('option', { value: 'stdio' }, 'stdio'), h('option', { value: 'streamable-http' }, 'streamable-http')),
      transport === 'streamable-http' ? h(Field, { label: 'URL *', value: url, onChange: setUrl }) :
        h('div', {}, h(Field, { label: 'command *', value: command, onChange: setCommand }), h(Field, { label: 'args（空格分隔）', value: args, onChange: setArgs }), h(Field, { label: 'cwd（可选）', value: cwd, onChange: setCwd })),
      h('label', { style: S.label }, 'toolCallTimeoutMs（可选）'),
      h('input', { style: S.input, value: timeout, onChange: (e) => setTimeout_(e.target.value), placeholder: '60000' }),
      h('label', { style: S.label }, (transport === 'streamable-http' ? 'Headers' : '环境变量 env')),
      h('div', {},
        rows.map((row, idx) => h('div', { key: idx, style: S.varRow },
          h('input', { style: S.varKey, value: row.key, onChange: (e) => updRow(idx, 'key', e.target.value, rows, setRows) }),
          h('input', { style: S.varVal, value: row.val, onChange: (e) => updRow(idx, 'val', e.target.value, rows, setRows) }),
          h('button', { style: S.removeRow, onClick: () => rmRow(idx, rows, setRows) }, '×'))),
        h('button', { style: S.addRow, onClick: () => addRow(rows, setRows) }, '+ 添加变量'),
      ),
      formError ? h('div', { style: S.error }, formError) : null,
      h('div', { style: S.formActions }, h('button', { style: S.smallBtn, onClick: props.onCancel }, '取消'), h('button', { style: S.addBtn, onClick: doSubmit }, '保存')),
    ),
  )
}

function Field(props) {
  const h = React.createElement
  return h('div', {}, h('label', { style: S.label }, props.label), h('input', { style: S.input, value: props.value, onChange: (e) => props.onChange(e.target.value) }))
}

function countKeys(o) { return o ? Object.keys(o).length : 0 }
function toRows(map) { return map ? Object.keys(map).map(k => ({ key: k, val: map[k] })) : [] }
function rowsToMap(rows) { const out = {}; for (const r of rows) if (r.key.trim()) out[r.key.trim()] = r.val; return out }
function addRow(rows, setRows) { setRows(rows.concat({ key: '', val: '' })) }
function rmRow(idx, rows, setRows) { setRows(rows.filter((_, i) => i !== idx)) }
function updRow(idx, f, val, rows, setRows) { setRows(rows.map((r, i) => i === idx ? { ...r, [f]: val } : r)) }
function tip(t) {
  const b = { display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontFamily: 'monospace', marginLeft: '8px' }
  return t === 'streamable-http' ? { ...b, background: 'rgba(70,90,255,.15)', color: '#4a5fff' } : { ...b, background: 'rgba(30,170,120,.15)', color: '#1d9e68' }
}
function badge(st) {
  return { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 9px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, marginLeft: '8px', background: st.color, color: st.fg }
}
function modal() { return { position: 'fixed', inset: '0', background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' } }
