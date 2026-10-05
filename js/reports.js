// Evolution chart, print/PDF/JPG/CSV/JSON exports and history import.

// ---------- Evolution chart: pesos per month, stacked Pina (bottom) + Mati ----------
function shortARS(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + ' mil';
  return '$' + Math.round(n);
}
function niceMax(v) {
  if (!(v > 0)) return 100000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * p;
}
function trendData() {
  return getSortedKeys().slice(-6).map(k => {
    const t = calcTotals(allMonths[k]);
    const pina = t.pinaARS + t.pinaPersonalARS;
    return { key: k, mati: t.matiARS, pina, total: t.matiARS + pina, usd: t.pinaUSD + t.pinaPersonalUSD };
  });
}
function renderTrend() {
  const svg = document.getElementById('trendSvg');
  if (!svg) return;
  const data = trendData();
  const card = document.getElementById('trendCard');
  if (card) card.hidden = data.length < 2;
  if (data.length < 2) return;
  const W = 640, H = 230, L = 58, R = 12, T = 22, B = 36;
  const max = niceMax(Math.max(...data.map(d => d.total)));
  const step = (W - L - R) / data.length;
  const bw = Math.min(52, step * 0.6);
  const y0 = H - B;
  const hOf = (v) => (H - T - B) * v / max;
  const mono = 'IBM Plex Mono, ui-monospace, monospace';
  let g = '';
  [0, max / 2, max].forEach(t => {
    const yy = y0 - hOf(t);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--border)" stroke-width="1"/>`;
    g += `<text x="${L - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="var(--text-muted)" font-family="${mono}">${shortARS(t)}</text>`;
  });
  data.forEach((d, i) => {
    const cx = L + step * i + step / 2, x = cx - bw / 2;
    const hp = hOf(d.pina), hm = hOf(d.mati);
    if (hp > 0) g += `<rect x="${x}" y="${y0 - hp}" width="${bw}" height="${hp}" rx="3" fill="var(--c-pina)"/>`;
    if (hm > 0) g += `<rect x="${x}" y="${y0 - hp - hm - (hp > 0 ? 2 : 0)}" width="${bw}" height="${hm}" rx="3" fill="var(--c-mati)"/>`;
    const [yy, mm] = d.key.split('-');
    const lab = MONTH_NAMES_ES[parseInt(mm, 10) - 1].slice(0, 3).toLowerCase();
    const cur = d.key === currentKey;
    g += `<text x="${cx}" y="${H - 18}" text-anchor="middle" font-size="12" font-weight="${cur ? 700 : 400}" fill="${cur ? "var(--text)" : "var(--text-muted)"}">${lab}</text>`;
    if (i === 0 || mm === '01') g += `<text x="${cx}" y="${H - 5}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${yy}</text>`;
    if (i === data.length - 1 && d.total > 0) {
      g += `<text x="${cx}" y="${y0 - hp - hm - (hp > 0 && hm > 0 ? 2 : 0) - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text)" font-family="${mono}">${shortARS(d.total)}</text>`;
    }
    g += `<rect data-i="${i}" x="${cx - step / 2}" y="${T - 10}" width="${step}" height="${H - T - B + 10}" fill="transparent"/>`;
  });
  svg.innerHTML = g;
  svg._data = data;
  const last = data[data.length - 1];
  document.getElementById('trendSub').textContent = last.usd > 0.001
    ? `Pesos por mes. Los ${fmtUSD(last.usd)} de Pina en dólares de este mes no entran en el gráfico.`
    : 'Pesos por mes: lo que paga cada uno';
  const rows = data.map(d => `<tr><td>${escHtml(keyToLabel(d.key))}</td><td>${fmtARS(d.pina)}</td><td>${fmtARS(d.mati)}</td><td>${fmtARS(d.total)}</td><td>${d.usd > 0.001 ? fmtUSD(d.usd) : '—'}</td></tr>`).join('');
  document.getElementById('trendTable').innerHTML = `<thead><tr><th>Mes</th><th>Pina</th><th>Mati</th><th>Total</th><th>USD Pina</th></tr></thead><tbody>${rows}</tbody>`;
}
function bindTrend() {
  const svg = document.getElementById('trendSvg'), tip = document.getElementById('trendTip');
  if (!svg || !tip) return;
  svg.addEventListener('pointermove', (e) => {
    const el = e.target.closest ? e.target.closest('[data-i]') : null;
    const d = el && svg._data ? svg._data[parseInt(el.getAttribute('data-i'), 10)] : null;
    if (!d) { tip.classList.remove('show'); return; }
    const box = svg.getBoundingClientRect(), r = el.getBoundingClientRect();
    tip.innerHTML = `${escHtml(keyToLabel(d.key))}<br>Pina <b>${fmtARS(d.pina)}</b><br>Mati <b>${fmtARS(d.mati)}</b><br>Total <b>${fmtARS(d.total)}</b>${d.usd > 0.001 ? `<br>USD Pina <b>${fmtUSD(d.usd)}</b>` : ''}`;
    tip.style.left = Math.min(Math.max(r.left - box.left + r.width / 2, 70), box.width - 70) + 'px';
    tip.style.top = '24px';
    tip.classList.add('show');
  });
  svg.addEventListener('pointerleave', () => tip.classList.remove('show'));
}

