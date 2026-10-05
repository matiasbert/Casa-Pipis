// Screen: month header, Gastos / Gastos Pina tables, edit actions, month navigation and history dialog.

function renderAll() {
  const month = getMonth();
  if (!month) {
    document.getElementById('monthLabel').textContent = Object.keys(allMonths).length ? '—' : 'Cargando…';
    return;
  }
  const readonly = isReadonly();
  const past = currentKey < todayKey();

  document.getElementById('matiSplitInput').value = month.matiSplit;
  document.getElementById('pinaSplitInput').value = month.pinaSplit;
  document.getElementById('monthLabel').textContent = keyToLabel(currentKey);

  const badge = document.getElementById('readonlyBadge');
  if (viewerReadOnly)    { badge.style.display = ''; badge.textContent = 'Vista de solo lectura';   badge.className = 'readonly-badge'; }
  else if (month.locked) { badge.style.display = ''; badge.textContent = '🔒 Cerrado';             badge.className = 'locked-badge'; }
  else if (readonly)     { badge.style.display = ''; badge.textContent = 'Solo lectura';           badge.className = 'readonly-badge'; }
  else if (past)         { badge.style.display = ''; badge.textContent = 'Editando mes anterior';  badge.className = 'readonly-badge'; }
  else                   { badge.style.display = 'none'; badge.className = 'readonly-badge'; }

  const lockBtn = document.getElementById('lockBtn');
  const unlockBtn = document.getElementById('unlockBtn');
  unlockBtn.style.display = (past && !month.locked && !unlockedKeys.has(currentKey)) ? '' : 'none';
  if (!past || month.locked || unlockedKeys.has(currentKey)) {
    lockBtn.style.display = '';
    lockBtn.textContent = month.locked ? '🔓 Reabrir mes' : '🔒 Cerrar mes';
    lockBtn.className = month.locked ? 'btn btn-sm btn-primary' : 'btn btn-sm';
  } else {
    lockBtn.style.display = 'none';
  }

  const keys = getSortedKeys();
  const idx  = keys.indexOf(currentKey);
  document.getElementById('prevMonthBtn').disabled = idx <= 0;
  document.getElementById('nextMonthBtn').disabled = idx >= keys.length - 1;
  document.getElementById('matiSplitInput').disabled = readonly;
  document.getElementById('pinaSplitInput').disabled = readonly;
  document.getElementById('addRowBtnWrap').style.display = readonly ? 'none' : '';
  document.getElementById('addPinaRowBtnWrap').style.display = readonly ? 'none' : '';

  renderTable(month, readonly);
  renderPinaTable(month, readonly);
  renderTotals(month);
  renderPrintHeader(month);
  renderTrend();
  const wa = document.getElementById('waLink');
  if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent(buildTextSummary());
}

