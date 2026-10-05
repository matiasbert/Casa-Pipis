// Mode GitHub Pages: history.json in the repo, optional token, automatic sync.
const assert = require('assert');
const L = require('./lib');
const { pass, section, goTo } = L;

module.exports = async function run(browser, base) {
  const errors = [];
  const gh = { content: JSON.stringify(L.histUpTo('2026-08')), sha: 'sha1', puts: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(L.fakeDate());
  await L.stubExternal(ctx);
  await L.mockGithub(ctx, gh);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  section('GitHub 1) Dispositivo vacío, sin token: trae el historial y completa septiembre y octubre');
  await page.goto(base + '/');
  await page.waitForFunction(() => document.getElementById('monthLabel').textContent === 'Octubre 2026', null, { timeout: 15000 });
  assert.deepStrictEqual(await page.evaluate(() => Object.keys(allMonths).sort()), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']); pass('meses 05 a 10');
  const oct = await page.evaluate(() => { const m = allMonths['2026-10']; return { alq: m.items.find(i => i.name === 'Alquiler').amount, col: m.items.find(i => i.name === 'Colchon') }; });
  assert.strictEqual(oct.alq, 655520); pass('Alquiler de octubre arrastrado');
  assert.deepStrictEqual(oct.col.installments, { current: 6, total: 12 }); pass('Colchon octubre = 6/12');
  assert.deepStrictEqual(await page.evaluate(() => allMonths['2026-09'].items.find(i => i.name === 'Colchon').installments), { current: 5, total: 12 }); pass('Colchon septiembre = 5/12');
  assert.strictEqual(await page.locator('#pinaExpenseTbody tr').count(), 2); pass('Gastos Pina: Visa y Mastercard');
  assert.strictEqual(await page.locator('#pinaExpenseTbody .btn-danger').count(), 0); pass('sin botón de eliminar en Visa/Mastercard');
  assert.strictEqual(await page.locator('#pinaExpenseTbody .btn:has-text("Editar")').count(), 2); pass('un solo Editar por fila');
  assert.strictEqual(gh.puts.length, 0); pass('sin token no sube nada');

  section('GitHub 2) Editar Visa: pesos y dólares en un formulario');
  await page.locator('#pinaExpenseTbody tr').first().locator('button:has-text("Editar")').click(); await L.sleep(160);
  assert.ok(await page.locator('#pAmountARS').isVisible() && await page.locator('#pAmountUSD').isVisible()); pass('formulario con pesos y dólares');
  assert.ok(await page.locator('#pName').evaluate(e => e.readOnly)); pass('nombre fijo de solo lectura');
  await page.fill('#pAmountARS', '15000'); await page.fill('#pAmountUSD', '25');
  await page.locator('#pInstARS').check(); await page.fill('#pInstCurARS', '2'); await page.fill('#pInstTotARS', '6');
  await page.press('#pAmountUSD', 'Enter');
  await page.waitForFunction(() => document.querySelector('#pinaExpenseTbody tr').innerText.includes('c.2/6'));
  const visa = await page.locator('#pinaExpenseTbody tr').first().innerText();
  assert.ok(visa.includes('15.000') && visa.includes('USD 25') && visa.includes('c.2/6'), 'fila Visa: ' + JSON.stringify(visa)); pass('Enter guarda: ' + visa.replace(/\s+/g, ' '));
  assert.ok((await page.locator('#pinaPersonalDetail').innerText()).includes('USD 25')); pass('total de Pina actualizado');

  section('GitHub 3) Agregar, cancelar, borrar y deshacer');
  await page.click('#addPinaRowBtnWrap button'); await L.sleep(250);
  await page.fill('#pName', 'Terapia'); await page.fill('#pAmountARS', '40000'); await page.fill('#pAmountUSD', '10');
  await page.click('#pinaExpenseTbody button:has-text("Guardar")');
  assert.strictEqual(await page.locator('#pinaExpenseTbody tr').count(), 3); pass('3 filas');
  assert.strictEqual(await page.locator('#pinaExpenseTbody .btn-danger').count(), 1); pass('solo el concepto nuevo se puede eliminar');
  await page.click('#addPinaRowBtnWrap button'); await L.sleep(300); await page.keyboard.press('Escape');
  assert.strictEqual(await page.locator('#pinaExpenseTbody tr').count(), 3); pass('Esc cancela y no deja fila vacía');
  await page.locator('#pinaExpenseTbody .btn-danger').click();
  assert.strictEqual(await page.locator('#pinaExpenseTbody tr').count(), 2);
  await page.click('#toastBtn');
  assert.strictEqual(await page.locator('#pinaExpenseTbody tr').count(), 3); pass('eliminar + Deshacer restaura');

  section('GitHub 4) Mes anterior en solo lectura hasta habilitar edición');
  await goTo(page, 'Agosto 2026');
  assert.ok(await page.locator('#unlockBtn').isVisible()); pass('botón "Editar este mes"');
  assert.strictEqual(await page.locator('#expenseTbody .btn:has-text("Editar")').count(), 0); pass('sin edición hasta habilitar');
  await page.click('#unlockBtn');
  assert.ok(await page.locator('#expenseTbody .btn:has-text("Editar")').count() > 0); pass('edición habilitada');
  await goTo(page, 'Junio 2026');
  const june = await page.locator('#pinaExpenseTbody tr').allInnerTexts();
  assert.strictEqual(june.length, 4);
  assert.ok(june.some(t => t.includes('Thelonious') && t.includes('c.2/2')) && june.some(t => t.includes('Biorender') && t.includes('USD 20'))); pass('Junio: datos viejos convertidos a pares');
  await goTo(page, 'Octubre 2026');

  section('GitHub 5) Con token: sube solo y reintenta ante conflicto');
  await page.evaluate(() => { location.hash = '#t=github_pat_TESTTOKEN'; });
  await page.waitForFunction(() => localStorage.getItem('casapi_github_token') === 'github_pat_TESTTOKEN'); pass('token tomado del link');
  assert.strictEqual(await page.evaluate(() => location.hash), ''); pass('el link se borra de la barra');
  await page.waitForFunction(() => document.getElementById('syncChip').textContent.includes('✓'), null, { timeout: 15000 });
  assert.ok(gh.puts.length >= 1); pass(`subió solo (${gh.puts.length} PUT)`);
  const last = gh.puts[gh.puts.length - 1];
  assert.ok(last.months['2026-09'] && last.months['2026-10']); pass('GitHub tiene septiembre y octubre');
  assert.ok(last.months['2026-10'].pinaItems.find(i => i.name === 'Terapia')); pass('incluye el gasto nuevo de Pina');
  gh.failNextPut = 1; const before = gh.puts.length;
  await page.locator('#expenseTbody tr').first().locator('button:has-text("Editar")').click(); await L.sleep(160);
  await page.fill('#eAmount', '700000'); await page.press('#eAmount', 'Enter');
  await L.sleep(5000);
  assert.ok(gh.puts.length > before); pass('tras un 409 reintenta y guarda');
  assert.strictEqual(gh.puts[gh.puts.length - 1].months['2026-10'].items.find(i => i.name === 'Alquiler').amount, 700000); pass('Alquiler 700.000 llegó a GitHub');

  section('GitHub 6) Otro dispositivo (vacío) recibe todo con el link de acceso');
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
  await ctx2.addInitScript(L.fakeDate()); await L.stubExternal(ctx2); await L.mockGithub(ctx2, gh);
  const m = await ctx2.newPage(); m.on('pageerror', e => errors.push('movil pageerror: ' + e.message));
  await m.goto(base + '/#t=github_pat_TESTTOKEN');
  await m.waitForFunction(() => document.getElementById('monthLabel').textContent === 'Octubre 2026');
  await L.sleep(1500);
  assert.strictEqual(await m.evaluate(() => allMonths['2026-10'].items.find(i => i.name === 'Alquiler').amount), 700000); pass('el celular ve Alquiler 700.000');
  assert.ok(await m.evaluate(() => !!allMonths['2026-10'].pinaItems.find(i => i.name === 'Terapia'))); pass('y el gasto nuevo de Pina');
  await ctx2.close();

  section('GitHub 7) Mes de v1.5 sin alquiler ni cuotas se repara');
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx3.addInitScript(L.fakeDate()); await L.stubExternal(ctx3);
  await L.mockGithub(ctx3, { content: JSON.stringify(L.histUpTo('2026-08')), sha: 'shaR' });
  const legacyOct = { key: '2026-10', matiSplit: 75, pinaSplit: 25, locked: false, pinaItems: [],
    items: ['Alquiler', 'Expensas', 'Telecentro', 'Edesur', 'Metrogas'].map((n, i) => ({ id: 'l' + i, name: n, currency: 'ARS', amount: 0, splitOverride: null, notes: '', installments: null, isRecurring: true })) };
  const local = { ...L.histUpTo('2026-08').months, '2026-10': legacyOct };
  await ctx3.addInitScript((d) => { if (!localStorage.getItem('casapi_months')) localStorage.setItem('casapi_months', JSON.stringify(d)); }, local);
  const p3 = await ctx3.newPage(); p3.on('pageerror', e => errors.push('p3 pageerror: ' + e.message));
  await p3.goto(base + '/');
  await p3.waitForFunction(() => document.getElementById('monthLabel').textContent === 'Octubre 2026');
  await L.sleep(500);
  const fixed = await p3.evaluate(() => ({ alq: allMonths['2026-10'].items.find(i => i.name === 'Alquiler').amount, col: (allMonths['2026-10'].items.find(i => i.name === 'Colchon') || {}).installments, sep: !!allMonths['2026-09'] }));
  assert.strictEqual(fixed.alq, 655520); assert.deepStrictEqual(fixed.col, { current: 6, total: 12 }); assert.ok(fixed.sep); pass('octubre reparado y septiembre creado');
  await ctx3.close(); await ctx.close();
  return errors;
};
