// Shared helpers for the browser tests: static server, fake clock, GitHub mock, claude.ai runtime mock.
const http = require('http'), fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');

function req(name) { try { return require(name); } catch (e) { throw new Error(`Falta "${name}". Corré "npm install" dentro de tests/ (o definí NODE_PATH).`); } }
const { chromium } = req('playwright');

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && fs.existsSync(base)) {
    const dir = fs.readdirSync(base).filter(d => d.startsWith('chromium-')).sort().pop();
    const p = dir && path.join(base, dir, 'chrome-linux', 'chrome');
    if (p && fs.existsSync(p)) return p;
  }
  return undefined;   // Playwright's own download
}
const launch = () => chromium.launch({ executablePath: chromiumPath() });

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
               '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
function serve(extra = {}) {
  const server = http.createServer((rq, res) => {
    const u = decodeURIComponent(rq.url.split('?')[0]);
    if (extra[u]) { res.writeHead(200, { 'content-type': extra[u].type, 'cache-control': 'no-store' }); return res.end(extra[u].body); }
    const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'history.json'), 'utf8'));
// History as it was on a given month (drops later months): lets a test start "before September".
function histUpTo(key) {
  const months = {};
  for (const [k, m] of Object.entries(FIXTURE.months)) if (k <= key) months[k] = JSON.parse(JSON.stringify(m));
  return { version: 3, savedAt: FIXTURE.savedAt, months, deleted: {} };
}
const clone = (x) => JSON.parse(JSON.stringify(x));

// Fixed "today": the page believes it is this moment (timers keep running).
const fakeDate = (iso = '2026-10-05T12:00:00') => `(() => { const off = new Date('${iso}').getTime() - Date.now(); const RD = Date;
  class FD extends RD { constructor(...a) { if (a.length === 0) super(RD.now() + off); else super(...a); } static now() { return RD.now() + off; } }
  window.Date = FD; })();`;

const GH_API = 'https://api.github.com/repos/matiasbert/casa-pipis/contents/data/history.json';
// state: { content, sha, puts:[], failNextPut, getDelayMs }
async function mockGithub(ctx, state) {
  state.puts = state.puts || [];
  await ctx.route(u => u.href.startsWith(GH_API), async (route) => {
    const rq = route.request();
    const h = { 'access-control-allow-origin': '*' };
    if (rq.method() === 'GET') {
      if (state.getDelayFirst) { const d = state.getDelayFirst; state.getDelayFirst = 0; await new Promise(r => setTimeout(r, d)); }
      if (state.getDelayMs) await new Promise(r => setTimeout(r, state.getDelayMs));
      return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
        body: JSON.stringify({ sha: state.sha, content: Buffer.from(state.content).toString('base64') }) });
    }
    if (rq.method() === 'PUT') {
      if (state.failNextPut > 0) { state.failNextPut--; return route.fulfill({ status: 409, contentType: 'application/json', headers: h, body: '{"message":"conflict"}' }); }
      const body = JSON.parse(rq.postData());
      state.content = Buffer.from(body.content, 'base64').toString();
      state.sha = 'sha' + (state.puts.length + 2);
      state.puts.push(JSON.parse(state.content));
      return route.fulfill({ status: 200, contentType: 'application/json', headers: h, body: '{"content":{"sha":"x"}}' });
    }
    route.fulfill({ status: 204, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  });
}

