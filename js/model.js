// Data model: months/items, Gastos Pina pairs, carry-over of Alquiler and installments, totals.

// Items created automatically get ids derived from what they are (not random), so two devices that
// create the same month independently produce the same ids and their edits merge cleanly.
function newItemFromTemplate(tpl) {
  return { id: 'tpl-' + slug(tpl.name) + '-' + tpl.currency, name: tpl.name, currency: tpl.currency, amount: 0, splitOverride: null, notes: '', installments: null, isRecurring: true, ts: 0 };
}
function newPinaItemFromTemplate(tpl) {
  return { id: 'tplp-' + slug(tpl.name) + '-' + tpl.currency, pairId: 'tpl:' + tpl.name.toLowerCase(), name: tpl.name, currency: tpl.currency, amount: 0, notes: '', installments: null, isRecurring: true, ts: 0 };
}

// Gastos Pina is stored as a flat list, but every concept always has exactly one ARS and one USD
// entry sharing a pairId. This repairs old data (no pairId, lone currency, duplicated names, missing
// Visa/Mastercard) so the UI can rely on complete pairs.
function normalizePina(month) {
  const src = (month.pinaItems || []).filter(i => i && (i.currency === 'ARS' || i.currency === 'USD'));
  const pairs = new Map();
  const slot = (pid) => { if (!pairs.has(pid)) pairs.set(pid, { pairId: pid, ars: null, usd: null }); return pairs.get(pid); };
  const leftovers = [];
  for (const it of src) {
    const nm = (it.name || '').trim().toLowerCase();
    const tpl = PINA_RECURRING_TEMPLATES.find(t => t.name.toLowerCase() === nm);
    const pid = it.pairId || (tpl ? 'tpl:' + nm : null);
    if (pid) {
      const s = slot(pid);
      const k = it.currency === 'ARS' ? 'ars' : 'usd';
      if (!s[k]) { s[k] = it; continue; }
    }
    leftovers.push(it);
  }
  const byName = {};
  for (const it of leftovers) {
    const nm = (it.name || '').trim().toLowerCase();
    if (!byName[nm]) byName[nm] = [];
    byName[nm].push(it);
  }
  for (const list of Object.values(byName)) {
    const ars = list.filter(i => i.currency === 'ARS');
    const usd = list.filter(i => i.currency === 'USD');
    const n = Math.max(ars.length, usd.length);
    for (let i = 0; i < n; i++) { const s = slot('pr-' + (ars[i] || usd[i]).id); s.ars = ars[i] || null; s.usd = usd[i] || null; }
  }
  for (const tpl of PINA_RECURRING_TEMPLATES) slot('tpl:' + tpl.name.toLowerCase());
  const ordered = [];
  for (const tpl of PINA_RECURRING_TEMPLATES) {
    const s = pairs.get('tpl:' + tpl.name.toLowerCase());
    if (!ordered.includes(s)) ordered.push(s);
  }
  for (const s of pairs.values()) if (!ordered.includes(s)) ordered.push(s);
  const out = [];
  for (const s of ordered) {
    const isTpl = s.pairId.indexOf('tpl:') === 0;
    const tplName = isTpl ? PINA_RECURRING_TEMPLATES.find(t => 'tpl:' + t.name.toLowerCase() === s.pairId).name : null;
    const base = s.ars || s.usd;
    const name = isTpl ? tplName : ((base && base.name) || '');
    if (!isTpl && s.pairId !== pendingNewPinaPairId && !name.trim() && !(parseFloat(s.ars && s.ars.amount) > 0) && !(parseFloat(s.usd && s.usd.amount) > 0)) continue;
    for (const cur of ['ARS', 'USD']) {
      const k = cur === 'ARS' ? 'ars' : 'usd';
      if (!s[k]) s[k] = { id: isTpl ? 'tplp-' + slug(name) + '-' + cur : 'cp-' + (base ? base.id : uid()) + '-' + cur, name, currency: cur, amount: 0, notes: '', installments: null, isRecurring: isTpl, ts: 0 };
      s[k].pairId = s.pairId;
      s[k].name = name;
      if (isTpl) s[k].isRecurring = true;
      out.push(s[k]);
    }
  }
  month.pinaItems = out;
}

