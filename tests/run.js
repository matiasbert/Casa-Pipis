#!/usr/bin/env node
// Runs every suite in a real Chromium. Usage: cd tests && npm install && npm test
const L = require('./lib');
const suites = ['unit', 'github', 'artifact'].filter(n => require('fs').existsSync(require('path').join(__dirname, n + '.test.js')));

(async () => {
  const { server, url } = await L.serve({ '/__artifact.html': { type: 'text/html', body: L.buildArtifactPage() } });
  const browser = await L.launch();
  let failed = false;
  for (const name of suites) {
    console.log(`\n=== ${name} ===`);
    try {
      const errors = await require('./' + name + '.test.js')(browser, url);
      const real = (errors || []).filter(e => !/ERR_TUNNEL|ERR_CERT|ERR_FAILED|net::/.test(e));
      if (real.length) { failed = true; console.log('\n✗ Errores de JavaScript:\n' + real.join('\n')); }
    } catch (e) { failed = true; console.error('\n✗ FALLÓ:', e.message); if (process.env.DEBUG) console.error(e.stack); }
  }
  await browser.close(); server.close();
  console.log(failed ? '\nHAY FALLAS' : '\nTodo OK');
  process.exit(failed ? 1 : 0);
})();