function renderTable(month, readonly) {
  const tbody = document.getElementById('expenseTbody');
  tbody.innerHTML = '';
  if (!month.items.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="7"><div class="empty-state">Sin gastos aún.<br><p>Hacé clic en "+ Agregar gasto" para empezar.</p></div></td>`;
    tbody.appendChild(tr);
    return;
  }
  for (const item of month.items) {
    if (editingItemId === item.id && !readonly) tbody.appendChild(buildEditRow(item, month));
    else tbody.appendChild(buildViewRow(item, month, readonly));
  }
}

// Arrow + percentage against the same concept last month (installments are constant, so they are skipped).
function deltaBadge(item) {
  if (item.installments) return '';
  const keys = getSortedKeys();
  const i = keys.indexOf(currentKey);
  if (i <= 0) return '';
  const p = allMonths[keys[i - 1]];
  const q = p && p.items.find(x => x.name === item.name && x.currency === item.currency && !x.installments);
  const prev = q ? parseFloat(q.amount) || 0 : 0;
  const cur = parseFloat(item.amount) || 0;
  if (!(prev > 0) || !(cur > 0)) return '';
  const pct = (cur - prev) / prev * 100;
  if (Math.abs(pct) < 1) return '';
  const up = pct > 0;
  return `<span class="delta ${up ? "up" : "down"}" title="Mes anterior: ${fmtAmount(prev, item.currency)}">${up ? "▲" : "▼"} ${Math.abs(Math.round(pct))}%</span>`;
}

function buildViewRow(item, month, readonly) {
  const { mati, pina, matiPct, pinaPct } = calcShares(item, month);
  const hasOverride = !!item.splitOverride;
  const splitLabel = hasOverride
    ? `<span class="split-override-label">${matiPct}% / ${pinaPct}%</span>`
    : `<span class="split-label">Global (${matiPct}% / ${pinaPct}%)</span>`;
  const installBadge = item.installments
    ? `<span class="installment-badge">cuota ${item.installments.current}/${item.installments.total}</span>` : '';
  const notesHtml = item.notes
    ? `<div class="item-notes">${escHtml(item.notes)}</div>` : '';

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${escHtml(item.name)}${installBadge}${notesHtml}</td>
    <td data-label="Moneda"><span class="badge-${item.currency.toLowerCase()}">${item.currency}</span></td>
    <td class="amount" data-label="Monto">${fmtAmount(parseFloat(item.amount)||0, item.currency)}${deltaBadge(item)}</td>
    <td data-label="Split">${splitLabel}</td>
    <td class="share" data-label="Mati">${fmtAmount(mati, item.currency)}</td>
    <td class="share" data-label="Pina">${fmtAmount(pina, item.currency)}</td>
    <td><div class="actions-cell">${!readonly
      ? `<button class="btn btn-sm" onclick="startEdit('${item.id}')">✏️ Editar</button>
         <button class="btn btn-sm btn-danger" onclick="deleteItem('${item.id}')">✕</button>`
      : '—'}</div></td>`;
  return tr;
}

function buildEditRow(item, month) {
  const matiVal = item.splitOverride ? item.splitOverride.mati : month.matiSplit;
  const pinaVal = item.splitOverride ? item.splitOverride.pina : month.pinaSplit;
  const instChecked = item.installments ? 'checked' : '';
  const instCurrent = item.installments ? item.installments.current : 1;
  const instTotal   = item.installments ? item.installments.total   : 12;
  const instDisplay = item.installments ? 'inline-flex' : 'none';

  const tr = document.createElement('tr');
  tr.className = 'edit-row';
  tr.innerHTML = `
    <td><input type="text" id="eName" value="${escAttr(item.name)}" placeholder="Concepto"></td>
    <td data-label="Moneda">
      <select id="eCurrency">
        <option value="ARS"${item.currency==='ARS'?' selected':''}>ARS</option>
        <option value="USD"${item.currency==='USD'?' selected':''}>USD</option>
      </select>
    </td>
    <td data-label="Monto"><input type="number" inputmode="decimal" id="eAmount" value="${item.amount||""}" placeholder="0" min="0" step="0.01"></td>
    <td colspan="3" data-label="Split">
      <div class="split-edit-row">
        <div class="split-edit-inputs">
          <span style="font-size:12px;color:var(--text-muted)">Mati</span>
          <input type="number" id="eMati" value="${matiVal}" min="0" max="100" step="1" oninput="syncSplitInputs('mati')">
          <span style="font-size:12px">%</span>
          <span style="font-size:12px;color:var(--text-muted)">Pina</span>
          <input type="number" id="ePina" value="${pinaVal}" min="0" max="100" step="1" oninput="syncSplitInputs('pina')">
          <span style="font-size:12px">%</span>
          <span class="split-sum-hint" id="splitSumHint"></span>
        </div>
        <button class="btn btn-sm" onclick="resetToGlobalSplit()" title="Usar el split global del mes">↺ Global (${month.matiSplit}%/${month.pinaSplit}%)</button>
      </div>
      <div class="install-row">
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--text)">
          <input type="checkbox" id="eInstall" ${instChecked} onchange="toggleInstallUI()">
          <span>Cuotas</span>
        </label>
        <span id="installDetails" style="display:${instDisplay};align-items:center;gap:4px">
          <span>Cuota</span>
          <input type="number" id="eInstallCurrent" value="${instCurrent}" min="1" style="width:48px!important">
          <span>de</span>
          <input type="number" id="eInstallTotal" value="${instTotal}" min="1" style="width:48px!important">
        </span>
      </div>
      <div style="margin-top:6px">
        <textarea id="eNotes" placeholder="Notas (opcional)" rows="2">${escText(item.notes || '')}</textarea>
      </div>
    </td>
    <td>
      <div class="actions-cell">
        <button class="btn btn-sm btn-primary" onclick="saveEdit('${item.id}')">✓ Guardar</button>
        <button class="btn btn-sm" onclick="cancelEdit()">✕</button>
      </div>
    </td>`;
  return tr;
}

function pinaPairs(month) {
  const items = month.pinaItems || [];
  const seen = new Set();
  const pairs = [];
  for (const it of items) {
    if (seen.has(it.pairId)) continue;
    seen.add(it.pairId);
    pairs.push({
      pairId: it.pairId,
      ars: items.find(i => i.pairId === it.pairId && i.currency === 'ARS'),
      usd: items.find(i => i.pairId === it.pairId && i.currency === 'USD'),
    });
  }
  return pairs.filter(p => p.ars && p.usd);
}

function renderPinaTable(month, readonly) {
  const tbody = document.getElementById('pinaExpenseTbody');
  tbody.innerHTML = '';
  const pairs = pinaPairs(month);
  if (!pairs.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4"><div class="empty-state">Sin gastos propios.<br><p>Hacé clic en "+ Agregar gasto" para empezar.</p></div></td>`;
    tbody.appendChild(tr);
    return;
  }
  for (const p of pairs) {
    if (editingPinaPairId === p.pairId && !readonly) tbody.appendChild(buildPinaPairedEditRow(p.ars, p.usd));
    else tbody.appendChild(buildPinaPairedRow(p.ars, p.usd, readonly));
  }
}

function pinaCell(item, badgeClass, badgeText, fmt) {
  const amt = parseFloat(item.amount) || 0;
  const inst = item.installments ? `<span class="installment-badge">c.${item.installments.current}/${item.installments.total}</span>` : "";
  const notes = item.notes ? `<div class="item-notes">${escHtml(item.notes)}</div>` : "";
  return `<span class="${badgeClass}">${badgeText}</span> <span class="${amt ? "" : "zero-amt"}">${fmt(amt)}</span>${inst}${notes}`;
}

function buildPinaPairedRow(arsItem, usdItem, readonly) {
  const tr = document.createElement('tr');
  const fixed = !!arsItem.isRecurring;
  const actions = readonly ? "—" :
    `<button class="btn btn-sm" onclick="startPinaEdit('${arsItem.pairId}')">✏️ Editar</button>` +
    (fixed ? `<span class="fixed-tag" title="Concepto fijo: no se puede eliminar">🔒 fijo</span>`
           : `<button class="btn btn-sm btn-danger" onclick="deletePinaPair('${arsItem.pairId}')" title="Eliminar">✕</button>`);
  tr.innerHTML = `
    <td>${escHtml(arsItem.name || "Sin nombre")}</td>
    <td class="amount" data-label="Pesos">${pinaCell(arsItem, "badge-ars", "ARS", fmtARS)}</td>
    <td class="amount" data-label="Dólares">${pinaCell(usdItem, "badge-usd", "USD", fmtUSD)}</td>
    <td><div class="actions-cell">${actions}</div></td>`;
  return tr;
}

function pinaInstBlock(sfx, item) {
  const on  = !!item.installments;
  const cur = on ? item.installments.current : 1;
  const tot = on ? item.installments.total : 12;
  return `<div class="install-row">
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--text)">
        <input type="checkbox" id="pInst${sfx}" ${on ? "checked" : ""} onchange="togglePinaInst('${sfx}')"><span>Cuotas</span>
      </label>
      <span id="pInstBox${sfx}" style="display:${on ? "inline-flex" : "none"};align-items:center;gap:4px">
        <input type="number" id="pInstCur${sfx}" value="${cur}" min="1" style="width:48px!important"><span>de</span>
        <input type="number" id="pInstTot${sfx}" value="${tot}" min="1" style="width:48px!important">
      </span>
    </div>`;
}

function buildPinaPairedEditRow(arsItem, usdItem) {
  const fixed = !!arsItem.isRecurring;
  const tr = document.createElement('tr');
  tr.className = 'edit-row';
  tr.innerHTML = `
    <td data-label="Concepto"><input type="text" id="pName" value="${escAttr(arsItem.name || "")}" placeholder="Concepto" ${fixed ? "readonly" : ""}></td>
    <td data-label="Pesos">
      <span class="badge-ars" style="display:inline-block;margin-bottom:5px">ARS</span>
      <input type="number" inputmode="decimal" id="pAmountARS" value="${arsItem.amount || ""}" placeholder="0" min="0" step="0.01">
      <input type="text" id="pNotesARS" value="${escAttr(arsItem.notes || "")}" placeholder="Notas" style="margin-top:4px">
      ${pinaInstBlock("ARS", arsItem)}
    </td>
    <td data-label="Dólares">
      <span class="badge-usd" style="display:inline-block;margin-bottom:5px">USD</span>
      <input type="number" inputmode="decimal" id="pAmountUSD" value="${usdItem.amount || ""}" placeholder="0" min="0" step="0.01">
      <input type="text" id="pNotesUSD" value="${escAttr(usdItem.notes || "")}" placeholder="Notas" style="margin-top:4px">
      ${pinaInstBlock("USD", usdItem)}
    </td>
    <td>
      <div class="actions-cell">
        <button class="btn btn-sm btn-primary" onclick="savePinaPair('${arsItem.pairId}')">✓ Guardar</button>
        <button class="btn btn-sm" data-act="cancel" onclick="cancelPinaEdit()">✕</button>
      </div>
    </td>`;
  return tr;
}

function togglePinaInst(sfx) {
  const chk = document.getElementById('pInst' + sfx);
  const box = document.getElementById('pInstBox' + sfx);
  if (box) box.style.display = chk.checked ? 'inline-flex' : 'none';
}

function startPinaEdit(pairId) {
  discardPending();
  editingItemId = null;
  editingPinaPairId = pairId;
  renderAll();
  setTimeout(() => {
    const el = document.getElementById('pName');
    const target = (el && !el.readOnly) ? el : document.getElementById('pAmountARS');
    if (target) target.focus();
  }, 50);
}

function cancelPinaEdit() {
  discardPending();
  editingPinaPairId = null;
  renderAll();
}

function readPinaInst(sfx) {
  const chk = document.getElementById('pInst' + sfx);
  if (!chk || !chk.checked) return null;
  const cur = parseInt(document.getElementById('pInstCur' + sfx)?.value) || 1;
  const tot = parseInt(document.getElementById('pInstTot' + sfx)?.value) || cur;
  return { current: Math.max(1, cur), total: Math.max(cur, tot) };
}

function savePinaPair(pairId) {
  const month = getMonth();
  if (!month) return;
  const items = (month.pinaItems || []).filter(i => i.pairId === pairId);
  const ars = items.find(i => i.currency === 'ARS');
  const usd = items.find(i => i.currency === 'USD');
  if (!ars || !usd) return;
  let name = (document.getElementById('pName')?.value || '').trim();
  if (ars.isRecurring) name = ars.name;
  if (!name) name = 'Sin nombre';
  ars.name = name; usd.name = name;
  ars.amount = parseFloat(document.getElementById('pAmountARS')?.value) || 0;
  usd.amount = parseFloat(document.getElementById('pAmountUSD')?.value) || 0;
  ars.notes = (document.getElementById('pNotesARS')?.value || '').trim();
  usd.notes = (document.getElementById('pNotesUSD')?.value || '').trim();
  ars.installments = readPinaInst('ARS');
  usd.installments = readPinaInst('USD');
  editingPinaPairId = null;
  pendingNewPinaPairId = null;
  commit();
  renderAll();
}

function deletePinaPair(pairId) {
  const month = getMonth();
  if (!month) return;
  const removed = (month.pinaItems || []).filter(i => i.pairId === pairId);
  if (!removed.length || removed.some(i => i.isRecurring)) return;
  const idx = month.pinaItems.findIndex(i => i.pairId === pairId);
  month.pinaItems = month.pinaItems.filter(i => i.pairId !== pairId);
  if (editingPinaPairId === pairId) editingPinaPairId = null;
  const key = currentKey;
  commit(key);
  renderAll();
  showToast(`"${removed[0].name || "Gasto"}" eliminado`, 'Deshacer', () => {
    const m = allMonths[key];
    if (!m) return;
    m.pinaItems.splice(Math.min(idx, m.pinaItems.length), 0, ...removed);
    commit(key);
    if (currentKey === key) renderAll();
  });
}

function addNewPinaItem() {
  const month = getMonth();
  if (!month) return;
  discardPending();
  editingItemId = null;
  const pairId = uid();
  const mk = (cur) => ({ id: uid(), pairId, name: "", currency: cur, amount: 0, notes: "", installments: null, isRecurring: false });
  month.pinaItems.push(mk("ARS"), mk("USD"));
  editingPinaPairId = pairId;
  pendingNewPinaPairId = pairId;
  renderAll();
  setTimeout(() => {
    const lastRow = document.getElementById('pinaExpenseTbody').lastElementChild;
    if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const nameInput = document.getElementById('pName');
    if (nameInput) nameInput.focus();
  }, 100);
}

function toggleInstallUI() {
  const chk = document.getElementById('eInstall');
  const det = document.getElementById('installDetails');
  if (det) det.style.display = chk.checked ? 'inline-flex' : 'none';
}

function resetToGlobalSplit() {
  const month = getMonth();
  if (!month) return;
  document.getElementById('eMati').value = month.matiSplit;
  document.getElementById('ePina').value = month.pinaSplit;
  updateSplitHint();
}

function syncSplitInputs(changed) {
  const matiEl = document.getElementById('eMati');
  const pinaEl = document.getElementById('ePina');
  let m = parseFloat(matiEl.value) || 0;
  let p = parseFloat(pinaEl.value) || 0;
  if (changed === 'mati') { m = clamp(m,0,100); pinaEl.value = Math.max(0, 100-m); }
  else                    { p = clamp(p,0,100); matiEl.value = Math.max(0, 100-p); }
  updateSplitHint();
}

function updateSplitHint() {
  const hint = document.getElementById('splitSumHint');
  if (!hint) return;
  const m = parseFloat(document.getElementById('eMati').value) || 0;
  const p = parseFloat(document.getElementById('ePina').value) || 0;
  const sum = m + p;
  if (Math.abs(sum - 100) > 0.01) { hint.textContent = `⚠ Suma: ${sum}%`; hint.className = 'split-sum-hint error'; }
  else                              { hint.textContent = '✓ 100%';            hint.className = 'split-sum-hint'; }
}

function renderTotals(month) {
  const t = calcTotals(month);
  document.getElementById('totalARS').textContent = fmtARS(t.totalARS);
  document.getElementById('matiARS').textContent  = fmtARS(t.matiARS);
  document.getElementById('pinaARS').textContent  = fmtARS(t.pinaARS);
  document.getElementById('totalUSD').textContent = fmtUSD(t.totalUSD);
  document.getElementById('matiUSD').textContent  = fmtUSD(t.matiUSD);
  document.getElementById('pinaUSD').textContent  = fmtUSD(t.pinaUSD);
  document.getElementById('pinaOwesLabel').textContent = `Gastos Pina — ${keyToLabel(currentKey)}`;
  const combinedARS = t.pinaARS + t.pinaPersonalARS;
  const combinedUSD = t.pinaUSD + t.pinaPersonalUSD;
  const parts = [];
  if (combinedARS > 0.001) parts.push(fmtARS(combinedARS));
  if (combinedUSD > 0.001) parts.push(fmtUSD(combinedUSD));
  document.getElementById('pinaOwes').textContent = parts.length ? parts.join(' + ') : '$0';
  const detail = document.getElementById('pinaPersonalDetail');
  if (detail) {
    const personalParts = [];
    if (t.pinaPersonalARS > 0.001) personalParts.push(fmtARS(t.pinaPersonalARS));
    if (t.pinaPersonalUSD > 0.001) personalParts.push(fmtUSD(t.pinaPersonalUSD));
    detail.textContent = personalParts.length ? `Propios Pina: ${personalParts.join(' + ')}` : '';
  }
}

function resetEditing() {
  discardPending();
  editingItemId = null;
  editingPinaPairId = null;
}
// Rows added with "+ Agregar" only exist in memory until saved; leaving the form drops them.
function discardPending() {
  const month = getMonth();
  if (month) {
    if (pendingNewItemId) month.items = month.items.filter(i => i.id !== pendingNewItemId);
    if (pendingNewPinaPairId) month.pinaItems = (month.pinaItems || []).filter(i => i.pairId !== pendingNewPinaPairId);
  }
  pendingNewItemId = null;
  pendingNewPinaPairId = null;
}

function startEdit(id) {
  discardPending();
  editingPinaPairId = null;
  editingItemId = id;
  renderAll();
  setTimeout(() => { const el = document.getElementById('eName'); if (el) el.focus(); }, 50);
}
function cancelEdit() { discardPending(); editingItemId = null; renderAll(); }

function saveEdit(id) {
  const month = getMonth();
  if (!month) return;
  const name     = (document.getElementById('eName')?.value || '').trim();
  const currency = document.getElementById('eCurrency')?.value || 'ARS';
  const amount   = parseFloat(document.getElementById('eAmount')?.value) || 0;
  const m        = parseFloat(document.getElementById('eMati')?.value) || 0;
  const p        = parseFloat(document.getElementById('ePina')?.value) || 0;
  const notes    = (document.getElementById('eNotes')?.value || '').trim();
  const instChk  = document.getElementById('eInstall');
  const instCur  = parseInt(document.getElementById('eInstallCurrent')?.value) || 1;
  const instTot  = parseInt(document.getElementById('eInstallTotal')?.value)   || instCur;

  if (Math.abs(m + p - 100) > 0.01) { showNotif('⚠ El split debe sumar 100%'); return; }

  const splitOverride = (m === month.matiSplit && p === month.pinaSplit) ? null : { mati: m, pina: p };
  const installments  = instChk?.checked
    ? { current: Math.max(1, instCur), total: Math.max(instCur, instTot) }
    : null;

  const item = month.items.find(i => i.id === id);
  if (item) {
    item.name = name || item.name || 'Sin nombre';
    item.currency = currency;
    item.amount = amount;
    item.splitOverride = splitOverride;
    item.notes = notes;
    item.installments = installments;
  }
  editingItemId = null;
  pendingNewItemId = null;
  commit();
  renderAll();
}

function deleteItem(id) {
  const month = getMonth();
  if (!month) return;
  const idx = month.items.findIndex(i => i.id === id);
  if (idx < 0) return;
  const removed = month.items.splice(idx, 1)[0];
  if (editingItemId === id) editingItemId = null;
  const key = currentKey;
  commit(key);
  renderAll();
  showToast(`"${removed.name || "Gasto"}" eliminado`, 'Deshacer', () => {
    const mm = allMonths[key];
    if (!mm) return;
    mm.items.splice(Math.min(idx, mm.items.length), 0, removed);
    commit(key);
    if (currentKey === key) renderAll();
  });
}

function addNewItem() {
  const month = getMonth();
  if (!month) return;
  discardPending();
  editingPinaPairId = null;
  const newItem = { id: uid(), name: '', currency: 'ARS', amount: 0, splitOverride: null, notes: '', installments: null, isRecurring: false };
  month.items.push(newItem);
  editingItemId = newItem.id;
  pendingNewItemId = newItem.id;
  renderAll();
  setTimeout(() => {
    const lastRow = document.getElementById('expenseTbody').lastElementChild;
    if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const el = document.getElementById('eName'); if (el) el.focus();
  }, 100);
}

// Creates the month after the latest one (at most one month ahead of today), carrying over
// Alquiler and installments.
function createNewMonth() {
  resetEditing();
  const last = latestKey();
  const nextIdx = last ? monthIndex(last) + 1 : monthIndex(todayKey());
  if (nextIdx > monthIndex(todayKey()) + 1) {
    currentKey = last; renderAll();
    showNotif('Ya existe el mes siguiente');
    return;
  }
  const key = keyFromIndex(nextIdx);
  const m = createMonthRecord(key);
  applyCarryOver(m);
  allMonths[key] = m;
  delete deletedMonths[key];
  currentKey = key;
  commit();
  renderAll();
  showNotif(`Nuevo mes creado: ${keyToLabel(key)}`);
}

function navigateMonth(delta) {
  const keys = getSortedKeys();
  const idx = keys.indexOf(currentKey);
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= keys.length) return;
  resetEditing();
  currentKey = keys[newIdx];
  renderAll();
}

