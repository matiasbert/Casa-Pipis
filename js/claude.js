// Claude features (only where the page can ask Claude).

// ---------- Claude features (only where the page can ask Claude) ----------
async function initClaude() {
  if (!IS_FRAMED) return;
  try { claudeSample = await window.claude.use('sample'); } catch(e) { claudeSample = null; }
  const card = document.getElementById('claudeCard');
  if (card) card.hidden = !claudeSample;
  // The photo reader needs a view that can send images to Claude.
  let lim = null;
  try { lim = claudeSample ? await claudeSample.limits() : null; } catch(e) { lim = null; }
  const row = document.getElementById('photoRow');
  if (row) row.hidden = !(lim && lim.images);
  const inp = document.getElementById('photoInput');
  if (inp && lim && lim.images && lim.images.mediaTypes) inp.accept = lim.images.mediaTypes.join(',');
}

function claudeErrorText(e) {
  const c = e && e.code;
  if (c === 'not_granted') return 'No diste permiso para usar Claude desde esta página.';
  if (c === 'rate_limited') return 'Llegaste al límite de uso por ahora. Probá de nuevo en un rato.';
  if (c === 'session_expired') return 'Tu sesión venció: volvé a abrir la página.';
  if (c === 'prompt_too_large') return 'El historial es demasiado largo para consultarlo de una vez.';
  if (c === 'image_rejected' || c === 'images_unavailable') return 'No pude usar esa imagen. Probá con otra foto (JPG o PNG).';
  if (c === 'invalid_json') return 'No pude interpretar la imagen. Probá con una foto más clara y completa.';
  if (c === 'refused') return 'Claude no pudo procesar esa imagen.';
  return 'No se pudo completar la consulta. Probá de nuevo.';
}

function historyForClaude() {
  return getSortedKeys().map(k => {
    const m = allMonths[k];
    return {
      mes: k,
      reparto_global_mati_pina: `${m.matiSplit}/${m.pinaSplit}`,
      gastos: m.items.filter(i => parseFloat(i.amount) > 0).map(i => {
        const o = { concepto: i.name, moneda: i.currency, monto: parseFloat(i.amount) };
        if (i.splitOverride) o.reparto = `${i.splitOverride.mati}/${i.splitOverride.pina}`;
        if (i.installments) o.cuota = `${i.installments.current}/${i.installments.total}`;
        if (i.notes) o.nota = i.notes;
        return o;
      }),
      propios_de_pina: pinaPairs(m).map(p => ({ concepto: p.ars.name, ars: parseFloat(p.ars.amount) || 0, usd: parseFloat(p.usd.amount) || 0 })).filter(p => p.ars || p.usd),
    };
  });
}

async function draftMessage() {
  if (!claudeSample) return;
  const btn = document.getElementById('draftBtn'), out = document.getElementById('draftOut');
  const acts = document.getElementById('draftActions');
  btn.disabled = true;
  out.hidden = false; out.value = 'Pensando…';
  const prompt = 'Sos el asistente de gastos de una casa que comparten Mati y Pina. Redactá un mensaje de WhatsApp corto (hasta 8 renglones) '
    + 'en español rioplatense, cálido y directo, para que Mati le mande a Pina lo que le toca pagar este mes. '
    + 'Usá solamente los números del resumen, sin inventar nada. Sin markdown y con uno o dos emojis como máximo. Devolvé solo el mensaje.\n\nRESUMEN:\n'
    + buildTextSummary();
  try {
    await claudeSample(prompt, { onText: ({ text }) => { out.value = text; } });
    acts.hidden = false;
    document.getElementById('draftWa').href = 'https://wa.me/?text=' + encodeURIComponent(out.value);
    out.oninput = () => { document.getElementById('draftWa').href = 'https://wa.me/?text=' + encodeURIComponent(out.value); };
  } catch(e) { out.value = claudeErrorText(e); }
  btn.disabled = false;
}

function copyDraft() {
  const out = document.getElementById('draftOut');
  const done = () => showNotif('✓ Mensaje copiado');
  navigator.clipboard.writeText(out.value).then(done).catch(() => { out.select(); showNotif('Seleccioné el texto: copialo manualmente'); });
}

