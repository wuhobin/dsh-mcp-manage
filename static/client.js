/* dsh-mcp-manage — STATIC client bundle.
 * Browser half of the installable DSH plugin. This file is the exact shape the
 * DSH client loader serves: window.__ModuleLoader__.load({ id, factory }).
 * The only external is `react`, supplied by the loader module table (see
 * dshmarket's shipped client bundle). Everything else is inlined.
 *
 * It registers the Settings → "MCP 服务" section and renders server cards plus
 * a real-connection "握手" status badge. Data comes from the static host's
 * HTTP routes (/dsh-mcp/list, /dsh-mcp/check, /dsh-mcp/save) instead of the
 * dynamic-runner host.call.
 */
window.__ModuleLoader__.load({ id: 'dsh-mcp-manage', factory: function (require) {
  var module = { exports: {} }
  var exports = module.exports
  Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
  var React = require('react')

  var S = {
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
  var STATUS_TXT = { ok: { label: '已连接', color: 'rgba(30,170,120,.18)', fg: '#1d9e68' }, reachable: { label: '可达', color: 'rgba(70,90,255,.16)', fg: '#4a5fff' }, unreachable: { label: '不可达', color: 'rgba(220,60,60,.15)', fg: '#c22' }, error: { label: '异常', color: 'rgba(220,60,60,.15)', fg: '#c22' }, unknown: { label: '未知', color: 'rgba(128,128,128,.18)', fg: '#6b7280' }, checking: { label: '检测中', color: 'rgba(230,160,60,.18)', fg: '#b57614' } }

  // ---- host RPC over HTTP (static hosts mount these routes) ----
  function getJson(path) { return fetch(path, { method: 'GET', headers: { 'accept': 'application/json' } }).then(function (r) { return r.json() }).catch(function (e) { return { ok: false, error: String((e && e.message) || e) } }) }
  function postJson(path, obj) { return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) }).then(function (r) { return r.json() }).catch(function (e) { return { ok: false, error: String((e && e.message) || e) } }) }

  function SettingsSection() {
    var h = React.createElement
    var statePair = React.useState({ loading: true, entries: [], error: null, path: '' })
    var state = statePair[0], setState = statePair[1]
    var editPair = React.useState(null)
    var editing = editPair[0], setEditing = editPair[1]
    var chkPair = React.useState({})
    var checks = chkPair[0], setChecks = chkPair[1]
    var ckPair = React.useState(false)
    var checking = ckPair[0], setChecking = ckPair[1]
    var refresh = React.useCallback(function () {
      setState(function (s) { return { ...s, loading: true, error: null } })
      getJson('/dsh-mcp/list').then(function (res) {
        if (!res || !res.ok) { setState(function (s) { return { ...s, loading: false, error: (res && res.error) || '读取失败' } }); return }
        setState(function (s) { return { ...s, loading: false, entries: res.entries || [], path: res.path || '' } })
        loadChecks()
      })
    }, [])
    var loadChecks = React.useCallback(function () {
      setChecking(true)
      getJson('/dsh-mcp/check').then(function (res) {
        if (res && res.ok && Array.isArray(res.results)) {
          var map = {}
          for (var i = 0; i < res.results.length; i++) { var r = res.results[i]; map[r.id] = r }
          setChecks(map)
        }
        setChecking(false)
      }).catch(function () { setChecking(false) })
    }, [])
    React.useEffect(function () { refresh() }, [])
    function remove(id) { doSave(state.entries.filter(function (e) { return e.id !== id }), refresh, setState) }
    function submit(rec) {
      var next = (editing && editing.mode === 'create') ? state.entries.concat(rec) : state.entries.map(function (e) { return e.id === rec.id ? rec : e })
      doSave(next, refresh, setState).then(function (ok) { if (ok) setEditing(null) })
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
            h('button', { style: S.addBtn, onClick: function () { setEditing({ mode: 'create' }) } }, '+ 添加服务'),
            h('button', { style: S.checkBtn, onClick: loadChecks, disabled: checking }, checking ? '检测中…' : '重新检测全部'),
          ),
          state.entries.length === 0
            ? h('p', { style: S.hint }, '尚未配置任何 MCP 服务。点击“添加服务”开始。')
            : h('div', { style: S.list }, state.entries.map(function (rec) { return ServerCard({ key: rec.id, rec: rec, check: checks[rec.id], checking: checking, onCheck: loadChecks, onEdit: function () { setEditing({ mode: 'edit', record: rec }) }, onDelete: function () { remove(rec.id) } }) })),
        ),
      editing ? FormPanel({ record: editing.mode === 'edit' ? editing.record : null, onSubmit: submit, onCancel: function () { setEditing(null) } }) : null,
    )
  }

  function doSave(entries, refresh, setState) {
    return postJson('/dsh-mcp/save', { entries: entries }).then(function (res) {
      if (res && res.ok) { refresh(); return true }
      if (setState) setState(function (s) { return { ...s, error: (res && res.error) || '保存失败' } })
      return false
    }).catch(function (e) { if (setState) setState(function (s) { return { ...s, error: String((e && e.message) || e) } }); return false })
  }

  function ServerCard(props) {
    var h = React.createElement
    var rec = props.rec, check = props.check, checking = props.checking, onCheck = props.onCheck, onEdit = props.onEdit, onDelete = props.onDelete
    var isHttp = rec.transport === 'streamable-http'
    var extra = isHttp ? countKeys(rec.headers) : countKeys(rec.env)
    var st = (check && check.status && STATUS_TXT[check.status]) ? STATUS_TXT[check.status] : null
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

  function Field(props) {
    var h = React.createElement
    return h('div', {}, h('label', { style: S.label }, props.label), h('input', { style: S.input, value: props.value, onChange: function (e) { props.onChange(e.target.value) } }))
  }

  function FormPanel(props) {
    var h = React.createElement
    var r = props.record || {}
    var fName = React.useState(r.serverName || ''); var serverName = fName[0], setServerName = fName[1]
    var fTr = React.useState(r.transport || 'stdio'); var transport = fTr[0], setTransport = fTr[1]
    var fId = React.useState(r.id || ''); var id = fId[0], setId = fId[1]
    var fCmd = React.useState(r.command || ''); var command = fCmd[0], setCommand = fCmd[1]
    var fArgs = React.useState(r.args ? r.args.join(' ') : ''); var args = fArgs[0], setArgs = fArgs[1]
    var fCwd = React.useState(r.cwd || ''); var cwd = fCwd[0], setCwd = fCwd[1]
    var fUrl = React.useState(r.url || ''); var url = fUrl[0], setUrl = fUrl[1]
    var fTim = React.useState(r.toolCallTimeoutMs != null ? String(r.toolCallTimeoutMs) : ''); var timeout = fTim[0], setTimeout_ = fTim[1]
    var fEnv = React.useState(toRows(r.env)); var env = fEnv[0], setEnv = fEnv[1]
    var fHdr = React.useState(toRows(r.headers)); var headers = fHdr[0], setHeaders = fHdr[1]
    var fErr = React.useState(null); var formError = fErr[0], setFormError = fErr[1]
    var rows = transport === 'streamable-http' ? headers : env
    var setRows = transport === 'streamable-http' ? setHeaders : setEnv
    function doSubmit() {
      var finalServer = serverName.trim()
      var finalId = (id || serverName).trim()
      if (!finalServer) { setFormError('serverName 不能为空'); return }
      if (!finalId) { setFormError('id 不能为空'); return }
      if (transport === 'streamable-http' && !url.trim()) { setFormError('URL 不能为空'); return }
      if (transport !== 'streamable-http' && !command.trim()) { setFormError('command 不能为空'); return }
      var rec = { id: finalId, serverName: finalServer, transport: transport, toolCallTimeoutMs: timeout ? Number(timeout) : undefined }
      if (transport === 'streamable-http') { rec.url = url.trim(); rec.headers = rowsToMap(rows) }
      else { rec.command = command.trim(); rec.cwd = cwd.trim() || undefined; rec.args = args.trim() ? args.trim().split(/\s+/).filter(Boolean) : []; rec.env = rowsToMap(rows) }
      props.onSubmit(rec)
    }
    function rowEls() {
      return rows.map(function (row, idx) { return h('div', { key: idx, style: S.varRow },
        h('input', { style: S.varKey, value: row.key, onChange: function (e) { updRow(idx, 'key', e.target.value, rows, setRows) } }),
        h('input', { style: S.varVal, value: row.val, onChange: function (e) { updRow(idx, 'val', e.target.value, rows, setRows) } }),
        h('button', { style: S.removeRow, onClick: function () { rmRow(idx, rows, setRows) } }, '×')) })
    }
    return h('div', { style: modal() },
      h('div', { style: S.formCard },
        h('div', { style: S.formTitle }, props.record ? '编辑服务' : '添加服务'),
        Field({ label: 'serverName（命名空间） *', value: serverName, onChange: setServerName }),
        Field({ label: 'id（配置项标识） *', value: id, onChange: setId }),
        h('label', { style: S.label }, '传输方式'),
        h('select', { style: S.input, value: transport, onChange: function (e) { setTransport(e.target.value) } }, h('option', { value: 'stdio' }, 'stdio'), h('option', { value: 'streamable-http' }, 'streamable-http')),
        transport === 'streamable-http' ? Field({ label: 'URL *', value: url, onChange: setUrl }) :
          h('div', {}, Field({ label: 'command *', value: command, onChange: setCommand }), Field({ label: 'args（空格分隔）', value: args, onChange: setArgs }), Field({ label: 'cwd（可选）', value: cwd, onChange: setCwd })),
        h('label', { style: S.label }, 'toolCallTimeoutMs（可选）'),
        h('input', { style: S.input, value: timeout, onChange: function (e) { setTimeout_(e.target.value) }, placeholder: '60000' }),
        h('label', { style: S.label }, (transport === 'streamable-http' ? 'Headers' : '环境变量 env')),
        h('div', {}, rowEls(),
          h('button', { style: S.addRow, onClick: function () { addRow(rows, setRows) } }, '+ 添加变量'),
        ),
        formError ? h('div', { style: S.error }, formError) : null,
        h('div', { style: S.formActions }, h('button', { style: S.smallBtn, onClick: props.onCancel }, '取消'), h('button', { style: S.addBtn, onClick: doSubmit }, '保存')),
      ),
    )
  }

  function countKeys(o) { return o ? Object.keys(o).length : 0 }
  function toRows(map) { return map ? Object.keys(map).map(function (k) { return { key: k, val: map[k] } }) : [] }
  function rowsToMap(rows) { var out = {}; for (var i = 0; i < rows.length; i++) { var r = rows[i]; if (r.key.trim()) out[r.key.trim()] = r.val } return out }
  function addRow(rows, setRows) { setRows(rows.concat({ key: '', val: '' })) }
  function rmRow(idx, rows, setRows) { setRows(rows.filter(function (_, i) { return i !== idx })) }
  function updRow(idx, f, val, rows, setRows) { setRows(rows.map(function (r, i) { return i === idx ? { ...r, [f]: val } : r })) }
  function tip(t) { var b = { display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontFamily: 'monospace', marginLeft: '8px' }; return t === 'streamable-http' ? { ...b, background: 'rgba(70,90,255,.15)', color: '#4a5fff' } : { ...b, background: 'rgba(30,170,120,.15)', color: '#1d9e68' } }
  function badge(st) { return { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 9px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, marginLeft: '8px', background: st.color, color: st.fg } }
  function modal() { return { position: 'fixed', inset: '0', background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' } }

  function apply(ctx) {
    var slots = ctx.get('slots')
    if (slots === undefined) return
    slots.inject('settings.section', function () {
      return slots.register(
        { name: 'settings.section', id: 'mcp-manage', order: 30, label: function () { return 'MCP 服务' } },
        function () { return SettingsSection() },
      )
    })
  }

  module.exports = { name: 'dsh-mcp-manage', inject: ['slots'], apply: apply }
  return module.exports
} })