function normalizeAll() {
  for (const m of Object.values(allMonths)) {
    if (!Array.isArray(m.items)) m.items = [];
    m.items = m.items.filter(i => i && (i.isRecurring || i.id === pendingNewItemId || (i.name || '').trim() || parseFloat(i.amount) > 0));
    normalizePina(m);
  }
}

// A month created by the app (not by the user) is flagged `auto` and carries no edit time: any real copy of
// that month (on GitHub or in the database) always wins over it, so a slow or offline device can never
// overwrite data with an empty month. The first edit (commit) clears the flag.
// Creates a month on purpose (real, not `auto`) with the usual carry-over; returns the existing one if it is there.
function ensureMonthRecord(key) {
  if (allMonths[key]) return allMonths[key];
  const m = createMonthRecord(key);
  applyCarryOver(m);
  delete m.auto;
  allMonths[key] = m;
  delete deletedMonths[key];
  return m;
}

// Adds a Gastos Pina concept (ARS + USD pair) to a month; `o` = { name, currency, amount, installments, notes }.
function addPinaPair(month, o) {
  const pairId = uid(), now = Date.now();
  const mk = (cur) => {
    const mine = o.currency === cur;
    return { id: uid(), pairId, name: o.name, currency: cur, amount: mine ? (o.amount || 0) : 0, notes: mine ? (o.notes || '') : '',
             installments: mine ? (o.installments || null) : null, isRecurring: false, ts: now };
  };
  const ars = mk('ARS'), usd = mk('USD');
  month.pinaItems.push(ars, usd);
  return { pairId, ars, usd };
}

function createMonthRecord(key) {
  const m = { key, matiSplit: 75, pinaSplit: 25, locked: false, updatedAt: 0, auto: true,
              items: RECURRING_TEMPLATES.map(newItemFromTemplate),
              pinaItems: PINA_RECURRING_TEMPLATES.map(newPinaItemFromTemplate) };
  return m;
}

// Copy installment items forward. `gap` = months between the source month and the new one, so the
// counter stays right even when a month in between was never created.
function carryInstallments(from, into, gap) {
  for (const item of from) {
    if (!item.installments) continue;
    const next = item.installments.current + gap;
    if (next > item.installments.total) continue;
    const inst = { current: next, total: item.installments.total };
    if (item.isRecurring) {
      const same = into.find(i => i.isRecurring && i.name === item.name && i.currency === item.currency);
      if (same) { same.installments = inst; same.amount = item.amount; continue; }
    }
    const dup = into.some(i => i.name === item.name && i.currency === item.currency && i.installments && i.installments.total === item.installments.total);
    if (dup) continue;
    into.push({ ...item, id: 'car-' + slug(item.name) + '-' + item.currency + '-' + item.installments.total, ts: 0, installments: inst });
  }
}

function applyCarryOver(newMonth) {
  const prevKeys = getSortedKeys().filter(k => k < newMonth.key);
  if (!prevKeys.length) return;
  const prev = allMonths[prevKeys[prevKeys.length - 1]];
  if (!prev) return;
  const gap = Math.max(1, monthDiff(prev.key, newMonth.key));
  newMonth.matiSplit = prev.matiSplit;
  newMonth.pinaSplit = prev.pinaSplit;
  const newAlq = newMonth.items.find(i => i.name === 'Alquiler');
  if (newAlq) {
    for (let i = prevKeys.length - 1; i >= 0; i--) {
      const a = allMonths[prevKeys[i]].items.find(x => x.name === 'Alquiler' && parseFloat(x.amount) > 0);
      if (a) { newAlq.amount = a.amount; break; }
    }
  }
  carryInstallments(prev.items, newMonth.items, gap);
  carryInstallments(prev.pinaItems || [], newMonth.pinaItems, gap);
  normalizePina(newMonth);
}

function getSortedKeys() { return Object.keys(allMonths).sort(); }
function latestKey() { const k = getSortedKeys(); return k.length ? k[k.length - 1] : ''; }
function getMonth() { return allMonths[currentKey]; }