function renderPrintHeader(month) {
  document.getElementById('printHeader').innerHTML =
    `<h2 style="margin-bottom:4px">Casa Pipi's — ${keyToLabel(month.key)}</h2>
     <p style="color:#666;font-size:13px">Split global: Mati ${month.matiSplit}% / Pina ${month.pinaSplit}%</p>`;
  const ptbody = document.getElementById('printTbody');
  ptbody.innerHTML = '';
  for (const item of month.items) {
    const { mati, pina, matiPct, pinaPct } = calcShares(item, month);
    const amt = parseFloat(item.amount) || 0;
    const cuota = item.installments ? ` (cuota ${item.installments.current}/${item.installments.total})` : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(item.name + cuota)}</td><td>${item.currency}</td>
      <td>${fmtAmount(amt, item.currency)}</td>
      <td>${item.splitOverride ? `${matiPct}%/${pinaPct}%` : 'Global'}</td>
      <td>${fmtAmount(mati, item.currency)}</td><td>${fmtAmount(pina, item.currency)}</td>`;
    ptbody.appendChild(tr);
  }
  const pbody = document.getElementById('printPinaTbody');
  pbody.innerHTML = '';
  for (const p of pinaPairs(month)) {
    const a = parseFloat(p.ars.amount) || 0, u = parseFloat(p.usd.amount) || 0;
    if (!a && !u) continue;
    const cuota = (it) => it.installments ? ` (cuota ${it.installments.current}/${it.installments.total})` : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escHtml(p.ars.name)}</td><td>${a ? fmtARS(a) + escHtml(cuota(p.ars)) : '—'}</td><td>${u ? fmtUSD(u) + escHtml(cuota(p.usd)) : '—'}</td>`;
    pbody.appendChild(tr);
  }
  document.getElementById('printPinaTable').classList.toggle('print-empty', !pbody.children.length);
}

function copyText() {
  const text = buildTextSummary();
  navigator.clipboard.writeText(text).then(() => showNotif('✓ Texto copiado al portapapeles')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showNotif('✓ Texto copiado');
  });
}

