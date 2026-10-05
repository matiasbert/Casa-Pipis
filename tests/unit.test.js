// Pure functions of the data model, run inside the real page (no clicks).
const assert = require('assert');
const L = require('./lib');
const { pass, section } = L;

module.exports = async function run(browser, base) {
  const errors = [];
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(L.fakeDate());
  await L.stubExternal(ctx);
  await ctx.route('https://api.github.com/**', r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(base + '/');
  await page.waitForFunction(() => document.getElementById('monthLabel').textContent !== 'Cargando…', null, { timeout: 15000 });

  section('Unit 1) Montos escritos en formato argentino');
  const cases = { '655.520': 655520, '655520': 655520, '1.234,56': 1234.56, '12,5': 12.5, '$ 1.000': 1000, '0,5': 0.5, '1.234.567': 1234567,
                  '655,52': 655.52, '12.5': 12.5, '1.500': 1500, '10.000,5': 10000.5, 'USD 1.200': 1200, '': 0, 'abc': 0 };
  for (const [input, want] of Object.entries(cases)) {
    const got = await page.evaluate((x) => parseAmount(x), input);
    assert.strictEqual(got, want, `parseAmount(${JSON.stringify(input)}) = ${got}, esperado ${want}`);
  }
  pass(`${Object.keys(cases).length} formatos leídos bien ("655.520" ya no se guarda como 655,52)`);

  section('Unit 2) Dólares con centavos');
  assert.strictEqual(await page.evaluate(() => fmtUSD(19.99)), 'USD 19,99');
  assert.strictEqual(await page.evaluate(() => fmtUSD(20)), 'USD 20');
  assert.strictEqual(await page.evaluate(() => fmtUSD(1234.5)), 'USD 1.234,50'); pass('USD 19,99 / USD 20 / USD 1.234,50');

  section('Unit 3) Unión de dos copias de un mes, gasto por gasto');
  const it = (id, amount, ts, extra = {}) => ({ id, name: id, currency: 'ARS', amount, notes: '', installments: null, isRecurring: false, ts, ...extra });
  const mm = (updatedAt, items, extra = {}) => ({ key: '2026-10', matiSplit: 75, pinaSplit: 25, locked: false, updatedAt, items, pinaItems: [], ...extra });
  const merge = (l, r) => page.evaluate(([a, b]) => mergeMonth(a, b), [l, r]);
  let m = await merge(mm(100, [it('edesur', 5, 100), it('metrogas', 0, 0)]), mm(200, [it('edesur', 0, 0), it('metrogas', 7, 200)]));
  assert.deepStrictEqual(m.items.map(i => [i.id, i.amount]).sort(), [['edesur', 5], ['metrogas', 7]]); pass('dos dispositivos editan gastos distintos: se conservan los dos');
  m = await merge(mm(250, [it('x', 1, 50), it('y', 9, 250)]), mm(300, [it('y', 1, 0)], { removed: { x: 300 } }));
  assert.deepStrictEqual(m.items.map(i => [i.id, i.amount]).sort(), [['y', 9]]); pass('un gasto borrado en un lado se borra, y la edición del otro gasto se mantiene');
  m = await merge(mm(400, [it('x', 1, 400)]), mm(300, [], { removed: { x: 300 } }));
  assert.deepStrictEqual(m.items.map(i => i.id), ['x']); pass('un gasto deshecho después del borrado vuelve');
  m = await merge(mm(100, [it('a', 1, 0)]), mm(200, [it('b', 2, 0)]));
  assert.deepStrictEqual(m.items.map(i => i.id), ['b']); pass('datos viejos (sin marca) siguen a la copia más nueva');
  m = await merge(mm(100, [], { locked: false }), mm(200, [], { locked: true }));
  assert.strictEqual(m.locked, true); pass('los campos del mes vienen de la copia editada último');

  section('Unit 4) Mes creado por la app cede ante cualquier copia real');
  const res = await page.evaluate(() => {
    const keep = JSON.stringify(allMonths);
    const auto = createMonthRecord('2030-01'); allMonths['2030-01'] = auto;
    const real = { key: '2030-01', matiSplit: 75, pinaSplit: 25, locked: false, updatedAt: 0, items: [{ id: 'q', name: 'Quincho', currency: 'ARS', amount: 5, ts: 0 }], pinaItems: [] };
    const r = mergeRemote({ months: { '2030-01': real }, deleted: {} });
    const out = { changed: r.changed, names: allMonths['2030-01'].items.map(i => i.name), auto: !!allMonths['2030-01'].auto };
    delete allMonths['2030-01']; return out;
  });
  assert.deepStrictEqual(res, { changed: true, names: ['Quincho'], auto: false }); pass('la copia real reemplaza al mes automático aunque tenga fecha 0');
  const ids = await page.evaluate(() => [createMonthRecord('2031-01'), createMonthRecord('2031-01')].map(m => m.items.map(i => i.id).join()));
  assert.strictEqual(ids[0], ids[1]); pass('dos dispositivos crean los mismos ids (la unión no duplica)');
  assert.ok(await page.evaluate(() => createMonthRecord('2031-01').auto === true && createMonthRecord('2031-01').updatedAt === 0)); pass('mes automático: marca auto y sin fecha de edición');

  section('Unit 5) Meses borrados');
  const del = await page.evaluate(() => {
    allMonths['2029-01'] = { key: '2029-01', matiSplit: 75, pinaSplit: 25, updatedAt: 5, items: [], pinaItems: [] };
    const r = mergeRemote({ months: {}, deleted: { '2029-01': 99 } });
    return { gone: !('2029-01' in allMonths), changed: r.changed };
  });
  assert.deepStrictEqual(del, { gone: true, changed: true }); pass('una marca de borrado más nueva elimina el mes local');
  const sigs = await page.evaluate(() => { const a = { key: 'k', matiSplit: 75, pinaSplit: 25, updatedAt: 1, items: [{ id: 'a', amount: 1, name: 'n' }], pinaItems: [] };
    const b = { pinaItems: [], items: [{ name: 'n', amount: 1, id: 'a' }], updatedAt: 99, auto: true, pinaSplit: 25, matiSplit: 75, key: 'k' }; return [monthSig(a), monthSig(b)]; });
  assert.strictEqual(sigs[0], sigs[1]); pass('la firma de contenido no depende del orden de campos ni de la fecha');

  await ctx.close();
  return errors;
};
