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
      db.collection('months').onSnapshot((snap) => { if (onMonthsSnapshot(snap)) done(); },
                                          (err) => { renderSyncStatus('✗ No se pudo leer la base de datos', 'error'); done(); });
    } catch(e) { done(); }
  });
  try {   // written by the monthly backup routine
    db.doc('meta/backup').onSnapshot((s) => { backupInfo = s && s.exists ? s.data() : null; renderBackupInfo(); }, () => {});
  } catch(e) {}
}

function renderBackupInfo() {
  const el = document.getElementById('backupInfo');
  if (!el) return;
  if (backupInfo && backupInfo.at) {
    const d = new Date(backupInfo.at);
    el.textContent = 'Último respaldo automático en GitHub: ' + d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  } else el.textContent = 'Todavía no hay un respaldo automático en GitHub.';
}

function enterViewerMode() {
  viewerReadOnly = true;
  document.body.classList.add('mode-viewer');
  if (document.getElementById('monthLabel')) renderAll();
  renderSyncStatus();
}

// Returns true when the snapshot is confirmed by the server (a cached first snapshot may be incomplete, so it
// is merged but never triggers an upload nor ends the startup wait).
function onMonthsSnapshot(snap) {
  const cached = !!(snap.metadata && snap.metadata.fromCache) && !firstDelivered;
  const rm = {}, rdel = {};
  remoteSig = {}; remoteTomb = {};
  for (const d of snap.docs) {
    const data = d.data();
    if (!data) continue;
    const copy = JSON.parse(JSON.stringify(data));
    if (copy.deleted) { rdel[d.id] = copy.deleted; remoteTomb[d.id] = copy.deleted; continue; }
    if (!Array.isArray(copy.items)) continue;
    rm[d.id] = copy;
    remoteSig[d.id] = monthSig(copy);
  }
  if (firstDelivered) {
    for (const ch of snap.docChanges()) {
      if (ch.type === 'removed' && allMonths[ch.doc.id] && !(ch.doc.id in rm) && !(ch.doc.id in rdel)) delete allMonths[ch.doc.id];
    }
  }
  const r = mergeRemote({ months: rm, deleted: rdel });
  if (r.changed) { backupLocal(); afterMerge(); }
  if (!cached) {
    firstDelivered = true;
    if (r.localAhead && !viewerReadOnly) { markDirty(); setTimeout(schedulePush, 0); }
  }
  renderSyncStatus();
  return !cached;
}

// Uploads every month whose content differs from what the database has. A deleted month is stored as a
// small marker (`deleted`) instead of removing the document, so another device cannot bring it back.
async function pushArtifact() {
  if (!dbNs || viewerReadOnly) return;
  for (const [k, m] of Object.entries(allMonths)) {
    const sig = monthSig(m);
    if (k in remoteSig && remoteSig[k] === sig) continue;
    await dbNs.doc('months/' + k).set(JSON.parse(JSON.stringify(m)));
    remoteSig[k] = sig; delete remoteTomb[k];
  }
  for (const [k, ts] of Object.entries(deletedMonths)) {
    if (allMonths[k] || (remoteTomb[k] || 0) >= ts) continue;
    await dbNs.doc('months/' + k).set({ key: k, deleted: ts, items: [], pinaItems: [], updatedAt: ts });
    remoteTomb[k] = ts; delete remoteSig[k];
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
  renderBackups();
}

// ---------- Local backups ----------
function renderBackups() {
  const ul = document.getElementById('backupList'), sum = document.getElementById('backupSummary');
  if (!ul) return;
  const list = listBackups();
  if (sum) sum.textContent = `Copias de seguridad en este dispositivo (${list.length})`;
  if (!list.length) { ul.innerHTML = '<li>Todavía no hay copias. Se guardan solas antes de unir cambios, importar o borrar un mes.</li>'; return; }
  ul.innerHTML = list.map((b, i) => {
    let n = 0; try { n = Object.keys(JSON.parse(b.data)).length; } catch(e) {}
    const d = new Date(b.at);
    return `<li><span>${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · ${n} ${n === 1 ? 'mes' : 'meses'}</span>` +
           (viewerReadOnly ? '' : `<button class="btn btn-sm" onclick="restoreBackup(${i})">Restaurar</button>`) + `</li>`;
  }).join('');
}

// Restoring merges the copy over the current data (months only present now are kept) and stamps the restored
// months as just edited, so they also win on the next sync.
async function restoreBackup(i) {
  const b = listBackups()[i];
  if (!b) return;
  if (!(await askConfirm('Los meses de esa copia reemplazan a los actuales. Antes se guarda una copia de lo que hay ahora.', 'Restaurar', 'Cancelar', '¿Restaurar esta copia?'))) return;
  let data; try { data = JSON.parse(b.data); } catch(e) { showNotif('⚠ La copia está dañada'); return; }
  backupLocal(true);
  resetEditing();
  const now = Date.now();
  for (const [k, m] of Object.entries(data)) { m.updatedAt = now; delete m.auto; allMonths[k] = m; delete deletedMonths[k]; }
  normalizeAll(); saveAll(); markDirty(); schedulePush();
  currentKey = allMonths[todayKey()] ? todayKey() : latestKey();
  renderAll(); renderBackups();
  showNotif('✓ Copia restaurada');
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

// Merges the remote copy ({months, deleted}) into the local data. Months deleted on either side stay deleted
// unless edited afterwards; a month the app created by itself (`auto`) always yields to a real copy; real
// copies of the same month are merged item by item (see mergeMonth).
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
    if (!l || l.auto) { allMonths[k] = r; changed = true; continue; }
    if (r.auto) { localAhead = true; continue; }
    if (monthSig(l) === monthSig(r)) { if (ru > lu) l.updatedAt = ru; continue; }
    const merged = mergeMonth(l, r);
    const sig = monthSig(merged);
    if (sig !== monthSig(l)) { allMonths[k] = merged; changed = true; }
    if (sig !== monthSig(r)) localAhead = true;
  }
  for (const [k, ts] of Object.entries(deletedMonths)) {
    const l = allMonths[k];
    if (l && ts > (l.updatedAt || 0)) { delete allMonths[k]; changed = true; }
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