async function toggleLockMonth() {
  const month = getMonth();
  if (!month) return;
  if (!month.locked && !(await askConfirm('No vas a poder editar los gastos hasta reabrirlo.', 'Cerrar mes', 'Cancelar', '¿Cerrar el mes?'))) return;
  resetEditing();
  month.locked = !month.locked;
  if (!month.locked && currentKey < todayKey()) unlockedKeys.add(currentKey);
  commit(); renderAll();
  showNotif(month.locked ? '🔒 Mes cerrado' : '🔓 Mes reabierto');
}

function unlockMonth() {
  unlockedKeys.add(currentKey);
  renderAll();
  showNotif('✏️ Edición habilitada para ' + keyToLabel(currentKey));
}

document.getElementById('matiSplitInput').addEventListener('change', function() {
  const month = getMonth();
  if (!month || isReadonly()) return;
  let m = clamp(parseFloat(this.value)||0, 0, 100);
  month.matiSplit = m; month.pinaSplit = 100 - m;
  document.getElementById('pinaSplitInput').value = month.pinaSplit;
  commit(); renderAll();
});
document.getElementById('pinaSplitInput').addEventListener('change', function() {
  const month = getMonth();
  if (!month || isReadonly()) return;
  let p = clamp(parseFloat(this.value)||0, 0, 100);
  month.pinaSplit = p; month.matiSplit = 100 - p;
  document.getElementById('matiSplitInput').value = month.matiSplit;
  commit(); renderAll();
});
document.getElementById('prevMonthBtn').addEventListener('click', () => navigateMonth(-1));
document.getElementById('nextMonthBtn').addEventListener('click', () => navigateMonth(1));