// Creates every month from the first stored one up to today (also fills holes in the middle),
// carrying over Alquiler and installments from the previous month each time.
function ensureMonths() {
  if (viewerReadOnly) return [];
  const keys = getSortedKeys();
  const todayIdx = monthIndex(todayKey());
  const first = keys.length ? monthIndex(keys[0]) : todayIdx;
  const last  = Math.max(keys.length ? monthIndex(keys[keys.length - 1]) : todayIdx, todayIdx);
  const created = [];
  for (let i = first; i <= last; i++) {
    const key = keyFromIndex(i);
    if (allMonths[key]) continue;
    if (deletedMonths[key] && i !== todayIdx) continue;
    delete deletedMonths[key];
    const m = createMonthRecord(key);
    applyCarryOver(m);
    allMonths[key] = m;
    created.push(key);
  }
  if (created.length) { saveAll(); markDirty(); }
  return created;
}

// One-time fix for months created by v1.5 on a device that had no history yet: they never received
// the Alquiler amount nor the next installment. Only touches months never edited with v1.6+.
function repairLegacyCarryOver() {
  if (viewerReadOnly || lsGet(REPAIR_KEY)) return false;
  const keys = getSortedKeys();
  let any = false;
  for (let i = 1; i < keys.length; i++) {
    const m = allMonths[keys[i]], p = allMonths[keys[i - 1]];
    if (m.updatedAt || m.auto) continue;
    const gap = Math.max(1, monthDiff(p.key, m.key));
    let changed = false;
    const alq = m.items.find(x => x.name === 'Alquiler');
    const palq = p.items.find(x => x.name === 'Alquiler');
    if (alq && palq && !(parseFloat(alq.amount) > 0) && parseFloat(palq.amount) > 0) { alq.amount = palq.amount; changed = true; }
    const n1 = m.items.length, n2 = (m.pinaItems || []).length;
    carryInstallments(p.items, m.items, gap);
    carryInstallments(p.pinaItems || [], m.pinaItems, gap);
    if (m.items.length !== n1 || m.pinaItems.length !== n2) changed = true;
    if (changed) { normalizePina(m); m.updatedAt = Date.now(); any = true; }
  }
  lsSet(REPAIR_KEY, '1');
  if (any) { saveAll(); markDirty(); }
  return any;
}

// ---------- merging two copies of the same month ----------
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = canon(v[k]); return o; }
  return v;
}
// Content signature (ignores the edit time and the auto flag): equal signature = same data.
function monthSig(m) {
  const byId = (a, b) => (String(a.id) < String(b.id) ? -1 : 1);
  return JSON.stringify(canon({ k: m.key, ms: m.matiSplit, ps: m.pinaSplit, l: !!m.locked,
    i: [...(m.items || [])].sort(byId), p: [...(m.pinaItems || [])].sort(byId), r: m.removed || {} }));
}
// Merges two copies of one month item by item. Month-level fields come from the copy edited last; each
// item takes its newest version (`ts`); an item that exists on one side only is kept when it was added or
// edited after the other side's deletion of it (`removed`). Legacy items (no `ts`) follow the newest copy.
function mergeMonth(l, r) {
  const lu = l.updatedAt || 0, ru = r.updatedAt || 0;
  const win = ru > lu ? r : l, lose = win === r ? l : r;
  const removed = { ...(lose.removed || {}) };
  for (const [id, ts] of Object.entries(win.removed || {})) removed[id] = Math.max(removed[id] || 0, ts);
  const mergeList = (wl, ll) => {
    const out = [], seen = new Set();
    const lmap = new Map((ll || []).map(i => [i.id, i]));
    for (const it of wl || []) {
      seen.add(it.id);
      const o = lmap.get(it.id);
      if (!o && (lose.removed || {})[it.id] >= (it.ts || 0) && (it.ts || 0) > 0) continue;   // the other side deleted it after its last edit
      out.push(o && (o.ts || 0) > (it.ts || 0) ? o : it);
    }
    for (const it of ll || []) {
      if (seen.has(it.id)) continue;
      const ts = it.ts || 0;
      if (ts === 0) continue;
      if ((removed[it.id] || 0) >= ts) continue;
      out.push(it);
    }
    return out;
  };
  const merged = { ...win, items: mergeList(win.items, lose.items), pinaItems: mergeList(win.pinaItems, lose.pinaItems),
                   updatedAt: Math.max(lu, ru) };
  if (Object.keys(removed).length) merged.removed = removed; else delete merged.removed;
  delete merged.auto;
  return merged;
}

