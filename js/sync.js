// Storage backends: GitHub history.json (Pages) and the claude.ai private database, plus merging.

// ---------- claude.ai page: private shared database (one document per month) ----------
async function initArtifactStore() {
  let db = null;
  try { db = await window.claude.use('db'); } catch(e) { db = null; }
  if (!db) return;
  dbNs = db;
  storeMode = 'artifact';
  document.body.classList.add('mode-artifact');
  try {
    const user = await window.claude.use('user');
    if (user && (await user.can('data.write')) === false) enterViewerMode();
  } catch(e) {}
  firstSnap = new Promise((resolve) => {
    let first = true;
    const done = () => { if (first) { first = false; resolve(); } };
    try {
      db.collection('months').onSnapshot((snap) => { onMonthsSnapshot(snap); done(); },
                                          (err) => { renderSyncStatus('✗ No se pudo leer la base de datos', 'error'); done(); });
    } catch(e) { done(); }
  });
}

function enterViewerMode() {
  viewerReadOnly = true;
  document.body.classList.add('mode-viewer');
  if (document.getElementById('monthLabel')) renderAll();
  renderSyncStatus();
}

function onMonthsSnapshot(snap) {
  const rm = {};
  remoteStamp = {};
  for (const d of snap.docs) {
    const data = d.data();
    if (!data || !Array.isArray(data.items)) continue;
    const copy = JSON.parse(JSON.stringify(data));
    rm[d.id] = copy;
    remoteStamp[d.id] = copy.updatedAt || 0;
  }
  if (firstDelivered) {
    for (const ch of snap.docChanges()) {
      if (ch.type === 'removed' && allMonths[ch.doc.id] && !(ch.doc.id in rm)) delete allMonths[ch.doc.id];
    }
  }
  const r = mergeRemote({ months: rm, deleted: {} });
  if (r.changed) { backupLocal(); afterMerge(); }
  firstDelivered = true;
  if (r.localAhead && !viewerReadOnly) { markDirty(); setTimeout(schedulePush, 0); }
  renderSyncStatus();
}

async function pushArtifact() {
  if (!dbNs || viewerReadOnly) return;
  for (const [k, m] of Object.entries(allMonths)) {
    const stamp = m.updatedAt || 0;
    if (k in remoteStamp && stamp <= remoteStamp[k]) continue;
    await dbNs.doc('months/' + k).set(JSON.parse(JSON.stringify(m)));
    remoteStamp[k] = stamp;
  }
  for (const k of Object.keys(remoteStamp)) {
    if (allMonths[k]) continue;
    await dbNs.doc('months/' + k).delete();
    delete remoteStamp[k];
  }
}

async function syncArtifact(manual) {
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true;
  try {
    await pushArtifact();
    lsDel(GH_DIRTY_KEY);
    renderSyncStatus();
    if (manual) showNotif('✓ Guardado');
  } catch(e) {
    if (e && e.code === 'invalid_argument') { enterViewerMode(); showNotif('Esta cuenta no puede guardar cambios'); }
    else renderSyncStatus('✗ No se pudo guardar (los cambios siguen en este navegador)', 'error');
  } finally {
    syncBusy = false;
    if (syncAgain) { syncAgain = false; syncArtifact(false); }
  }
}

// ---------- GitHub sync ----------
// Reading history.json needs no token (the repo is public); a token is only needed to write.
// Edits are uploaded automatically a few seconds after saving; every sync first merges what is on
// GitHub (per month, newest edit wins) so a stale device can never overwrite newer data.
let syncBusy = false, syncAgain = false, pushTimer = null;

function loadGhToken() { return lsGet(GH_TOKEN_KEY) || ''; }