// Saves a file. Inside claude.ai the page cannot start downloads itself: it asks the viewer through the
// downloads capability. In a normal browser it uses a plain download link.
async function saveFile(filename, data, mime) {
  let dl = null;
  if (IS_FRAMED) { try { dl = await window.claude.use('downloads'); } catch(e) { dl = null; } }
  if (dl) {
    try { await dl.save({ filename, data }); return true; }
    catch(e) { if (!e || e.code !== 'declined') showNotif('⚠ No se pudo guardar el archivo'); return false; }
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

async function snapshotCanvas() {
  if (!window.html2canvas) throw new Error('html2canvas');
  buildImageSnapshot();
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch(e) {}
  return html2canvas(document.getElementById('imageSnapshot'), { backgroundColor: '#f8f6f2', scale: 2, useCORS: true });
}

async function downloadPDF() {
  if (!window.html2canvas || !window.jspdf) {
    if (!IS_FRAMED) { window.print(); return; }
    showNotif('⚠ No se pudo cargar el generador de PDF (requiere conexión)'); return;
  }
  showNotif('Generando PDF…');
  try {
    const canvas = await snapshotCanvas();
    const w = canvas.width, h = canvas.height;
    const pdf = new window.jspdf.jsPDF({ unit: 'px', format: [w, h], orientation: w > h ? 'l' : 'p', compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
    if (await saveFile(`casapipis-${currentKey}.pdf`, pdf.output('blob'))) showNotif('✓ PDF listo');
  } catch(e) { showNotif('⚠ No se pudo generar el PDF'); }
}

function buildImageSnapshot() {
  const month = getMonth();
  if (!month) return;
  const t = calcTotals(month);
  const snap = document.getElementById('imageSnapshot');
  let rowsHtml = '';
  for (const item of month.items) {
    const amt = parseFloat(item.amount) || 0;
    if (!amt) continue;
    const { mati, pina, matiPct, pinaPct } = calcShares(item, month);
    const splitTxt = item.splitOverride ? `${matiPct}%/${pinaPct}%` : 'Global';
    const cuota = item.installments ? ` <small style="background:#fef3c7;color:#92400e;border-radius:3px;padding:1px 4px;font-size:10px">c.${item.installments.current}/${item.installments.total}</small>` : '';
    const notesHtml = item.notes ? `<div style="font-size:11px;color:#6b7280;font-style:italic;margin-top:1px">${escHtml(item.notes)}</div>` : '';
    const badge = item.currency === 'USD'
      ? 'background:#dcfce7;color:#166534;border-radius:3px;padding:1px 5px;font-size:11px;font-weight:700'
      : 'background:#dbeafe;color:#1e40af;border-radius:3px;padding:1px 5px;font-size:11px;font-weight:700';
    rowsHtml += `<tr>
      <td>${escHtml(item.name)}${cuota}${notesHtml}</td>
      <td><span style="${badge}">${item.currency}</span></td>
      <td style="font-weight:600;font-variant-numeric:tabular-nums">${fmtAmount(amt, item.currency)}</td>
      <td style="font-size:12px;color:#6b7280">${splitTxt}</td>
      <td style="font-variant-numeric:tabular-nums">${fmtAmount(mati, item.currency)}</td>
      <td style="font-variant-numeric:tabular-nums;color:#0d9488;font-weight:600">${fmtAmount(pina, item.currency)}</td>
    </tr>`;
  }
  let pinaRowsHtml = '';
  for (const item of (month.pinaItems || [])) {
    const amt = parseFloat(item.amount) || 0;
    if (!amt) continue;
    const cuota = item.installments ? ` <small style="background:#fef3c7;color:#92400e;border-radius:3px;padding:1px 4px;font-size:10px">c.${item.installments.current}/${item.installments.total}</small>` : '';
    const notesHtml = item.notes ? `<div style="font-size:11px;color:#6b7280;font-style:italic;margin-top:1px">${escHtml(item.notes)}</div>` : '';
    const badge = item.currency === 'USD'
      ? 'background:#dcfce7;color:#166534;border-radius:3px;padding:1px 5px;font-size:11px;font-weight:700'
      : 'background:#dbeafe;color:#1e40af;border-radius:3px;padding:1px 5px;font-size:11px;font-weight:700';
    pinaRowsHtml += `<tr>
      <td>${escHtml(item.name)}${cuota}${notesHtml}</td>
      <td><span style="${badge}">${item.currency}</span></td>
      <td style="font-weight:600;font-variant-numeric:tabular-nums" colspan="4">${fmtAmount(amt, item.currency)}</td>
    </tr>`;
  }
  const combinedARS = t.pinaARS + t.pinaPersonalARS;
  const combinedUSD = t.pinaUSD + t.pinaPersonalUSD;
  const pinaParts = [];
  if (combinedARS > 0.001) pinaParts.push(fmtARS(combinedARS));
  if (combinedUSD > 0.001) pinaParts.push(fmtUSD(combinedUSD));
  snap.innerHTML = `
    <div class="snap-header">
      <div class="snap-title">🏠 Casa Pipi's</div>
      <div class="snap-sub">${keyToLabel(month.key)} &nbsp;·&nbsp; Split global: Mati ${month.matiSplit}% / Pina ${month.pinaSplit}%</div>
    </div>
    <table class="snap-table">
      <thead><tr><th>Concepto</th><th>Moneda</th><th>Monto</th><th>Split</th><th>Mati</th><th>Pina</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="6" style="text-align:center;color:#6b7280;padding:12px">Sin gastos cargados</td></tr>'}</tbody>
    </table>
    ${pinaRowsHtml ? `
    <div style="font-weight:700;font-size:13px;color:#374151;padding:10px 10px 4px">Gastos Pina</div>
    <table class="snap-table">
      <thead><tr><th>Concepto</th><th>Moneda</th><th colspan="4">Monto</th></tr></thead>
      <tbody>${pinaRowsHtml}</tbody>
    </table>` : ''}
    <div class="snap-totals">
      <div class="snap-block">
        <div class="snap-block-title">Pesos (ARS)</div>
        <div class="snap-row"><span class="lbl">Total</span><span class="val">${fmtARS(t.totalARS)}</span></div>
        <div class="snap-row"><span class="lbl">Mati</span><span class="val">${fmtARS(t.matiARS)}</span></div>
        <div class="snap-row"><span class="lbl">Pina</span><span class="val hi">${fmtARS(t.pinaARS)}</span></div>
      </div>
      <div class="snap-block">
        <div class="snap-block-title">Dólares (USD)</div>
        <div class="snap-row"><span class="lbl">Total</span><span class="val">${fmtUSD(t.totalUSD)}</span></div>
        <div class="snap-row"><span class="lbl">Mati</span><span class="val">${fmtUSD(t.matiUSD)}</span></div>
        <div class="snap-row"><span class="lbl">Pina</span><span class="val hi">${fmtUSD(t.pinaUSD)}</span></div>
      </div>
    </div>
    <div class="snap-pina">
      <div class="snap-pina-lbl">Gastos Pina — ${keyToLabel(month.key)}</div>
      <div class="snap-pina-val">${pinaParts.join(' + ') || '$0'}</div>
    </div>`;
}

async function saveImage() {
  if (!window.html2canvas) { showNotif('⚠ html2canvas no disponible (requiere conexión)'); return; }
  showNotif('Generando imagen…');
  try {
    const canvas = await snapshotCanvas();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (await saveFile(`casapipis-${currentKey}.jpg`, blob)) showNotif('✓ Imagen lista');
  } catch(e) { showNotif('⚠ No se pudo generar la imagen'); }
}

async function shareWhatsApp() {
  if (!window.html2canvas) {
    window.open('https://wa.me/?text=' + encodeURIComponent(buildTextSummary()), '_blank');
    return;
  }
  buildImageSnapshot();
  showNotif('Preparando imagen...');
  try {
    const canvas = await html2canvas(document.getElementById('imageSnapshot'), { backgroundColor: '#f8f6f2', scale: 2, useCORS: true });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], `casapipis-${currentKey}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Casa Pipi's — ${keyToLabel(currentKey)}` });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `casapipis-${currentKey}.png`; a.click();
      URL.revokeObjectURL(url);
      setTimeout(() => window.open('https://wa.me/?text=' + encodeURIComponent(buildTextSummary()), '_blank'), 800);
      showNotif('Imagen descargada — abrila en WhatsApp para compartir');
    }
  } catch(e) {
    if (e.name !== 'AbortError') showNotif('⚠ Error al compartir');
  }
}

