
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