class SyncError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function adoptTokenFromHash() {
  const m = /[#&]t=([^&]+)/.exec(location.hash || '');
  if (!m) return false;
  let tok = '';
  try { tok = decodeURIComponent(m[1]).trim(); } catch(e) {}
  try { history.replaceState(null, '', location.pathname + location.search); } catch(e) {}
  if (!tok) return false;
  lsSet(GH_TOKEN_KEY, tok);
  return true;
}

function saveGhToken() {
  const val = document.getElementById('ghTokenInput').value.trim();
  if (!val) { showNotif('⚠ Ingresá un token antes de guardar'); return; }
  lsSet(GH_TOKEN_KEY, val);
  renderSyncStatus(); showNotif('✓ Token guardado');
  syncNow({ manual: true });
}

function copyAccessLink() {
  const t = loadGhToken();
  if (!t) { showNotif('⚠ Primero guardá un token'); return; }
  const url = location.origin + location.pathname + '#t=' + encodeURIComponent(t);
  const done = () => showNotif('✓ Link copiado: abrilo en el otro dispositivo');
  navigator.clipboard.writeText(url).then(done).catch(() => { prompt('Copiá este link:', url); });
}

function toggleTokenVisibility() {
  const el = document.getElementById('ghTokenInput');
  el.type = el.type === 'password' ? 'text' : 'password';
}

function renderSyncStatus(msg, cls) {
  const el = document.getElementById('syncStatus');
  const chip = document.getElementById('syncChip');
  const title = document.getElementById('syncTitle');
  const token = loadGhToken();
  const dirty = lsGet(GH_DIRTY_KEY) === '1';
  let text, klass = '', chipTxt = '☁ —', chipCls = '';
  if (msg) {
    text = msg; klass = cls || '';
    chipTxt = cls === 'error' ? '☁ ✗' : '☁ ⟳'; chipCls = cls === 'error' ? 'error' : 'busy';
  } else if (storeMode === 'artifact') {
    if (viewerReadOnly) { text = '● Vista de solo lectura'; chipTxt = '👁'; }
    else if (dirty)     { text = '● Guardando…'; klass = 'busy'; chipTxt = '☁ ●'; chipCls = 'busy'; }
    else                { text = '● Guardado en la base privada de esta página'; klass = 'ok'; chipTxt = '☁ ✓'; chipCls = 'ok'; }
  } else if (storeMode === 'local') {
    text = '● Esta vista no tiene base de datos: los cambios quedan solo en este navegador';
  } else if (!token) {
    text = '● Sin token: se lee el historial de GitHub, pero los cambios quedan solo en este dispositivo';
  } else if (dirty) {
    text = '● Hay cambios pendientes de subir a GitHub'; klass = 'busy'; chipTxt = '☁ ●'; chipCls = 'busy';
  } else {
    const last = lsGet(GH_LAST_SYNC_KEY);
    if (last) {
      const d = new Date(last);
      const fmt = d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
      text = `● Sincronizado con GitHub (${fmt})`;
    } else text = '● Token configurado — todavía sin sincronizar';
    klass = 'ok'; chipTxt = '☁ ✓'; chipCls = 'ok';
  }
  if (title) title.textContent = storeMode === 'artifact' ? 'Datos' : storeMode === 'local' ? 'Datos de este navegador' : 'Sincronización con GitHub';
  if (el) { el.textContent = text; el.className = 'sync-status ' + klass; }
  if (chip) { chip.textContent = chipTxt; chip.className = 'sync-chip ' + chipCls; chip.title = text; }
  const input = document.getElementById('ghTokenInput');
  if (input && token && !input.value) input.value = token;
}

function toBase64(str)   { return btoa(unescape(encodeURIComponent(str))); }
function fromBase64(str) { return decodeURIComponent(escape(atob(str))); }

async function ghFetchPages() {
  try {
    const r = await fetch('data/history.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return { payload: null, sha: null };
    return { payload: await r.json(), sha: null };
  } catch(e) { throw new SyncError('offline', 'Sin conexión'); }
}

async function ghFetchRemote() {
  const token = loadGhToken();
  const headers = { 'Accept': 'application/vnd.github+json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let res;
  try { res = await fetch(GH_API_URL + '?t=' + Date.now(), { headers, cache: 'no-store' }); }
  catch(e) { throw new SyncError('offline', 'Sin conexión'); }
  if (!res.ok) {
    if (!token) return await ghFetchPages();
    if (res.status === 404) return { payload: null, sha: null };
    if (res.status === 401) throw new SyncError('auth', 'Token vencido o inválido');
    if (res.status === 403) throw new SyncError('perm', 'El token no tiene permiso de escritura (Contents: Read and write)');
    throw new SyncError('http', 'GitHub respondió ' + res.status);
  }
  const file = await res.json();
  const payload = JSON.parse(fromBase64(String(file.content || '').replace(/\n/g, '')));
  return { payload, sha: file.sha };
}

// Per-month merge: the newest edit wins; months only on one side are kept; deletions are honored.
function mergeRemote(remote) {
  const rm   = (remote && remote.months) || remote || {};
  const rdel = (remote && remote.deleted) || {};
  let changed = false, localAhead = false;
  for (const [k, ts] of Object.entries(rdel)) if (ts > (deletedMonths[k] || 0)) deletedMonths[k] = ts;
  for (const [k, r] of Object.entries(rm)) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.items)) continue;
    const l = allMonths[k];
    const ru = r.updatedAt || 0, lu = l ? (l.updatedAt || 0) : 0;
    const del = deletedMonths[k] || 0;
    if (del && del > ru && del > lu) { if (l) { delete allMonths[k]; changed = true; } continue; }
    if (!l) { allMonths[k] = r; changed = true; }
    else if (ru > lu) { allMonths[k] = r; changed = true; }
    else if (lu > ru) localAhead = true;
  }
  for (const k of Object.keys(allMonths)) if (!(k in rm)) localAhead = true;
  for (const [k, ts] of Object.entries(deletedMonths)) if (ts > (rdel[k] || 0)) localAhead = true;
  return { changed, localAhead };
}

