// Review of a card statement: every line Claude read, with a checkbox. Only the checked lines are loaded
// into the month (summed per currency); the lines are kept as the concept's detail, and installment
// purchases can be followed in the next month.

let review = null;   // { data, lines, destValue, newName, emisor }
const LINE_TYPES = ['compra', 'cuota', 'impuesto', 'interes', 'pago', 'otro'];
const TYPE_LABEL = { cuota: 'Cuota', impuesto: 'Impuesto o sello', interes: 'Interés', pago: 'Pago o bonificación', otro: 'Revisar' };

function parseCuota(q) { const m = /(\d+)\s*\/\s*(\d+)/.exec(String(q || '')); return m ? { n: +m[1], t: +m[2] } : null; }
const lineKeyLoose = (c, monto, cur) => slug(c) + '|' + Number(monto).toFixed(2) + '|' + cur;
const sgn = (l) => (l.tipo === 'pago' ? -1 : 1);

function normalizeLines(data) {
  return (Array.isArray(data.lineas) ? data.lineas : []).map(l => {
    const monto = Math.abs(typeof l.monto === 'number' ? l.monto : parseAmount(l.monto));
    const q = parseCuota(l.cuota);
    let tipo = LINE_TYPES.includes(l.tipo) ? l.tipo : 'otro';
    if (tipo === 'compra' && q) tipo = 'cuota';
    return { fecha: String(l.fecha || '').trim(), comercio: String(l.comercio || '').trim() || 'Sin descripción',
             moneda: l.moneda === 'USD' ? 'USD' : 'ARS', monto, tipo, cuota: q, on: false, touched: false, track: !!(q && q.n < q.t), flag: '' };
  }).filter(l => l.monto > 0);
}

function destPairOf(month, value) {
  return value && value.indexOf('p:') === 0 ? pinaPairs(month).find(p => p.pairId === value.slice(2)) : null;
}
// A line that is already followed as an installment concept of this month (created by an earlier review).
function trackedMatch(month, l) {
  if (!l.cuota) return null;
  return pinaPairs(month).find(p => !p.ars.isRecurring && [p.ars, p.usd].some(it => it.currency === l.moneda && it.installments
    && it.installments.current === l.cuota.n && it.installments.total === l.cuota.t && slug(it.name) === slug(l.comercio)
    && Math.abs((parseFloat(it.amount) || 0) - l.monto) < 1));
}

// Lines that need a decision start unchecked, with a label saying why.
function computeFlags() {
  const month = getMonth();
  const dest = destPairOf(month, review.destValue);
  const loaded = new Set();
  if (dest) for (const it of [dest.ars, dest.usd]) for (const d of (it.detail || [])) loaded.add(lineKeyLoose(d.c, Math.abs(parseFloat(d.m) || 0), it.currency));
  const seen = new Set();
  for (const l of review.lines) {
    let flag = TYPE_LABEL[l.tipo] && l.tipo !== 'cuota' ? TYPE_LABEL[l.tipo] : '';
    const k = lineKeyLoose(l.comercio, l.monto, l.moneda) + '|' + l.fecha;
    if (!flag && loaded.has(lineKeyLoose(l.comercio, l.monto, l.moneda))) flag = 'Ya cargado este mes';
    else if (!flag && seen.has(k)) flag = 'Posible duplicado';
    else if (!flag && trackedMatch(month, l)) flag = 'Ya la sigo como cuota';
    seen.add(k);
    l.flag = flag;
    if (!l.touched) l.on = !flag;
  }
}

function openReview(data) {
  const month = getMonth();
  const lines = normalizeLines(data);
  if (!lines.length) return false;
  const emisor = String(data.emisor || '').trim();
  const pairs = pinaPairs(month);
  const hit = pairs.find(p => emisor && (slug(p.ars.name) === slug(emisor) || slug(emisor).includes(slug(p.ars.name)) || slug(p.ars.name).includes(slug(emisor))));
  review = { data, lines, emisor, destValue: hit ? 'p:' + hit.pairId : 'new', newName: hit ? '' : (emisor || 'Resumen de tarjeta') };
  computeFlags();
  buildReview();
  document.getElementById('reviewOverlay').classList.add('open');
  return true;
}

