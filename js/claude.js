// Claude features (only where the page can ask Claude).

// ---------- Claude features (only where the page can ask Claude) ----------
async function initClaude() {
  if (!IS_FRAMED) return;
  try { claudeSample = await window.claude.use('sample'); } catch(e) { claudeSample = null; }
  const card = document.getElementById('claudeCard');
  if (card) card.hidden = !claudeSample;
}

function claudeErrorText(e) {
  const c = e && e.code;
  if (c === 'not_granted') return 'No diste permiso para usar Claude desde esta página.';
  if (c === 'rate_limited') return 'Llegaste al límite de uso por ahora. Probá de nuevo en un rato.';
  if (c === 'session_expired') return 'Tu sesión venció: volvé a abrir la página.';
  if (c === 'prompt_too_large') return 'El historial es demasiado largo para consultarlo de una vez.';
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