function afterMerge() {
  normalizeAll();
  ensureMonths();
  saveAll();
  if (!allMonths[currentKey]) currentKey = allMonths[todayKey()] ? todayKey() : latestKey();
  if (!editingItemId && !editingPinaPairId) renderAll();
}

function schedulePush() {
  if (viewerReadOnly) return;
  if (storeMode === 'local') { renderSyncStatus(); return; }
  if (storeMode === 'github' && !loadGhToken()) { renderSyncStatus(); return; }
  clearTimeout(pushTimer);
  renderSyncStatus('● Guardando cambios…', 'busy');
  pushTimer = setTimeout(() => syncNow(), storeMode === 'artifact' ? 1200 : 2500);
}

async function syncNow({ manual = false } = {}) {
  if (storeMode === 'artifact') return syncArtifact(manual);
  if (storeMode === 'local') { renderSyncStatus(); return; }
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true;
  const token = loadGhToken();
  renderSyncStatus('⟳ Sincronizando con GitHub…', 'busy');
  try {
    let pushed = false, merged = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await ghFetchRemote();
      let ahead = !remote.payload && getSortedKeys().length > 0;
      if (remote.payload) {
        const before = JSON.stringify(allMonths);
        const r = mergeRemote(remote.payload);
        ahead = r.localAhead;
        if (r.changed) { backupLocal(); afterMerge(); merged = JSON.stringify(allMonths) !== before; }
      }
      const dirty = lsGet(GH_DIRTY_KEY) === '1';
      if (!token) break;
      if (!ahead && !dirty) { lsSet(GH_LAST_SYNC_KEY, new Date().toISOString()); break; }
      const payload = { version: 3, savedAt: new Date().toISOString(), months: allMonths, deleted: deletedMonths };
      const body = { message: `Casa Pipi's: actualizar historial ${new Date().toLocaleDateString('es-AR')}`,
                     content: toBase64(JSON.stringify(payload, null, 2)), ...(remote.sha ? { sha: remote.sha } : {}) };
      let res;
      try {
        res = await fetch(GH_API_URL, { method: 'PUT', headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch(e) { throw new SyncError('offline', 'Sin conexión'); }
      if (res.status === 409 || res.status === 422) continue;   // someone else saved in between: re-fetch, merge, retry
      if (res.status === 401) throw new SyncError('auth', 'Token vencido o inválido');
      if (res.status === 403 || res.status === 404) throw new SyncError('perm', 'El token no tiene permiso de escritura (Contents: Read and write)');
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new SyncError('http', err.message || 'Error ' + res.status); }
      lsDel(GH_DIRTY_KEY);
      lsSet(GH_LAST_SYNC_KEY, new Date().toISOString());
      pushed = true;
      break;
    }
    renderSyncStatus();
    if (manual) showNotif(pushed ? '✓ Cambios guardados en GitHub' : merged ? '✓ Datos actualizados desde GitHub' : '✓ Todo sincronizado');
  } catch(e) {
    const code = e.code || 'http';
    if (code === 'auth') renderSyncStatus('✗ Token vencido o inválido: generá uno nuevo (link abajo) y pegalo acá', 'error');
    else if (code === 'offline') renderSyncStatus('● Sin conexión: los cambios se suben cuando vuelva', 'busy');
    else renderSyncStatus('✗ ' + (e.message || 'Error al sincronizar'), 'error');
    if (manual) showNotif('⚠ No se pudo sincronizar');
  } finally {
    syncBusy = false;
    if (syncAgain) { syncAgain = false; syncNow(); }
  }
}

function withTimeout(p, ms) { return Promise.race([p, new Promise(r => setTimeout(r, ms))]); }

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !loadGhToken()) return;
  const last = Date.parse(lsGet(GH_LAST_SYNC_KEY) || '') || 0;
  if (Date.now() - last > 60000 && !editingItemId && !editingPinaPairId) syncNow();
});
window.addEventListener('online', () => { if (loadGhToken()) syncNow(); });

// Opening the access link in a tab that is already open only changes the hash (no reload).
window.addEventListener('hashchange', () => {
  if (adoptTokenFromHash()) { renderSyncStatus(); showNotif('✓ Token configurado'); syncNow({ manual: true }); }
});

function registerSW() {
  if (!IS_FRAMED && 'serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
