// Theme and startup.

function wantDark() {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return true;
  if (attr === 'light') return false;
  const saved = lsGet(DARK_MODE_KEY);
  if (saved === '1') return true;
  if (saved === '0') return false;
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
function applyTheme() {
  const dark = wantDark();
  document.body.classList.toggle('dark', dark);
  const btn = document.getElementById('darkModeBtn');
  if (btn) btn.textContent = dark ? '☀' : '🌙';
}
function toggleDarkMode() {
  const dark = !wantDark();
  lsSet(DARK_MODE_KEY, dark ? '1' : '0');
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  applyTheme();
}
function initTheme() {
  const saved = lsGet(DARK_MODE_KEY);
  if ((saved === '1' || saved === '0') && !document.documentElement.getAttribute('data-theme')) {
    document.documentElement.setAttribute('data-theme', saved === '1' ? 'dark' : 'light');
  }
  applyTheme();
  try { new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch(e) {}
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch(e) {}
}

(async function init() {
  initTheme();
  adoptTokenFromHash();
  loadAll();
  currentKey = allMonths[todayKey()] ? todayKey() : latestKey();
  bindTrend();
  renderSyncStatus();
  renderAll();
  if (IS_FRAMED) await initArtifactStore(); else registerSW();
  // Pull first (GitHub works without a token) so a device with no data gets the history before any month is created.
  if (storeMode === 'artifact') await withTimeout(firstSnap, 8000);
  else if (storeMode === 'github') await withTimeout(syncNow(), 8000);
  const created = ensureMonths();
  const repaired = repairLegacyCarryOver();
  currentKey = allMonths[todayKey()] ? todayKey() : latestKey();
  renderAll();
  if (created.length || repaired) schedulePush();
  renderSyncStatus();
  initClaude();
})();
