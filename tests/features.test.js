// Fixes and features of v1.8: slow devices, typed amounts, two devices at once, deleted months, fixed concepts,
// local backups, yearly summary and reading a photo with Claude.
const assert = require('assert');
const L = require('./lib');
const { pass, section, goTo } = L;
const waitMonth = (page, label = 'Octubre 2026') => page.waitForFunction((l) => document.getElementById('monthLabel').textContent === l, label, { timeout: 25000 });

async function githubDevice(browser, base, gh, { token = true, viewport } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(L.fakeDate());
  if (token) await ctx.addInitScript(() => { try { if (!localStorage.getItem('casapi_github_token')) localStorage.setItem('casapi_github_token', 'tok'); } catch (e) {} });
  await L.stubExternal(ctx); await L.mockGithub(ctx, gh);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(base + '/');
  return { ctx, page, errors };
}
const editAmount = async (page, rowIdx, value) => {
  await page.locator('#expenseTbody tr').nth(rowIdx).locator('button:has-text("Editar")').click(); await L.sleep(160);
  await page.fill('#eAmount', value); await page.press('#eAmount', 'Enter');
};
const amountOf = (page, month, name) => page.evaluate(([k, n]) => (allMonths[k].items.find(i => i.name === n) || {}).amount, [month, name]);