// Enter saves, Escape cancels while an edit row is open.
document.addEventListener('keydown', (e) => {
  const row = e.target && e.target.closest ? e.target.closest('.edit-row') : null;
  if (!row) return;
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
    const btn = row.querySelector('.btn-primary');
    if (btn) btn.click();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    const btn = row.querySelector('[data-act="cancel"]');
    if (btn) btn.click();
  }
});

function openModal() {
  const list = document.getElementById('monthList');
  list.innerHTML = '';
  const keys = getSortedKeys().reverse();
  if (!keys.length) { list.innerHTML = '<li style="color:var(--text-muted);font-size:13px">Sin meses guardados.</li>'; }
  for (const k of keys) {
    const li = document.createElement('li');
    li.className = k === currentKey ? 'active' : '';
    li.innerHTML = `
      <span>${keyToLabel(k)}${allMonths[k]?.locked ? ' 🔒' : ''}</span>
      <div class="month-list-actions">
        <button class="btn btn-sm" onclick="goToMonth('${k}')">Ver</button>
        ${k !== todayKey() ? `<button class="btn btn-sm btn-danger" onclick="deleteMonth('${k}')">Borrar</button>` : ''}
      </div>`;
    list.appendChild(li);
  }
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
document.getElementById('modalOverlay').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
function goToMonth(key) { resetEditing(); currentKey = key; closeModal(); renderAll(); }
async function deleteMonth(key) {
  if (!(await askConfirm('Esta acción no se puede deshacer.', 'Borrar', 'Cancelar', `¿Borrar ${keyToLabel(key)}?`))) return;
  resetEditing();
  backupLocal();
  delete allMonths[key];
  deletedMonths[key] = Date.now();
  saveAll(); markDirty(); schedulePush();
  const last = latestKey();
  currentKey = last || todayKey();
  if (!last) { ensureMonths(); currentKey = latestKey(); }
  closeModal(); renderAll(); showNotif('Mes borrado');
}