function closeReview() {
  document.getElementById('reviewOverlay').classList.remove('open');
  review = null;
}

function buildReview() {
  const month = getMonth();
  const dests = pinaPairs(month).map(p => `<option value="p:${escAttr(p.pairId)}"${review.destValue === 'p:' + p.pairId ? " selected" : ""}>${escHtml(p.ars.name)}</option>`).join('')
    + `<option value="new"${review.destValue === "new" ? " selected" : ""}>Concepto nuevo…</option>`;
  const dest = destPairOf(month, review.destValue);
  const has = dest && ((parseFloat(dest.ars.amount) > 0) || (parseFloat(dest.usd.amount) > 0));
  const hasDetail = dest && ((dest.ars.detail || []).length || (dest.usd.detail || []).length);
  const mode = review.mode || (hasDetail ? 'add' : 'replace');
  review.mode = mode;
  const cur = (c) => { const it = dest && (c === 'ARS' ? dest.ars : dest.usd); const v = it ? parseFloat(it.amount) || 0 : 0; return v > 0 ? fmtAmount(v, c) : ''; };
  const nowTxt = [cur('ARS'), cur('USD')].filter(Boolean).join(' + ');
  const emi = review.emisor ? ' · ' + escHtml(review.emisor) : '';
  let html = `<div class="review-head">
      <h3 id="reviewTitle">Revisar resumen${emi}</h3>
      <div class="card-sub" style="margin:2px 0 10px">Marcá solo lo que querés incluir en ${escHtml(keyToLabel(currentKey))}. Las líneas dudosas vienen sin marcar.</div>
      <div class="rv-dest"><label for="rvDest">Cargar en</label><select id="rvDest" onchange="onReviewDest()">${dests}</select>
        <input type="text" id="rvNew" placeholder="Nombre del concepto" value="${escAttr(review.newName)}" ${review.destValue === "new" ? "" : "hidden"}></div>`;
  if (has) {
    html += `<div class="rv-mode">Ahora tiene <b>${escHtml(nowTxt)}</b> cargado:
      <label><input type="radio" name="rvMode" value="replace"${mode === "replace" ? " checked" : ""} onchange="review.mode='replace'"> reemplazar</label>
      <label><input type="radio" name="rvMode" value="add"${mode === "add" ? " checked" : ""} onchange="review.mode='add'"> sumar a lo que tiene</label></div>`;
  }
  html += `<div class="rv-tools"><button class="btn btn-sm" onclick="reviewMark('buys')">Solo compras</button>
      <button class="btn btn-sm" onclick="reviewMark('all')">Todas</button><button class="btn btn-sm" onclick="reviewMark('none')">Ninguna</button></div></div>
    <div class="review-body" id="reviewList">`;
  for (const c of ['ARS', 'USD']) {
    const rows = review.lines.map((l, i) => [l, i]).filter(x => x[0].moneda === c);
    if (!rows.length) continue;
    html += `<div class="review-group">${c === 'ARS' ? 'Pesos' : 'Dólares'}</div>`;
    for (const [l, i] of rows) {
      const meta = [l.fecha, l.cuota ? `cuota ${l.cuota.n}/${l.cuota.t}` : ''].filter(Boolean).join(' · ');
      html += `<div class="rv-row${l.on ? "" : " off"}" id="rvRow${i}">
        <input type="checkbox" id="rvOn${i}" ${l.on ? "checked" : ""} onchange="onReviewLine(${i})" aria-label="Incluir ${escAttr(l.comercio)}">
        <label class="rv-name" for="rvOn${i}">${escHtml(l.comercio)}${l.flag ? `<span class="rv-tag">${escHtml(l.flag)}</span>` : ""}<div class="rv-meta">${escHtml(meta)}</div></label>
        <div class="rv-amt">${l.tipo === "pago" ? "−" : ""}${fmtAmount(l.monto, c)}</div>
        ${l.cuota && l.cuota.n < l.cuota.t ? `<label class="rv-track"><input type="checkbox" id="rvTrack${i}" ${l.track ? "checked" : ""} onchange="review.lines[${i}].track=this.checked"> Seguir esta cuota en ${escHtml(keyToLabel(keyFromIndex(monthIndex(currentKey) + 1)).split(" ")[0])} (${l.cuota.n + 1}/${l.cuota.t})</label>` : ""}
      </div>`;
    }
  }
  html += `</div><div class="review-foot"><div class="rv-sum" id="rvSum"></div>
      <div class="rv-actions"><button class="btn" onclick="closeReview()">Cancelar</button>
      <button class="btn btn-primary" id="rvApply" onclick="applyReview()">Cargar lo marcado</button></div></div>`;
  document.getElementById('reviewBox').innerHTML = html;
  const nm = document.getElementById('rvNew');
  if (nm) nm.addEventListener('input', () => { review.newName = nm.value; });
  updateReviewTotals();
}

