// Mode claude.ai: private database, downloads, Claude, read-only guest. Runs the single-file build.
const assert = require('assert');
const L = require('./lib');
const { pass, section } = L;

async function newPage(browser, base, { seed, readOnly, viewport, extra } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  await ctx.addInitScript(`window.__SEED = ${JSON.stringify(seed || null)}; window.__readOnly = ${!!readOnly};${extra || ''}`);
  await ctx.addInitScript(L.fakeDate());
  await ctx.addInitScript(L.claudeMock);
  const libs = await L.stubExternal(ctx);
  let api = 0; await ctx.route('https://api.github.com/**', r => { api++; r.abort(); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base + '/__artifact.html');
  return { ctx, page, errors, api: () => api, libs };
}
const waitMonth = (page, label = 'Octubre 2026') => page.waitForFunction((l) => document.getElementById('monthLabel').textContent === l, label, { timeout: 15000 });

module.exports = async function run(browser, base) {
  const all = [];
  const HIST = L.FIXTURE.months;

  section('claude.ai A) Dueño: abre con el historial ya en la base');
  let { ctx, page, errors, api, libs } = await newPage(browser, base, { seed: HIST });
  await waitMonth(page);
  assert.ok(await page.evaluate(() => document.body.classList.contains('mode-artifact'))); pass('modo claude.ai');
  assert.ok(!(await page.locator('#ghTokenInput').isVisible())); pass('sin nada de token');
  assert.strictEqual(api(), 0); pass('no llama a GitHub');
  assert.deepStrictEqual(await page.evaluate(() => Object.keys(allMonths).sort()), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']); pass('6 meses cargados');
  assert.strictEqual(await page.evaluate(() => window.__writes.length), 0); pass('abrir no escribe nada');

  section('claude.ai B) Editar guarda en la base; variación contra el mes anterior');
  await page.locator('#expenseTbody tr').nth(1).locator('button:has-text("Editar")').click();
  await page.fill('#eAmount', '110000'); await page.press('#eAmount', 'Enter');
  await page.waitForFunction(() => window.__store['2026-10'].items.find(i => i.name === 'Expensas').amount === 110000, null, { timeout: 8000 });
  pass('Expensas $110.000 en la base');
  assert.ok((await page.evaluate(() => window.__store['2026-10'].updatedAt)) > 0); pass('con marca de edición');
  await page.click('#prevMonthBtn'); await page.click('#unlockBtn');
  await page.locator('#expenseTbody tr').nth(1).locator('button:has-text("Editar")').click();
  await page.fill('#eAmount', '88000'); await page.press('#eAmount', 'Enter');
  await page.waitForFunction(() => window.__store['2026-09'].items.find(i => i.name === 'Expensas').amount === 88000);
  await page.click('#nextMonthBtn');
  const delta = await page.locator('#expenseTbody tr').nth(1).locator('.delta').innerText();
  assert.ok(delta.includes('▲') && delta.includes('25%')); pass('variación: ' + delta);

  section('claude.ai C) Pina con ambas monedas; borrar mes con diálogo propio');
  await page.click('#addPinaRowBtnWrap button'); await page.fill('#pName', 'Terapia'); await page.fill('#pAmountARS', '40000'); await page.fill('#pAmountUSD', '10');
  await page.click('#pinaExpenseTbody button:has-text("Guardar")');
  await page.waitForFunction(() => window.__store['2026-10'].pinaItems.some(i => i.name === 'Terapia' && i.currency === 'USD' && i.amount === 10));
  pass('gasto de Pina guardado');
  await page.click('button:has-text("Historial")');
  await page.locator('#monthList li', { hasText: 'Junio 2026' }).locator('button:has-text("Borrar")').click();
  assert.ok(await page.locator('#confirmOverlay.open').isVisible()); pass('confirmación propia (no confirm())');
  await page.click('#confirmOk');
  await page.waitForFunction(() => !('2026-06' in window.__store) || window.__store['2026-06'].deleted); pass('mes borrado en la base');
  await page.evaluate(() => closeModal());

  section('claude.ai D) Cambio remoto en vivo');
  const oct = await page.evaluate(() => JSON.parse(JSON.stringify(window.__store['2026-10'])));
  oct.items.find(i => i.name === 'Alquiler').amount = 777000; oct.updatedAt = (await page.evaluate(() => Date.now())) + 5000;
  await page.evaluate((o) => window.__remoteSet('2026-10', o), oct);
  await page.waitForFunction(() => allMonths['2026-10'].items.find(i => i.name === 'Alquiler').amount === 777000, null, { timeout: 8000 });
  pass('el cambio remoto aparece sin recargar');

  section('claude.ai E) Exportes por el permiso de descarga');
  await page.click('button:has-text("Descargar historial para el repo")');
  await page.waitForFunction(() => window.__saved.some(s => s.filename.endsWith('.json'))); pass('JSON');
  await page.click('button:has-text("Exportar a Excel")');
  await page.waitForFunction(() => window.__saved.some(s => s.filename.endsWith('.csv'))); pass('CSV');
  if (libs.hasPdfLibs) {
    await page.click('button:has-text("Guardar imagen")');
    await page.waitForFunction(() => window.__saved.some(s => s.filename.endsWith('.jpg')), null, { timeout: 30000 }); pass('JPG real');
    await page.click('button:has-text("Descargar PDF")');
    await page.waitForFunction(() => window.__saved.some(s => s.filename.endsWith('.pdf')), null, { timeout: 30000 }); pass('PDF real');
  } else console.log('  - JPG/PDF omitidos (faltan html2canvas/jspdf: corré npm install en tests/)');
  assert.ok((await page.locator('#waLink').getAttribute('href')).startsWith('https://wa.me/?text=')); pass('WhatsApp como link');

  section('claude.ai F) Claude, gráfico y tema oscuro');
  assert.ok(await page.locator('#claudeCard').isVisible()); pass('tarjeta de Claude visible');
  await page.click('#draftBtn'); await page.waitForFunction(() => document.getElementById('draftOut').value === 'RESPUESTA-MOCK');
  assert.ok((await page.evaluate(() => window.__asked[0].input)).includes('GASTOS')); pass('el mensaje para Pina lleva el resumen del mes');
  await page.fill('#askInput', '¿Cuánto subió el alquiler?'); await page.click('#askBtn');
  await page.waitForFunction(() => document.getElementById('askOut').textContent === 'RESPUESTA-MOCK');
  const asked = await page.evaluate(() => window.__asked[1].input);
  assert.ok(asked.includes('"mes":"2026-10"') && asked.includes('PREGUNTA: ¿Cuánto subió el alquiler?')); pass('la pregunta viaja con el historial');
  assert.ok((await page.locator('#trendSvg rect').count()) >= 8); pass('gráfico dibujado');
  assert.strictEqual(await page.locator('#trendTable tbody tr').count(), 5); pass('tabla del gráfico (5 meses)');
  await page.locator('#trendSvg rect[data-i="3"]').hover(); assert.ok(await page.locator('#trendTip.show').isVisible()); pass('tooltip');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  assert.ok(await page.evaluate(() => document.body.classList.contains('dark'))); pass('sigue el tema oscuro de la plataforma');
  all.push(...errors); await ctx.close();

  section('claude.ai G) Invitada de solo lectura');
  ({ ctx, page, errors } = await newPage(browser, base, { seed: HIST, readOnly: true }));
  await waitMonth(page);
  assert.ok(await page.evaluate(() => document.body.classList.contains('mode-viewer'))); pass('modo lectura');
  assert.strictEqual(await page.locator('#expenseTbody .btn:has-text("Editar")').count(), 0); pass('sin Editar');
  assert.ok(!(await page.locator('#addRowBtnWrap').isVisible())); pass('sin "Agregar gasto"');
  assert.ok(!(await page.locator('button:has-text("Nuevo mes")').isVisible())); pass('sin "Nuevo mes"');
  await L.sleep(1500);
  assert.strictEqual(await page.evaluate(() => window.__writes.length), 0); pass('no intentó escribir');
  all.push(...errors); await ctx.close();

  section('claude.ai H) Base vacía: crea y guarda el mes actual');
  ({ ctx, page, errors } = await newPage(browser, base, { seed: {} }));
  await waitMonth(page);
  await page.waitForFunction(() => '2026-10' in window.__store, null, { timeout: 8000 }); pass('mes actual creado y guardado');
  all.push(...errors); await ctx.close();

  section('claude.ai I) Celular');
  ({ ctx, page, errors } = await newPage(browser, base, { seed: HIST, viewport: { width: 390, height: 844 } }));
  await waitMonth(page);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0); pass('sin scroll horizontal');
  all.push(...errors); await ctx.close();
  return all;
};
