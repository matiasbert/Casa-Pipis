// Yearly summary: totals per concept, average, evolution (sparkline) and how much each one went up or down.

let yearSelected = '';

function yearsAvailable() {
  return [...new Set(getSortedKeys().map(k => k.slice(0, 4)))];
}

// One row per concept and currency, with one value per stored month of the year.
function yearData(year) {
  const keys = getSortedKeys().filter(k => k.startsWith(year + '-'));
  const rows = new Map();
  const add = (group, name, currency, idx, amount, installments) => {
    const id = group + '|' + slug(name) + '|' + currency;
    if (!rows.has(id)) rows.set(id, { group, name, currency, vals: keys.map(() => 0), installments: false });
    const r = rows.get(id);
    r.vals[idx] += amount;
    if (installments) r.installments = true;
  };
  keys.forEach((k, idx) => {
    const m = allMonths[k];
    for (const it of m.items) add('casa', it.name, it.currency, idx, parseFloat(it.amount) || 0, !!it.installments);
    for (const p of pinaPairs(m)) {
      add('pina', p.ars.name, 'ARS', idx, parseFloat(p.ars.amount) || 0, !!p.ars.installments);
      add('pina', p.usd.name, 'USD', idx, parseFloat(p.usd.amount) || 0, !!p.usd.installments);
    }
  });
  const out = [];
  for (const r of rows.values()) {
    const total = r.vals.reduce((a, b) => a + b, 0);
    if (!(total > 0)) continue;
    const nz = r.vals.map((v, i) => [v, i]).filter(x => x[0] > 0);
    const first = nz[0][0], last = nz[nz.length - 1][0];
    r.total = total;
    r.avg = total / nz.length;
    r.pct = (!r.installments && nz.length >= 2 && first > 0) ? (last - first) / first * 100 : null;
    out.push(r);
  }
  out.sort((a, b) => b.total - a.total);
  const perMonth = keys.map(k => calcTotals(allMonths[k]).totalARS);
  return { keys, rows: out, perMonth };
}

function sparkline(vals) {
  const n = vals.length;
  if (n < 2) return '';
  const W = 96, H = 24, P = 3, max = Math.max(...vals, 1);
  const pts = vals.map((v, i) => [P + (W - 2 * P) * i / (n - 1), H - P - (H - 2 * P) * v / max]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const end = pts[n - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="2.5" fill="var(--accent)"/></svg>`;
}

function renderYearSummary() {
  const card = document.getElementById('yearCard');
  if (!card) return;
  const years = yearsAvailable();
  card.hidden = getSortedKeys().length < 2;
  if (card.hidden) return;
  if (!years.includes(yearSelected)) yearSelected = years.includes(currentKey.slice(0, 4)) ? currentKey.slice(0, 4) : years[years.length - 1];
  const sel = document.getElementById('yearSel');
  sel.innerHTML = years.map(y => `<option value="${y}"${y === yearSelected ? " selected" : ""}>${y}</option>`).join('');
  sel.style.display = years.length > 1 ? '' : 'none';

  const d = yearData(yearSelected);
  const casa = d.rows.filter(r => r.group === 'casa'), pina = d.rows.filter(r => r.group === 'pina');
  const totalARS = d.perMonth.reduce((a, b) => a + b, 0);
  const totalUSD = d.keys.reduce((a, k) => a + calcTotals(allMonths[k]).totalUSD, 0);
  let top = -1, topIdx = -1;
  d.perMonth.forEach((v, i) => { if (v > top) { top = v; topIdx = i; } });
  const countedMonths = d.perMonth.filter(v => v > 0).length || 1;
  const risers = casa.filter(r => r.pct !== null && r.currency === 'ARS' && r.pct > 0).sort((a, b) => b.pct - a.pct);
  const kpi = (label, value, sub) => `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;
  document.getElementById('yearKpis').innerHTML =
    kpi('Gastos de la casa', fmtARS(totalARS), totalUSD > 0.001 ? `y ${fmtUSD(totalUSD)}` : `${d.keys.length} ${d.keys.length === 1 ? "mes" : "meses"} cargados`) +
    kpi('Promedio por mes', fmtARS(totalARS / countedMonths), 'en pesos') +
    kpi('Mes más caro', topIdx >= 0 ? keyToLabel(d.keys[topIdx]).split(' ')[0] : '—', topIdx >= 0 ? fmtARS(top) : '') +
    kpi('Más aumentó', risers.length ? escHtml(risers[0].name) : '—', risers.length ? `▲ ${Math.round(risers[0].pct)}%` : 'sin aumentos');

  const label = (r) => escHtml(r.name) + (r.currency === 'USD' ? ' <span class="badge-usd">USD</span>' : '') + (r.installments ? ' <span class="installment-badge">cuotas</span>' : '');
  const pct = (r) => r.pct === null ? '<span class="zero-amt">—</span>' : (Math.abs(r.pct) < 1 ? '<span class="zero-amt">=</span>' : `<span class="delta ${r.pct > 0 ? "up" : "down"}">${r.pct > 0 ? "▲" : "▼"} ${Math.abs(Math.round(r.pct))}%</span>`);
  const row = (r) => `<tr><td>${label(r)}</td><td>${fmtAmount(r.total, r.currency)}</td><td>${fmtAmount(r.avg, r.currency)}</td><td class="spark-cell">${sparkline(r.vals)}</td><td>${pct(r)}</td></tr>`;
  const section = (title, list) => list.length ? `<tr class="group-row"><td colspan="5">${title}</td></tr>` + list.map(row).join('') : '';
  document.getElementById('yearTable').innerHTML =
    '<thead><tr><th>Concepto</th><th>Total</th><th>Prom. por mes</th><th>Evolución</th><th>Desde el 1.º al último</th></tr></thead><tbody>' +
    section('Casa', casa) + section('Propios de Pina', pina) + '</tbody>';
}

function onYearChange() {
  yearSelected = document.getElementById('yearSel').value;
  renderYearSummary();
}