function onReviewDest() {
  review.destValue = document.getElementById('rvDest').value;
  review.mode = null;
  computeFlags();
  buildReview();
}

function onReviewLine(i) {
  const l = review.lines[i];
  l.on = document.getElementById('rvOn' + i).checked;
  l.touched = true;
  document.getElementById('rvRow' + i).classList.toggle('off', !l.on);
  updateReviewTotals();
}

function reviewMark(what) {
  review.lines.forEach((l, i) => {
    l.on = what === 'all' ? true : what === 'none' ? false : (!l.flag && (l.tipo === 'compra' || l.tipo === 'cuota'));
    l.touched = true;
    const cb = document.getElementById('rvOn' + i);
    if (cb) cb.checked = l.on;
    const row = document.getElementById('rvRow' + i);
    if (row) row.classList.toggle('off', !l.on);
  });
  updateReviewTotals();
}

// Per currency: what is checked, and whether the lines Claude read add up to the total printed in the statement.
function updateReviewTotals() {
  const parts = [];
  for (const c of ['ARS', 'USD']) {
    const lines = review.lines.filter(l => l.moneda === c);
    if (!lines.length) continue;
    const marked = lines.filter(l => l.on).reduce((a, l) => a + sgn(l) * l.monto, 0);
    const total = review.data.totales ? Number(review.data.totales[c]) : 0;
    let check = '';
    if (total > 0) {
      const calc = lines.reduce((a, l) => a + sgn(l) * l.monto, 0);
      check = Math.abs(calc - total) <= Math.max(1, total * 0.005)
        ? `<span class="rv-ok">✓ Las líneas leídas coinciden con el total del resumen</span>`
        : `<span class="rv-warn">⚠ Las líneas suman ${fmtAmount(calc, c)} y el resumen dice ${fmtAmount(total, c)}: puede faltar o sobrar una línea</span>`;
    }
    parts.push(`<div><b>${c === 'ARS' ? 'Pesos' : 'Dólares'}: ${fmtAmount(marked, c)}</b>${total > 0 ? ` <span class="rv-of">de ${fmtAmount(total, c)} del resumen</span>` : ''}<div>${check}</div></div>`);
  }
  document.getElementById('rvSum').innerHTML = parts.join('');
  const n = review.lines.filter(l => l.on).length;
  const btn = document.getElementById('rvApply');
  btn.disabled = n === 0;
  btn.textContent = n ? `Cargar ${n} ${n === 1 ? 'línea' : 'líneas'}` : 'Cargar lo marcado';
}

