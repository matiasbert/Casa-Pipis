// Constants, shared state, storage helpers, formatting and small UI helpers.

const STORAGE_KEY      = 'casapi_months';
const GH_TOKEN_KEY     = 'casapi_github_token';
const GH_LAST_SYNC_KEY = 'casapi_last_sync';
const GH_DIRTY_KEY     = 'casapi_dirty';
const GH_DELETED_KEY   = 'casapi_deleted';
const BACKUP_KEY       = 'casapi_months_backup';
const BACKUPS_KEY      = 'casapi_backups';        // ring of the last local snapshots
const BACKUP_MAX       = 6;
const REPAIR_KEY       = 'casapi_repair_v16';
const DARK_MODE_KEY    = 'casapi_darkmode';
const GH_OWNER         = 'matiasbert';
const GH_REPO          = 'casa-pipis';
const GH_DATA_PATH     = 'data/history.json';
const GH_API_URL       = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_DATA_PATH}`;
const RECURRING_TEMPLATES = [
  { name: 'Alquiler',   currency: 'ARS' },
  { name: 'Expensas',   currency: 'ARS' },
  { name: 'Telecentro', currency: 'ARS' },
  { name: 'Edesur',     currency: 'ARS' },
  { name: 'Metrogas',   currency: 'ARS' },
];
const PINA_RECURRING_TEMPLATES = [
  { name: 'Visa',       currency: 'ARS' },
  { name: 'Visa',       currency: 'USD' },
  { name: 'Mastercard', currency: 'ARS' },
  { name: 'Mastercard', currency: 'USD' },
];
const MONTH_NAMES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

let allMonths = {};
let deletedMonths = {};          // key -> timestamp (tombstones so a deleted month does not come back on sync)
let currentKey = '';
let editingItemId = null;
let editingPinaPairId = null;
let pendingNewItemId = null;     // row added with "+ Agregar" but not saved yet
let pendingNewPinaPairId = null;
const unlockedKeys = new Set();  // past months the user enabled for editing in this session

// Where the data lives: 'github' (GitHub Pages: history.json in the repo), 'artifact' (claude.ai page:
// private shared database) or 'local' (framed but no database: this browser only).
const IS_FRAMED = typeof window.claude === 'object' && window.claude !== null && typeof window.claude.use === 'function';
let storeMode = IS_FRAMED ? 'local' : 'github';
let dbNs = null, viewerReadOnly = false, remoteSig = {}, remoteTomb = {}, firstDelivered = false, backupInfo = null;
let firstSnap = Promise.resolve();
let claudeSample = null;

function lsGet(k)    { try { return localStorage.getItem(k); } catch(e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch(e) { return false; } }
function lsDel(k)    { try { localStorage.removeItem(k); } catch(e) {} }

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function keyToLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES_ES[parseInt(m,10)-1]} ${y}`;
}
function monthIndex(key) { const [y, m] = key.split('-').map(Number); return y * 12 + (m - 1); }
function keyFromIndex(i) { return `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`; }
function monthDiff(a, b) { return monthIndex(b) - monthIndex(a); }
function uid() { return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

function fmtARS(n) {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  return '$' + Math.round(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtUSD(n) {
  if (n === null || n === undefined || isNaN(n)) return 'USD 0';
  const cents = Math.abs(n - Math.round(n)) > 0.004;   // USD 19,99 must not read as USD 20
  return 'USD ' + n.toLocaleString('es-AR', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
}
function fmtAmount(n, currency) { return currency === 'USD' ? fmtUSD(n) : fmtARS(n); }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Reads an amount typed the Argentine way: "655.520" (thousands), "655520", "1.234,56", "12,5", "$ 1.000".
// A lone separator followed by 1-2 digits is a decimal; followed by 3 digits it is a thousands separator.
function parseAmount(raw) {
  let s = String(raw == null ? '' : raw).trim().replace(/[^\d.,]/g, '');
  if (!s) return 0;
  const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
  let dec = null;
  if (dots && commas) dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
  else if (commas) dec = (commas === 1 && /,\d{1,2}$/.test(s)) ? ',' : null;
  else if (dots) dec = (dots === 1 && (/\.\d{1,2}$/.test(s) || /^0\./.test(s))) ? '.' : null;
  if (dec) {
    const i = s.lastIndexOf(dec);
    s = s.slice(0, i).replace(/[.,]/g, '') + '.' + s.slice(i + 1).replace(/[.,]/g, '');
  } else s = s.replace(/[.,]/g, '');
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
// Value shown inside an amount field: plain digits, decimal comma.
function amountForInput(n) {
  const v = parseFloat(n) || 0;
  return v ? String(v).replace('.', ',') : '';
}
function slug(str) { return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function showNotif(msg) {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

let toastTimer = null;
function hideToast() { document.getElementById('toast').classList.remove('show'); }
function showToast(msg, label, fn) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  const btn = document.getElementById('toastBtn');
  btn.textContent = label;
  btn.onclick = () => { hideToast(); fn(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 7000);
}

function saveAll() {
  const ok = lsSet(STORAGE_KEY, JSON.stringify(allMonths)) && lsSet(GH_DELETED_KEY, JSON.stringify(deletedMonths));
  if (!ok) showNotif('⚠ No se pudo guardar en este dispositivo');
}
function markDirty() { lsSet(GH_DIRTY_KEY, '1'); }
// Local safety copies: a ring of the last BACKUP_MAX distinct snapshots (taken before merges, imports,
// deletions and restores), at most one every 10 minutes unless forced.
function backupLocal(force) {
  const data = JSON.stringify(allMonths);
  if (data === '{}') return;
  let list = listBackups();
  const last = list[0];
  if (last && last.data === data) return;
  if (last && !force && Date.now() - last.at < 10 * 60 * 1000) return;
  list.unshift({ at: Date.now(), data });
  list = list.slice(0, BACKUP_MAX);
  if (!lsSet(BACKUPS_KEY, JSON.stringify(list))) lsSet(BACKUPS_KEY, JSON.stringify(list.slice(0, 2)));
  lsSet(BACKUP_KEY, data);
}
function listBackups() {
  try { const l = JSON.parse(lsGet(BACKUPS_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch(e) { return []; }
}

// Every edit goes through commit(): stamp the month, save locally, queue the upload.
function commit(key) {
  if (viewerReadOnly) return;
  const m = allMonths[key || currentKey];
  if (m) { m.updatedAt = Date.now(); delete m.auto; }
  saveAll(); markDirty(); schedulePush();
}

function loadAll() {
  const raw = lsGet(STORAGE_KEY);
  if (raw) {
    try { allMonths = JSON.parse(raw) || {}; }
    catch(e) { lsSet(BACKUP_KEY + '_corrupt', raw); allMonths = {}; }
  }
  try { deletedMonths = JSON.parse(lsGet(GH_DELETED_KEY) || '{}') || {}; } catch(e) { deletedMonths = {}; }
  normalizeAll();
  saveAll();
}

// confirm() does not exist inside claude.ai pages, so confirmations are a dialog of the page itself.
function askConfirm(message, okLabel, cancelLabel, title) {
  return new Promise((resolve) => {
    const ov = document.getElementById('confirmOverlay');
    const ok = document.getElementById('confirmOk'), cancel = document.getElementById('confirmCancel');
    document.getElementById('confirmTitle').textContent = title || '¿Confirmás?';
    document.getElementById('confirmMsg').textContent = message;
    ok.textContent = okLabel || 'Aceptar';
    cancel.textContent = cancelLabel || 'Cancelar';
    const done = (v) => { ov.classList.remove('open'); ok.onclick = null; cancel.onclick = null; ov.onclick = null; resolve(v); };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    ov.onclick = (e) => { if (e.target === ov) done(false); };
    ov.classList.add('open');
    setTimeout(() => cancel.focus(), 30);
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) { return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escText(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