async function exportHistory() {
  const keys = getSortedKeys();
  if (!keys.length) { showNotif('⚠ No hay datos para exportar'); return; }
  const payload = { version: 3, savedAt: new Date().toISOString(), months: allMonths, deleted: deletedMonths };
  const ok = await saveFile(`casapipis-historial-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
  if (ok) showNotif(`✓ Historial exportado (${keys.length} ${keys.length===1?'mes':'meses'})`);
}

async function exportToCSV() {
  const keys = getSortedKeys();
  if (!keys.length) { showNotif('⚠ No hay datos para exportar'); return; }
  const rows = [['Mes','Concepto','Moneda','Monto','Split Mati%','Split Pina%','Mati','Pina','Notas','Cuota']];
  for (const key of keys) {
    const month = allMonths[key];
    for (const item of month.items) {
      const amt = parseFloat(item.amount) || 0;
      const { mati, pina, matiPct, pinaPct } = calcShares(item, month);
      const cuota = item.installments ? `${item.installments.current}/${item.installments.total}` : '';
      rows.push([keyToLabel(key), item.name, item.currency, amt, matiPct, pinaPct, Math.round(mati), Math.round(pina), item.notes || '', cuota]);
    }
    for (const item of (month.pinaItems || [])) {
      const amt = parseFloat(item.amount) || 0;
      const cuota = item.installments ? `${item.installments.current}/${item.installments.total}` : '';
      rows.push([keyToLabel(key), `[Pina] ${item.name}`, item.currency, amt, 0, 100, 0, Math.round(amt), item.notes || '', cuota]);
    }
  }
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const ok = await saveFile(`casapipis-${new Date().toISOString().slice(0,10)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  if (ok) showNotif(`✓ CSV exportado (${keys.length} meses)`);
}

function importHistory(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  const reader = new FileReader();
  reader.onload = function(e) {
    let payload;
    try { payload = JSON.parse(e.target.result); } catch { showNotif('⚠ El archivo no es válido'); return; }
    _applyImportedMonths(payload.months || payload, false);
  };
  reader.readAsText(file);
}

async function _applyImportedMonths(imported, replaceAll) {
  const importedKeys = Object.keys(imported).filter(k => imported[k] && Array.isArray(imported[k].items));
  const newKeys      = importedKeys.filter(k => !allMonths[k]);
  const conflictKeys = importedKeys.filter(k =>  allMonths[k]);
  if (!importedKeys.length) { showNotif('ℹ El archivo no tiene datos'); return; }
  backupLocal();
  const take = (k) => { allMonths[k] = imported[k]; allMonths[k].updatedAt = Date.now(); delete deletedMonths[k]; };
  if (conflictKeys.length && !replaceAll) {
    let msg = `Se encontraron ${importedKeys.length} ${importedKeys.length===1?'mes':'meses'}.\n`;
    if (newKeys.length)      msg += `• ${newKeys.length} nuevos (se agregarán)\n`;
    if (conflictKeys.length) msg += `• ${conflictKeys.length} ya existentes:\n\n  OK = Reemplazar\n  Cancelar = Conservar locales`;
    const replace = await askConfirm(msg, 'Reemplazar', 'Conservar los míos', 'Importar historial');
    for (const k of newKeys) take(k);
    if (replace) for (const k of conflictKeys) take(k);
  } else {
    for (const k of importedKeys) take(k);
  }
  resetEditing();
  normalizeAll();
  saveAll(); markDirty(); schedulePush();
  currentKey = latestKey();
  renderAll();
  showNotif(`✓ ${importedKeys.length} ${importedKeys.length===1?'mes importado':'meses importados'}`);
}