function applyReview() {
  const month = getMonth(), key = currentKey;
  if (!month || isReadonly()) { showNotif('Este mes está en solo lectura'); return; }
  const sel = review.lines.filter(l => l.on);
  if (!sel.length) return;
  const before = { key, month: deepClone(month), nextKey: null, nextBefore: null };
  const now = Date.now();
  let pair = destPairOf(month, review.destValue);
  const created = !pair;
  if (!pair) pair = addPinaPair(month, { name: (review.newName || '').trim() || review.emisor || 'Resumen de tarjeta' });
  const mode = created ? 'replace' : (review.mode || 'replace');
  const parts = [];
  for (const c of ['ARS', 'USD']) {
    const lines = sel.filter(l => l.moneda === c);
    if (!lines.length) continue;
    const it = c === 'ARS' ? pair.ars : pair.usd;
    const sum = lines.reduce((a, l) => a + sgn(l) * l.monto, 0);
    const base = mode === 'add' ? (parseFloat(it.amount) || 0) : 0;
    it.amount = Math.round((base + sum) * 100) / 100;
    it.detail = (mode === 'add' ? (it.detail || []) : []).concat(lines.map(l => ({
      f: l.fecha, c: l.comercio, m: sgn(l) * l.monto, q: l.cuota ? String(l.cuota.n).padStart(2, '0') + '/' + String(l.cuota.t).padStart(2, '0') : '' })));
    it.ts = now;
    parts.push(fmtAmount(it.amount, c));
  }
  // Installments to follow: they start next month as their own concept (the carry-over then continues them).
  const toTrack = sel.filter(l => l.track && l.cuota && l.cuota.n < l.cuota.t);
  let tracked = 0, nextLabel = '';
  if (toTrack.length) {
    const nextKey = keyFromIndex(monthIndex(key) + 1);
    nextLabel = keyToLabel(nextKey).split(' ')[0];
    if (monthIndex(nextKey) <= monthIndex(todayKey()) + 1) {
      before.nextKey = nextKey;
      before.nextBefore = allMonths[nextKey] ? deepClone(allMonths[nextKey]) : null;
      const nm = ensureMonthRecord(nextKey);
      for (const l of toTrack) {
        const nxt = { current: l.cuota.n + 1, total: l.cuota.t };
        const dup = pinaPairs(nm).some(p => !p.ars.isRecurring && slug(p.ars.name) === slug(l.comercio)
          && [p.ars, p.usd].some(it => it.installments && it.installments.total === nxt.total && it.installments.current >= nxt.current));
        if (dup) continue;
        addPinaPair(nm, { name: l.comercio, currency: l.moneda, amount: l.monto, installments: nxt, notes: review.emisor ? 'Resumen ' + review.emisor : '' });
        tracked++;
      }
      normalizePina(nm);
      commit(nextKey);
    }
  }
  normalizePina(month);
  commit(key);
  const name = pair.ars.name;
  closeReview();
  closeProposal();
  renderAll();
  const extra = tracked ? ` y ${tracked} ${tracked === 1 ? 'cuota' : 'cuotas'} para seguir en ${nextLabel}` : '';
  showToast(`Cargué ${sel.length} ${sel.length === 1 ? 'línea' : 'líneas'} en ${name} (${parts.join(' + ')})${extra}`, 'Deshacer', () => {
    const later = Date.now();
    const bump = (m) => { for (const it of m.items.concat(m.pinaItems || [])) it.ts = later; };
    allMonths[key] = before.month; bump(allMonths[key]);
    if (before.nextKey) {
      if (before.nextBefore) { allMonths[before.nextKey] = before.nextBefore; bump(allMonths[before.nextKey]); commit(before.nextKey); }
      else { delete allMonths[before.nextKey]; deletedMonths[before.nextKey] = later; saveAll(); markDirty(); schedulePush(); }
    }
    commit(key);
    if (currentKey === key) renderAll();
  });
}

document.addEventListener('keydown', (e) => {
  const ov = document.getElementById('reviewOverlay');
  if (e.key === 'Escape' && ov && ov.classList.contains('open') && !document.getElementById('confirmOverlay').classList.contains('open')) closeReview();
});