let askCtl = null;
function askPreset(btn) { document.getElementById('askInput').value = btn.textContent; askClaude(); }
function stopAsk() { if (askCtl) askCtl.abort(); }
async function askClaude() {
  if (!claudeSample) return;
  const q = document.getElementById('askInput').value.trim();
  const out = document.getElementById('askOut');
  if (!q) { out.textContent = ''; return; }
  const askBtn = document.getElementById('askBtn'), stopBtn = document.getElementById('askStop');
  askCtl = new AbortController();
  askBtn.disabled = true; stopBtn.hidden = false;
  out.textContent = 'Pensando…';
  const prompt = 'Respondé en español rioplatense, claro y breve (hasta 8 renglones), usando solo estos datos de gastos. '
    + 'Hay dos monedas, ARS y USD: no las sumes entre sí. "reparto" es Mati/Pina en porcentaje (por defecto el reparto global del mes). '
    + 'Los "propios_de_pina" son gastos de Pina que no se reparten. Si los datos no alcanzan para responder, decilo.\n\n'
    + 'DATOS (JSON):\n' + JSON.stringify(historyForClaude()) + '\n\nPREGUNTA: ' + q;
  try {
    await claudeSample(prompt, { signal: askCtl.signal, onText: ({ text }) => { out.textContent = text; } });
  } catch(e) {
    if (e && e.code === 'cancelled') { if (e.text) out.textContent = e.text; else out.textContent = ''; }
    else out.textContent = (e && e.text ? e.text + '\n\n' : '') + claudeErrorText(e);
  }
  askBtn.disabled = false; stopBtn.hidden = true; askCtl = null;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.id === 'askInput') { e.preventDefault(); askClaude(); }
});

// ---------- Photo of a card statement or a bill -> proposed amounts (nothing is saved until confirmed) ----------
let proposalRows = [];

function knownConcepts(month) {
  const list = [];
  for (const it of month.items) list.push({ value: 'm:' + it.id, label: it.name + (it.currency === 'USD' ? ' (USD)' : ''), name: it.name, kind: 'm', currency: it.currency });
  for (const p of pinaPairs(month)) list.push({ value: 'p:' + p.pairId, label: 'Pina · ' + p.ars.name, name: p.ars.name, kind: 'p' });
  return list;
}

async function readPhoto(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file || !claudeSample) return;
  const month = getMonth();
  const box = document.getElementById('proposal');
  if (!month || isReadonly()) { showNotif('Este mes está en solo lectura'); return; }
  box.hidden = false;
  box.innerHTML = '<div class="card-sub" style="margin:0">Leyendo la imagen…</div>';
  const names = [...new Set(knownConcepts(month).map(c => c.name))];
  const prompt = 'Sos un asistente que lee la foto de un resumen de tarjeta de crédito o de una factura de servicios de Argentina. '
    + 'Respondé solo con un JSON con esta forma exacta: {"tipo":"tarjeta"|"servicio"|"otro","emisor":"texto","propuestas":[{"destino":"concepto conocido o nuevo","concepto":"nombre corto","moneda":"ARS"|"USD","monto":123456.78,"nota":"texto corto o vacío"}]}. '
    + 'Conceptos conocidos de este mes: ' + JSON.stringify(names) + '. '
    + 'Reglas: si es un resumen de tarjeta (Visa o Mastercard) devolvé una propuesta con el total a pagar en pesos (ARS) y otra con el total en dólares (USD) si existe; el destino es Visa o Mastercard; '
    + 'en "nota" listá hasta 4 compras en cuotas con el formato COMERCIO 02/03, separadas por "; ". '
    + 'Si es la factura de un servicio devolvé el importe total a pagar y como destino el concepto conocido que corresponda (por ejemplo Edesur, Metrogas, Telecentro, Expensas, Alquiler) o "nuevo" si ninguno coincide. '
    + 'Los montos son números sin símbolos ni separadores de miles, con punto decimal. No inventes datos: si no podés leer un importe, no lo incluyas.';
  try {
    const data = await claudeSample.json(prompt, { images: file });
    showProposal(data);
  } catch(e) {
    box.innerHTML = `<div class="card-sub" style="margin:0">${escHtml(claudeErrorText(e))}</div>`;
  }
}

function matchConcept(destino, concept, currency, list) {
  const w = slug(destino || concept || '');
  if (!w) return 'new';
  const hit = list.find(c => slug(c.name) === w && (c.kind === 'p' || !c.currency || c.currency === currency))
           || list.find(c => slug(c.name).includes(w) || w.includes(slug(c.name)));
  return hit ? hit.value : 'new';
}