function isReadonly() {
  const m = getMonth();
  if (!m || viewerReadOnly) return true;
  if (m.locked) return true;
  return currentKey < todayKey() && !unlockedKeys.has(currentKey);
}

function calcShares(item, month) {
  const matiPct = item.splitOverride ? item.splitOverride.mati : month.matiSplit;
  const pinaPct = item.splitOverride ? item.splitOverride.pina : month.pinaSplit;
  const amt = parseFloat(item.amount) || 0;
  return { mati: amt * matiPct / 100, pina: amt * pinaPct / 100, matiPct, pinaPct };
}
function calcTotals(month) {
  let totalARS=0, matiARS=0, pinaARS=0, totalUSD=0, matiUSD=0, pinaUSD=0;
  let pinaPersonalARS=0, pinaPersonalUSD=0;
  for (const item of month.items) {
    const amt = parseFloat(item.amount) || 0;
    const { mati, pina } = calcShares(item, month);
    if (item.currency === 'ARS') { totalARS+=amt; matiARS+=mati; pinaARS+=pina; }
    else                          { totalUSD+=amt; matiUSD+=mati; pinaUSD+=pina; }
  }
  for (const item of (month.pinaItems || [])) {
    const amt = parseFloat(item.amount) || 0;
    if (item.currency === 'ARS') pinaPersonalARS += amt;
    else                          pinaPersonalUSD += amt;
  }
  return { totalARS, matiARS, pinaARS, totalUSD, matiUSD, pinaUSD, pinaPersonalARS, pinaPersonalUSD };
}

function buildTextSummary() {
  const month = getMonth();
  if (!month) return '';
  const t = calcTotals(month);
  const lines = [`Casa Pipi's — ${keyToLabel(month.key)}`, '', 'GASTOS:'];
  for (const item of month.items) {
    const amt = parseFloat(item.amount) || 0;
    if (!amt) continue;
    const { pina } = calcShares(item, month);
    const cuota = item.installments ? ` (cuota ${item.installments.current}/${item.installments.total})` : '';
    const notes = item.notes ? ` — ${item.notes}` : '';
    lines.push(`• ${item.name}${cuota}: ${fmtAmount(amt, item.currency)} → Pina: ${fmtAmount(pina, item.currency)}${notes}`);
  }
  lines.push('', `TOTAL PESOS: ${fmtARS(t.totalARS)} | Pina: ${fmtARS(t.pinaARS)}`);
  lines.push(`TOTAL USD: ${fmtUSD(t.totalUSD)} | Pina: ${fmtUSD(t.pinaUSD)}`);
  const pinaPersonalItems = (month.pinaItems || []).filter(i => parseFloat(i.amount) > 0);
  if (pinaPersonalItems.length) {
    lines.push('', 'GASTOS PROPIOS PINA:');
    for (const item of pinaPersonalItems) {
      const amt = parseFloat(item.amount) || 0;
      const cuota = item.installments ? ` (cuota ${item.installments.current}/${item.installments.total})` : '';
      const notes = item.notes ? ` — ${item.notes}` : '';
      lines.push(`• ${item.name}${cuota}: ${fmtAmount(amt, item.currency)}${notes}`);
    }
  }
  lines.push('');
  const combinedARS = t.pinaARS + t.pinaPersonalARS;
  const combinedUSD = t.pinaUSD + t.pinaPersonalUSD;
  const combinedParts = [];
  if (combinedARS > 0.001) combinedParts.push(fmtARS(combinedARS));
  if (combinedUSD > 0.001) combinedParts.push(fmtUSD(combinedUSD));
  lines.push(`Gastos Pina ${keyToLabel(month.key)}: ${combinedParts.join(' + ') || '$0'}`);
  return lines.join('\n');
}