module.exports = async function run(browser, base) {
  const all = [];

  section('Fallas 1) Dispositivo lento: el historial llega tarde y no se pisa con un mes vacío');
  {
    const gh = { content: JSON.stringify(L.FIXTURE), sha: 'sha1', puts: [], getDelayFirst: 10500 };
    const hist = JSON.parse(gh.content);
    hist.months['2026-10'].items.find(i => i.name === 'Expensas').amount = 123456; hist.months['2026-10'].updatedAt = new Date('2026-10-05T10:00:00').getTime();
    gh.content = JSON.stringify(hist);
    const { ctx, page, errors } = await githubDevice(browser, base, gh);
    await waitMonth(page);
    assert.strictEqual(await amountOf(page, '2026-10', 'Expensas'), 0); pass('a los 8 s el celular todavía no tiene el historial y muestra un mes automático');
    await page.waitForFunction(() => allMonths['2026-10'].items.find(i => i.name === 'Expensas').amount === 123456, null, { timeout: 25000 });
    pass('cuando llega el historial, gana el dato real ($123.456)');
    await L.sleep(4000);
    assert.ok(gh.puts.every(p => p.months['2026-10'].items.find(i => i.name === 'Expensas').amount === 123456)); pass('nunca subió un octubre vacío a GitHub');
    all.push(...errors); await ctx.close();
  }

  section('Fallas 1b) claude.ai: lectura en caché incompleta no escribe ni crea meses');
  {
    const { ctx, page, errors } = await L.openArtifact(browser, base, { seed: L.FIXTURE.months, extra: 'window.__cacheEmpty = true; window.__firstFromCache = 2500;' });
    await L.sleep(1200);
    assert.strictEqual(await page.evaluate(() => window.__writes.length), 0); pass('mientras solo hay datos en caché no escribe nada');
    await waitMonth(page);
    await L.sleep(3500);
    assert.strictEqual(await page.evaluate(() => window.__writes.length), 0); pass('al confirmar el servidor tampoco escribe (todo estaba al día)');
    assert.strictEqual(await page.evaluate(() => Object.keys(allMonths).length), 6); pass('quedan los 6 meses');
    all.push(...errors); await ctx.close();
  }

  section('Fallas 2) Montos con formato argentino al escribirlos');
  {
    const { ctx, page, errors } = await L.openArtifact(browser, base, { seed: L.FIXTURE.months });
    await waitMonth(page);
    await page.locator('#expenseTbody tr').first().locator('button:has-text("Editar")').click(); await L.sleep(160);
    await page.fill('#eAmount', '655.520');
    assert.strictEqual((await page.locator('#eAmountHint').innerText()).trim(), '= $655.520'); pass('vista previa: "655.520" → = $655.520');
    await page.press('#eAmount', 'Enter');
    assert.strictEqual(await amountOf(page, '2026-10', 'Alquiler'), 655520); pass('se guarda 655520 (antes quedaba 655,52)');
    await page.click('#addPinaRowBtnWrap button'); await L.sleep(250);
    await page.fill('#pName', 'Curso'); await page.fill('#pAmountUSD', '19,99'); await page.fill('#pAmountARS', '1.234,50');
    assert.strictEqual((await page.locator('#pAmountUSDHint').innerText()).trim(), '= USD 19,99'); pass('vista previa en dólares con centavos');
    await page.click('#pinaExpenseTbody button:has-text("Guardar")');
    const row = await page.locator('#pinaExpenseTbody tr', { hasText: 'Curso' }).innerText();
    assert.ok(row.includes('USD 19,99'), row); pass('la fila muestra USD 19,99 (no USD 20)');
    assert.strictEqual(await page.evaluate(() => allMonths['2026-10'].pinaItems.find(i => i.name === 'Curso' && i.currency === 'ARS').amount), 1234.5); pass('1.234,50 → 1234,5');
    all.push(...errors); await ctx.close();
  }

  section('Fallas 3) Dos dispositivos editan a la vez (GitHub): se conservan los dos cambios');
  {
    const gh = { content: JSON.stringify(L.FIXTURE), sha: 'sha1', puts: [] };
    const A = await githubDevice(browser, base, gh), B = await githubDevice(browser, base, gh);
    await waitMonth(A.page); await waitMonth(B.page); await L.sleep(1500);
    await editAmount(A.page, 3, '11111');                       // Edesur en A
    await A.page.waitForFunction(() => document.getElementById('syncChip').textContent.includes('✓'), null, { timeout: 15000 });
    await L.sleep(500);
    await editAmount(B.page, 4, '22222');                       // Metrogas en B, que todavía no vio lo de A
    await B.page.waitForFunction(() => document.getElementById('syncChip').textContent.includes('✓'), null, { timeout: 15000 });
    await L.sleep(800);
    const final = gh.puts[gh.puts.length - 1].months['2026-10'];
    assert.strictEqual(final.items.find(i => i.name === 'Edesur').amount, 11111);
    assert.strictEqual(final.items.find(i => i.name === 'Metrogas').amount, 22222); pass('GitHub quedó con Edesur $11.111 y Metrogas $22.222');
    assert.strictEqual(await amountOf(B.page, '2026-10', 'Edesur'), 11111); pass('B también ve lo que cargó A');
    all.push(...A.errors, ...B.errors); await A.ctx.close(); await B.ctx.close();
  }

  section('Fallas 4) claude.ai: un mes borrado no vuelve');
  {
    const { ctx, page, errors } = await L.openArtifact(browser, base, { seed: L.FIXTURE.months });
    await waitMonth(page);
    await page.click('button:has-text("Historial")');
    await page.locator('#monthList li', { hasText: 'Mayo 2026' }).locator('button:has-text("Borrar")').click();
    await page.click('#confirmOk');
    await page.waitForFunction(() => window.__store['2026-05'] && window.__store['2026-05'].deleted > 0, null, { timeout: 8000 });
    pass('el borrado queda como marca en la base (no se elimina el documento)');
    await page.evaluate(() => closeModal());
    all.push(...errors); await ctx.close();

  }

  section('Fallas 4b) Un dispositivo desactualizado que todavía tiene el mes borrado no lo sube de nuevo');
  {
    const tomb = { key: '2026-05', deleted: new Date('2026-10-04T12:00:00').getTime(), items: [], pinaItems: [], updatedAt: new Date('2026-10-04T12:00:00').getTime() };
    const seed = { ...L.FIXTURE.months, '2026-05': tomb };
    const stale = JSON.stringify(L.FIXTURE.months);   // this device still holds May in its own storage
    const { ctx, page, errors } = await L.openArtifact(browser, base, { seed, extra: `try { localStorage.setItem('casapi_months', ${JSON.stringify(stale)}); } catch (e) {}` });
    await waitMonth(page); await L.sleep(3500);
    assert.ok(!(await page.evaluate(() => '2026-05' in allMonths))); pass('el dispositivo desactualizado elimina mayo al ver la marca');
    assert.ok(!(await page.evaluate(() => window.__writes.some(w => w[1] === '2026-05')))); pass('y no escribe nada sobre mayo');
    assert.ok(await page.evaluate(() => window.__store['2026-05'].deleted > 0)); pass('la marca de borrado sigue en la base');
    all.push(...errors); await ctx.close();
  }

  section('Menores) Conceptos fijos, Escape, imagen con Pina en pares');
  {
    const { ctx, page, errors } = await L.openArtifact(browser, base, { seed: L.FIXTURE.months });
    await waitMonth(page);
    const alq = page.locator('#expenseTbody tr', { hasText: 'Alquiler' });
    assert.strictEqual(await alq.locator('.btn-danger').count(), 0); pass('Alquiler no tiene botón de eliminar');
    assert.ok((await alq.innerText()).includes('fijo')); pass('se marca como fijo');
    assert.strictEqual(await page.locator('#expenseTbody tr', { hasText: 'Colchon' }).locator('.btn-danger').count(), 1); pass('Colchon sí se puede eliminar');
    await alq.locator('button:has-text("Editar")').click(); await L.sleep(160);
    assert.ok(await page.locator('#eName').evaluate(e => e.readOnly)); pass('el nombre del concepto fijo no se edita');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('.edit-row').count(), 0); pass('Esc cancela la edición en Gastos');
    await page.click('#addRowBtnWrap button'); await L.sleep(250); await page.keyboard.press('Escape');
    assert.strictEqual(await page.locator('#expenseTbody tr').count(), 6); pass('Esc en un gasto nuevo no deja filas vacías');
    await goTo(page, 'Agosto 2026');
    const snap = await page.evaluate(() => { buildImageSnapshot(); return document.getElementById('imageSnapshot').innerText; });
    assert.ok(/pesos/i.test(snap) && /d[oó]lares/i.test(snap)); pass('la imagen y el PDF tienen columnas Pesos y Dólares');
    assert.ok(/visa[\s\S]*\$46\.000/i.test(snap) && /mastercard[\s\S]*USD 20/i.test(snap)); pass('Visa $46.000 y Mastercard USD 20 en una sola fila cada uno');
    all.push(...errors); await ctx.close();
  }

  section('Menores) Copias de seguridad en el dispositivo');
  {
    const { ctx, page, errors } = await L.openArtifact(browser, base, { seed: L.FIXTURE.months });
    await waitMonth(page);
    await page.evaluate(() => { for (let i = 0; i < 9; i++) { allMonths['2026-10'].items[0].amount = 1000 + i; backupLocal(true); } });
    assert.strictEqual(await page.evaluate(() => listBackups().length), 6); pass('guarda las últimas 6 copias (no solo una)');
    await editAmount(page, 0, '222'); await L.sleep(200);
    await page.click('summary:has-text("Copias de seguridad")');
    assert.ok((await page.locator('#backupList li').count()) === 6); pass('se listan en Datos');
    await page.locator('#backupList li').first().locator('button:has-text("Restaurar")').click();
    await page.click('#confirmOk');
    await page.waitForFunction(() => allMonths['2026-10'].items[0].amount === 1008, null, { timeout: 5000 });
    pass('restaurar devuelve el valor de la copia (1008) y antes guarda lo actual');
    assert.ok((await page.evaluate(() => listBackups().some(b => JSON.parse(b.data)['2026-10'].items[0].amount === 222)))); pass('el valor que había antes (222) quedó en otra copia');
    all.push(...errors); await ctx.close();
  }

  section('Idea 5) Resumen del año');
  {
    const { ctx, page, errors } = await L.openArtifact(browser, base, { seed: L.FIXTURE.months });
    await waitMonth(page);
    assert.ok(await page.locator('#yearCard').isVisible()); pass('tarjeta visible');
    const casa = Object.values(L.FIXTURE.months).reduce((a, m) => a + m.items.filter(i => i.currency === 'ARS').reduce((x, i) => x + (parseFloat(i.amount) || 0), 0), 0);
    const kpis = await page.locator('#yearKpis').innerText();
    const fmt = (n) => '$' + Math.round(n).toLocaleString('es-AR');
    assert.ok(kpis.includes(fmt(casa)), `esperaba ${fmt(casa)} en: ${kpis}`); pass('total del año = ' + fmt(casa));
    assert.ok(/Mes más caro/i.test(kpis) && /Más aumentó/i.test(kpis)); pass('mes más caro y mayor aumento');
    const rows = await page.locator('#yearTable tbody tr').count();
    assert.ok(rows >= 8); pass(rows + ' filas por concepto');
    assert.ok((await page.locator('#yearTable svg.spark').count()) >= 5); pass('con gráfico de evolución por concepto');
    const alqRow = await page.locator('#yearTable tr', { hasText: 'Alquiler' }).innerText();
    assert.ok(alqRow.includes('▲')); pass('Alquiler muestra la suba: ' + alqRow.replace(/\s+/g, ' ').slice(0, 70));
    all.push(...errors); await ctx.close();
  }

  section('Idea 2) Leer una foto con Claude y proponer los montos');
  {
    const reply = { tipo: 'tarjeta', emisor: 'Visa', propuestas: [
      { destino: 'Visa', concepto: 'Visa', moneda: 'ARS', monto: 123456.5, nota: 'NORDICOSPORT 02/02' },
      { destino: 'Visa', concepto: 'Visa', moneda: 'USD', monto: 20, nota: '' },
      { destino: 'Edesur', concepto: 'Edesur', moneda: 'ARS', monto: 38000, nota: '' }] };
    const { ctx, page, errors } = await L.openArtifact(browser, base, { seed: L.FIXTURE.months, extra: `window.__sampleJson = ${JSON.stringify(reply)};` });
    await waitMonth(page);
    await page.waitForFunction(() => !document.getElementById('photoRow').hidden); pass('el botón de foto aparece (la vista puede enviar imágenes)');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.setInputFiles('#photoInput', { name: 'resumen.png', mimeType: 'image/png', buffer: png });
    await page.waitForSelector('#proposal .prop-row', { timeout: 8000 });
    assert.strictEqual(await page.locator('#proposal .prop-row').count(), 3); pass('3 propuestas');
    const asked = await page.evaluate(() => window.__asked.find(a => a.json));
    assert.ok(asked.opts.includes('images') && asked.input.includes('"Edesur"')); pass('la imagen viaja con la lista de conceptos conocidos');
    assert.strictEqual(await page.locator('#propDest0').inputValue().then(v => v.startsWith('p:')), true); pass('Visa propuesta en Gastos Pina');
    assert.ok((await page.locator('#propDest2').inputValue()).startsWith('m:')); pass('Edesur propuesto en Gastos');
    const before = await amountOf(page, '2026-10', 'Edesur');
    assert.strictEqual(before, 0);
    await page.fill('#propAmt2', '38.500');
    await page.click('button:has-text("Cargar en Octubre 2026")');
    assert.strictEqual(await amountOf(page, '2026-10', 'Edesur'), 38500); pass('Edesur $38.500 cargado (editado en la propuesta)');
    const visa = await page.evaluate(() => allMonths['2026-10'].pinaItems.filter(i => i.name === 'Visa').map(i => [i.currency, i.amount, i.notes]));
    assert.deepStrictEqual(visa, [['ARS', 123456.5, 'NORDICOSPORT 02/02'], ['USD', 20, '']]); pass('Visa en pesos y dólares, con la nota de cuotas');
    await page.click('#toastBtn');
    assert.strictEqual(await amountOf(page, '2026-10', 'Edesur'), 0); pass('Deshacer vuelve todo a como estaba');
    assert.strictEqual(await page.evaluate(() => allMonths['2026-10'].pinaItems.find(i => i.name === 'Visa' && i.currency === 'USD').amount), 0);
    all.push(...errors); await ctx.close();
    const noImg = await L.openArtifact(browser, base, { seed: L.FIXTURE.months, extra: 'window.__noImages = true;' });
    await waitMonth(noImg.page); await L.sleep(500);
    assert.ok(await noImg.page.locator('#photoRow').evaluate(e => e.hidden)); pass('sin soporte de imágenes, el botón no aparece');
    all.push(...noImg.errors); await noImg.ctx.close();
  }

  section('Idea 2b) Adjuntar un PDF (con o sin clave)');
  {
    const pdfLib = (() => { try { return require('jspdf').jsPDF; } catch (e) { return null; } })();
    const reply = { tipo: 'tarjeta', emisor: 'Mastercard', propuestas: [{ destino: 'Mastercard', concepto: 'Mastercard', moneda: 'ARS', monto: 98765.4, nota: '' }] };
    const probe = await L.openArtifact(browser, base, { seed: L.FIXTURE.months });
    const hasPdfJs = (await L.stubExternal(probe.ctx)).hasPdfJs; await probe.ctx.close();
    if (!pdfLib || !hasPdfJs) console.log('  - PDF omitido (faltan jspdf o pdfjs-dist: corré npm install en tests/)');
    else {
      const mkPdf = (pages, opts) => { const d = new pdfLib(opts); for (let i = 0; i < pages; i++) { if (i) d.addPage(); d.text('Resumen de cuenta pagina ' + (i + 1) + ' Total a pagar $ 98.765,40', 20, 30); } return Buffer.from(d.output('arraybuffer')); };
      const { ctx, page, errors } = await L.openArtifact(browser, base, { seed: L.FIXTURE.months, extra: `window.__sampleJson = ${JSON.stringify(reply)};` });
      await waitMonth(page); await page.waitForFunction(() => !document.getElementById('photoRow').hidden);
      assert.ok((await page.locator('#photoInput').getAttribute('accept') || '').includes('pdf')); pass('el selector acepta PDF');
      await page.setInputFiles('#photoInput', { name: 'resumen.pdf', mimeType: 'application/pdf', buffer: mkPdf(6) });
      await page.waitForSelector('#proposal .prop-row', { timeout: 30000 });
      let asked = await page.evaluate(() => window.__asked.filter(a => a.json).pop());
      assert.ok(asked.images.length === 4 && asked.images.every(x => x.startsWith('image/jpeg:'))); pass('un PDF de 6 páginas viaja a Claude como 4 imágenes JPEG');
      assert.ok((await page.locator('#propDest0').inputValue()).startsWith('p:')); pass('Mastercard propuesta en Gastos Pina');
      await page.click('button:has-text("Descartar")');

      await page.setInputFiles('#photoInput', { name: 'resumen-clave.pdf', mimeType: 'application/pdf', buffer: mkPdf(2, { encryption: { userPassword: '12345678', ownerPassword: 'dueno', userPermissions: ['print'] } }) });
      await page.waitForSelector('#pdfPass', { timeout: 30000 }); pass('un PDF con clave pide la clave');
      await page.fill('#pdfPass', '0000'); await page.press('#pdfPass', 'Enter');
      await page.waitForFunction(() => /no es correcta/.test(document.getElementById('proposal').textContent), null, { timeout: 30000 }); pass('con clave incorrecta lo avisa y vuelve a pedirla');
      await page.fill('#pdfPass', '12345678'); await page.press('#pdfPass', 'Enter');
      await page.waitForSelector('#proposal .prop-row', { timeout: 30000 });
      asked = await page.evaluate(() => window.__asked.filter(a => a.json).pop());
      assert.strictEqual(asked.images.length, 2); pass('con la clave correcta se leen las 2 páginas');
      assert.ok(!(await page.evaluate(() => JSON.stringify(window.__asked).includes('12345678')))); pass('la clave no viaja a Claude');
      all.push(...errors); await ctx.close();
    }
  }

  section('Idea 2c) Revisar el resumen línea por línea');
  {
    const L1 = (f, c, m, mo, q, tipo) => ({ fecha: f, comercio: c, moneda: mo, monto: m, cuota: q, tipo });
    const statement = (totARS) => ({ tipo: 'tarjeta', emisor: 'Visa', totales: { ARS: totARS, USD: 20 }, propuestas: [], lineas: [
      L1('02/10', 'SUPERMERCADO COTO', 50000, 'ARS', '', 'compra'), L1('02/10', 'SUPERMERCADO COTO', 50000, 'ARS', '', 'compra'),
      L1('05/10', 'TIENDAFUEGO', 15000, 'ARS', '02/03', 'cuota'), L1('06/10', 'FARMACIA', 12000, 'ARS', '', 'compra'),
      L1('', 'INTERESES FINANCIACION', 4000, 'ARS', '', 'interes'), L1('28/09', 'PAGO RECIBIDO', 30000, 'ARS', '', 'pago'),
      L1('07/10', 'CLAUDE.AI', 20, 'USD', '', 'compra')] });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const { ctx, page, errors } = await L.openArtifact(browser, base, { seed: L.FIXTURE.months, extra: `window.__sampleJson = ${JSON.stringify(statement(101000))};` });
    await waitMonth(page); await page.waitForFunction(() => !document.getElementById('photoRow').hidden);
    const attach = async () => { await page.setInputFiles('#photoInput', { name: 'resumen.png', mimeType: 'image/png', buffer: png }); await page.waitForSelector('#reviewOverlay.open', { timeout: 10000 }); };
    const visaOf = (cur) => page.evaluate((c) => { const i = allMonths['2026-10'].pinaItems.find(x => x.name === 'Visa' && x.currency === c); return { amount: i.amount, detail: (i.detail || []).length }; }, cur);

    await attach();
    assert.strictEqual(await page.locator('.rv-row').count(), 7); pass('el diálogo lista las 7 líneas del resumen');
    assert.strictEqual(await page.locator('#rvDest').inputValue(), 'p:' + await page.evaluate(() => pinaPairs(getMonth()).find(p => p.ars.name === 'Visa').pairId)); pass('destino preseleccionado: Visa');
    const checked = await page.locator('.rv-row input[id^=rvOn]').evaluateAll(els => els.map(e => e.checked));
    assert.deepStrictEqual(checked, [true, false, true, true, false, false, true]); pass('compras marcadas; duplicado, interés y pago sin marcar');
    const tags = await page.locator('.rv-row .rv-tag').allInnerTexts();
    assert.deepStrictEqual(tags, ['Posible duplicado', 'Interés', 'Pago o bonificación']); pass('cada línea dudosa dice por qué: ' + tags.join(' / '));
    let sum = await page.locator('#rvSum').innerText();
    assert.ok(sum.includes('$77.000') && sum.includes('$101.000') && /coinciden/.test(sum)); pass('marcado $77.000 de $101.000 del resumen, y las líneas leídas coinciden con el total');
    await page.locator('#rvOn3').uncheck();
    assert.ok((await page.locator('#rvSum').innerText()).includes('$65.000')); pass('al desmarcar FARMACIA el total baja a $65.000 en vivo');
    await page.locator('#rvOn3').check();
    assert.ok(await page.locator('#rvTrack2').isChecked()); pass('la cuota 2/3 ofrece seguirla en noviembre (3/3), ya tildada');
    await page.click('#rvApply');
    await page.waitForFunction(() => !document.getElementById('reviewOverlay').classList.contains('open'));
    assert.deepStrictEqual(await visaOf('ARS'), { amount: 77000, detail: 3 }); assert.deepStrictEqual(await visaOf('USD'), { amount: 20, detail: 1 }); pass('Visa: $77.000 y USD 20, con el detalle de las líneas');
    assert.ok(/Detalle \(3/.test(await page.locator('#pinaExpenseTbody tr').first().locator('summary').first().innerText())); pass('la fila de Visa tiene "Detalle (3 · $77.000)" desplegable');
    const nov = await page.evaluate(() => { const m = allMonths['2026-11']; const it = m && m.pinaItems.find(i => i.name === 'TIENDAFUEGO' && i.currency === 'ARS'); return it ? { amount: it.amount, inst: it.installments, auto: !!m.auto } : null; });
    assert.deepStrictEqual(nov, { amount: 15000, inst: { current: 3, total: 3 }, auto: false }); pass('noviembre ya tiene TIENDAFUEGO $15.000, cuota 3/3');
    await page.click('#toastBtn');
    assert.deepStrictEqual(await visaOf('ARS'), { amount: 0, detail: 0 });
    assert.ok(!(await page.evaluate(() => '2026-11' in allMonths))); pass('Deshacer vuelve Visa a cero y borra el noviembre que se creó');

    await attach(); await page.click('#rvApply');
    await page.waitForFunction(() => !document.getElementById('reviewOverlay').classList.contains('open'));
    assert.strictEqual((await visaOf('ARS')).amount, 77000);
    await attach();
    const tags2 = await page.locator('.rv-row .rv-tag').allInnerTexts();
    assert.ok(tags2.filter(x => x === 'Ya cargado este mes').length >= 4); pass('al cargar el mismo resumen otra vez, lo ya cargado viene sin marcar ("Ya cargado este mes")');
    assert.ok(await page.locator('input[name=rvMode][value=add]').isChecked()); pass('y el modo por defecto es sumar a lo que ya tiene');
    await page.keyboard.press('Escape');
    assert.ok(!(await page.locator('#reviewOverlay.open').count())); pass('Esc cierra el diálogo sin cargar nada');
    assert.strictEqual((await visaOf('ARS')).amount, 77000);

    await page.click('#nextMonthBtn');
    await page.waitForFunction(() => document.getElementById('monthLabel').textContent === 'Noviembre 2026');
    await page.evaluate((s) => { window.__sampleJson = s; }, { tipo: 'tarjeta', emisor: 'Visa', totales: { ARS: 15000 + 8000, USD: null }, propuestas: [], lineas: [
      L1('04/11', 'TIENDAFUEGO', 15000, 'ARS', '03/03', 'cuota'), L1('09/11', 'KIOSCO', 8000, 'ARS', '', 'compra')] });
    await attach();
    const novTags = await page.evaluate(() => review.lines.map(l => l.flag));
    assert.deepStrictEqual(novTags, ['Ya la sigo como cuota', '']); pass('en noviembre, la cuota 3/3 del resumen sale como "Ya la sigo como cuota" y sin marcar');
    await page.keyboard.press('Escape');
    all.push(...errors); await ctx.close();

    const w = await L.openArtifact(browser, base, { seed: L.FIXTURE.months, extra: `window.__sampleJson = ${JSON.stringify(statement(999999))};` });
    await waitMonth(w.page); await w.page.waitForFunction(() => !document.getElementById('photoRow').hidden);
    await w.page.setInputFiles('#photoInput', { name: 'r.png', mimeType: 'image/png', buffer: png });
    await w.page.waitForSelector('#reviewOverlay.open');
    assert.ok(/puede faltar o sobrar/.test(await w.page.locator('#rvSum').innerText())); pass('si las líneas no suman el total del resumen, avisa que puede faltar o sobrar una');
    all.push(...w.errors); await w.ctx.close();
  }

  section('Idea 3) Último respaldo automático en GitHub');
  {
    const at = new Date('2026-10-01T09:00:00').getTime();
    const a = await L.openArtifact(browser, base, { seed: L.FIXTURE.months, extra: `window.__META = { backup: { at: ${at} } };` });
    await waitMonth(a.page);
    await a.page.waitForFunction(() => /Último respaldo/.test(document.getElementById('backupInfo').textContent)); pass('muestra la fecha del último respaldo');
    all.push(...a.errors); await a.ctx.close();
    const b = await L.openArtifact(browser, base, { seed: L.FIXTURE.months });
    await waitMonth(b.page); await L.sleep(300);
    assert.ok(/Todavía no/.test(await b.page.locator('#backupInfo').innerText())); pass('sin respaldo, lo dice');
    all.push(...b.errors); await b.ctx.close();
  }
  return all;
};