// ---- claude.ai runtime mock (db with live snapshots, user, downloads, sample) ----
const claudeMock = `(() => {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const freeze = (o) => { Object.freeze(o); Object.values(o).forEach(v => v && typeof v === 'object' && !Object.isFrozen(v) && freeze(v)); return o; };
  const store = window.__SEED ? clone(window.__SEED) : {};
  const meta = window.__META ? clone(window.__META) : {};
  window.__store = store; window.__writes = []; window.__saved = []; window.__asked = [];
  const listeners = []; let prev = {};
  const mk = (id, data) => ({ id, exists: true, data: () => freeze(clone(data)), metadata: { fromCache: false, hasPendingWrites: false } });
  const snapshot = (fromCache) => {
    const ids = (fromCache && window.__cacheEmpty) ? [] : Object.keys(store).sort(); const changes = [];
    for (const id of ids) { if (!(id in prev)) changes.push({ type: 'added', doc: mk(id, store[id]) }); else if (JSON.stringify(prev[id]) !== JSON.stringify(store[id])) changes.push({ type: 'modified', doc: mk(id, store[id]) }); }
    for (const id of Object.keys(prev)) if (!(id in store)) changes.push({ type: 'removed', doc: mk(id, prev[id]) });
    prev = clone(store);
    return { docs: ids.map(id => mk(id, store[id])), size: ids.length, empty: !ids.length, docChanges: () => changes, metadata: { fromCache: !!fromCache, hasPendingWrites: false } };
  };
  const notify = () => setTimeout(() => listeners.forEach(f => f(snapshot(false))), 10);
  window.__remoteSet = (id, data) => { store[id] = clone(data); notify(); };
  const metaListeners = [];
  window.__metaSet = (id, data) => { meta[id] = clone(data); metaListeners.forEach(f => f(id)); };
  const db = {
    collection: (name) => ({ onSnapshot: (next) => {
      listeners.push(next);
      if (window.__firstFromCache) { setTimeout(() => next(snapshot(true)), 30); setTimeout(() => { prev = {}; next(snapshot(false)); }, window.__firstFromCache); }
      else setTimeout(() => next(snapshot(false)), window.__snapDelay || 30);
      return () => {}; } }),
    doc: (path) => { const [col, id] = path.split('/');
      if (col === 'meta') return { onSnapshot: (next) => { const f = (k) => { if (k === id) next({ exists: id in meta, data: () => meta[id] && freeze(clone(meta[id])) }); }; metaListeners.push(f); setTimeout(() => f(id), 40); return () => {}; },
                                   set: async (d) => { meta[id] = clone(d); window.__writes.push(['meta', id]); metaListeners.forEach(f => f(id)); } };
      return {
      set: async (data) => { if (window.__readOnly) throw { code: 'invalid_argument', message: 'ro' }; store[id] = clone(data); window.__writes.push(['set', id]); notify(); },
      delete: async () => { delete store[id]; window.__writes.push(['delete', id]); notify(); } }; },
  };
  const sample = async (input, opts) => {
    window.__asked.push({ input, opts: opts ? Object.keys(opts) : [] });
    if (window.__sampleReply) { const t = typeof window.__sampleReply === 'function' ? window.__sampleReply(input, opts) : window.__sampleReply; return t; }
    const t = 'RESPUESTA-MOCK'; opts && opts.onText && opts.onText({ text: t, delta: t }); return { text: t, truncated: false };
  };
  sample.json = async (input, opts) => { window.__asked.push({ input, opts: opts ? Object.keys(opts) : [], json: true, images: opts && opts.images ? (Array.isArray(opts.images) ? opts.images.map(b => b.type + ':' + b.size) : [opts.images.type + ':' + opts.images.size]) : [] }); return clone(window.__sampleJson || {}); };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: window.__noImages ? undefined : { maxCount: 4, maxInputBytes: 20e6, mediaTypes: ['image/jpeg', 'image/png'] } });
  const caps = { db, user: { can: async () => !window.__readOnly, isOwner: async () => !window.__readOnly },
                 downloads: { save: async ({ filename, data }) => { window.__saved.push({ filename, size: data.size || data.length, type: data.type }); return { status: 'saved' }; } }, sample };
  window.claude = { use: async (n) => caps[n] || null };
})();`;

// Wraps the built single-file page the way claude.ai does.
function buildArtifactPage() {
  const out = path.join(require('os').tmpdir(), 'casapipis-artifact-test.html');
  const r = spawnSync('python3', [path.join(root, 'tools', 'build_artifact.py'), out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('build_artifact.py falló: ' + r.stderr);
  const art = fs.readFileSync(out, 'utf8');
  return '<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui;background:#fafaf9}[hidden]{display:none!important}</style></head><body>' + art + '</body></html>';
}

async function openArtifact(browser, base, { seed, readOnly, viewport, extra } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  await ctx.addInitScript(`window.__SEED = ${JSON.stringify(seed || null)}; window.__readOnly = ${!!readOnly};${extra || ''}`);
  await ctx.addInitScript(fakeDate());
  await ctx.addInitScript(claudeMock);
  const libs = await stubExternal(ctx);
  let api = 0; await ctx.route('https://api.github.com/**', r => { api++; r.abort(); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base + '/__artifact.html');
  return { ctx, page, errors, api: () => api, libs };
}

function libPath(name, file) { try { return require.resolve(`${name}/${file}`); } catch (e) { return null; } }
function libSource(name, file) { const p = libPath(name, file); return p ? fs.readFileSync(p, 'utf8') : null; }

async function stubExternal(ctx) {
  const h2c = libSource('html2canvas', 'dist/html2canvas.min.js'), pdf = libSource('jspdf', 'dist/jspdf.umd.min.js');
  await ctx.route('**/html2canvas*', r => h2c ? r.fulfill({ contentType: 'application/javascript', body: h2c }) : r.abort());
  await ctx.route('**/jspdf*', r => pdf ? r.fulfill({ contentType: 'application/javascript', body: pdf }) : r.abort());
  const pdfMain = libSource('pdfjs-dist', 'build/pdf.min.js'), pdfWorker = libSource('pdfjs-dist', 'build/pdf.worker.min.js');
  await ctx.route('**/pdf.js/**/pdf.min.js', r => pdfMain ? r.fulfill({ contentType: 'application/javascript', body: pdfMain }) : r.abort());
  await ctx.route('**/pdf.js/**/pdf.worker.min.js', r => pdfWorker ? r.fulfill({ contentType: 'application/javascript', body: pdfWorker }) : r.abort());
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  return { hasPdfLibs: !!(h2c && pdf), hasPdfJs: !!(pdfMain && pdfWorker) };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pass = (m) => console.log('  ✓', m);
const section = (m) => console.log('\n' + m);

// Click "previous/next month" until the label matches.
async function goTo(page, label) {
  const order = ['Mayo 2026', 'Junio 2026', 'Julio 2026', 'Agosto 2026', 'Septiembre 2026', 'Octubre 2026'];
  for (let i = 0; i < 12; i++) {
    const cur = await page.locator('#monthLabel').innerText();
    if (cur === label) return;
    await page.click(order.indexOf(cur) < order.indexOf(label) ? '#nextMonthBtn' : '#prevMonthBtn');
  }
  throw new Error('no pude navegar a ' + label);
}

module.exports = { openArtifact, root, launch, serve, FIXTURE, histUpTo, clone, fakeDate, mockGithub, claudeMock, buildArtifactPage, stubExternal, sleep, pass, section, goTo };