function showProposal(data) {
  const box = document.getElementById('proposal');
  const month = getMonth();
  const list = knownConcepts(month);
  const props = (data && Array.isArray(data.propuestas) ? data.propuestas : [])
    .map(p => ({ destino: String(p.destino || ''), concepto: String(p.concepto || p.destino || '').trim(), moneda: p.moneda === 'USD' ? 'USD' : 'ARS',
                 monto: typeof p.monto === 'number' ? p.monto : parseAmount(p.monto), nota: String(p.nota || '').trim() }))
    .filter(p => p.monto > 0);
  if (!props.length) { box.innerHTML = '<div class="card-sub" style="margin:0">No encontré importes en la imagen. Probá con una foto más clara.</div>'; return; }
  proposalRows = props.map(p => ({ ...p, sel: matchConcept(p.destino, p.concepto, p.moneda, list) }));
  const opts = (cur) => list.map(c => `<option value="${escAttr(c.value)}"${c.value === cur ? " selected" : ""}>${escHtml(c.label)}</option>`).join('')
    + `<option value="new"${cur === "new" ? " selected" : ""}>Agregar como gasto nuevo</option>`;
  const who = data && data.emisor ? ` · ${escHtml(String(data.emisor))}` : '';
  box.innerHTML = `<h4>Propuesta${who}</h4>` + proposalRows.map((p, i) => `
    <div class="prop-row">
      <input type="checkbox" id="propOn${i}" class="prop-chk" checked aria-label="Cargar">
      <select id="propDest${i}" class="prop-dest" aria-label="Destino">${opts(p.sel)}</select>
      <span class="prop-cur ${p.moneda === "USD" ? "badge-usd" : "badge-ars"}">${p.moneda}</span>
      <input type="text" inputmode="decimal" id="propAmt${i}" class="prop-amt" value="${amountForInput(p.monto)}" aria-label="Monto">
      <input type="text" id="propNote${i}" class="prop-note" value="${escAttr(p.nota)}" placeholder="Nota" aria-label="Nota">
    </div>`).join('') + `
    <div class="prop-actions">
      <button class="btn btn-primary" onclick="applyProposal()">Cargar en ${escHtml(keyToLabel(currentKey))}</button>
      <button class="btn" onclick="closeProposal()">Descartar</button>
    </div>`;
}

function closeProposal() { const b = document.getElementById('proposal'); b.hidden = true; b.innerHTML = ''; proposalRows = []; }

function applyProposal() {
  const month = getMonth();
  if (!month || isReadonly()) { showNotif('Este mes está en solo lectura'); return; }
  const before = JSON.parse(JSON.stringify({ items: month.items, pinaItems: month.pinaItems, removed: month.removed || null }));
  const key = currentKey, now = Date.now();
  let applied = 0; const skipped = [];
  proposalRows.forEach((p, i) => {
    if (!document.getElementById('propOn' + i)?.checked) return;
    const amount = parseAmount(document.getElementById('propAmt' + i)?.value);
    const note = (document.getElementById('propNote' + i)?.value || '').trim();
    const dest = document.getElementById('propDest' + i)?.value || 'new';
    if (!(amount > 0)) return;
    if (dest === 'new') {
      month.items.push({ id: uid(), name: p.concepto || 'Sin nombre', currency: p.moneda, amount, splitOverride: null, notes: note, installments: null, isRecurring: false, ts: now });
      applied++;
    } else if (dest.indexOf('m:') === 0) {
      const it = month.items.find(x => x.id === dest.slice(2));
      if (!it) return;
      if (it.currency !== p.moneda) { skipped.push(it.name); return; }
      it.amount = amount; if (note) it.notes = note; it.ts = now; applied++;
    } else if (dest.indexOf('p:') === 0) {
      const it = month.pinaItems.find(x => x.pairId === dest.slice(2) && x.currency === p.moneda);
      if (!it) return;
      it.amount = amount; if (note) it.notes = note; it.ts = now; applied++;
    }
  });
  if (!applied) { showNotif(skipped.length ? 'La moneda no coincide con ' + skipped.join(', ') : 'No había nada para cargar'); return; }
  commit(key);
  closeProposal();
  renderAll();
  showToast(`Cargué ${applied} ${applied === 1 ? 'valor' : 'valores'} en ${keyToLabel(key)}`, 'Deshacer', () => {
    const m = allMonths[key];
    if (!m) return;
    m.items = before.items; m.pinaItems = before.pinaItems;
    if (before.removed) m.removed = before.removed; else delete m.removed;
    for (const it of m.items.concat(m.pinaItems)) it.ts = Date.now();   // the restored values must beat any merge
    commit(key);
    if (currentKey === key) renderAll();
  });
}
