/* ===========================================================
   bouw-demo.mjs — maakt van de app één los HTML-bestand
   -----------------------------------------------------------
   Handig om iemand snel te laten klikken zonder server of
   hosting. Gebruik:  node tools/bouw-demo.mjs
   Resultaat:         demo/levaux-voorraad-demo.html
   =========================================================== */

import fs from 'node:fs';
import path from 'node:path';

const wortel = path.resolve(import.meta.dirname, '..');
const lees = p => fs.readFileSync(path.join(wortel, p), 'utf8');

/** import- en export-sleutelwoorden weghalen zodat alles in één script past */
function ontModuleer(code) {
  return code
    .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+(const|let|function|class|async)/gm, '$1');
}

const css = lees('css/styles.css');
const seed = lees('data/seed.json');
const logo = fs.readFileSync(path.join(wortel, 'assets/logo-mark.png')).toString('base64');

const script = [
  `window.__SEED__ = ${seed.trim()};`,
  'window.LEVAUX_CONFIG = { supabaseUrl: "", supabaseKey: "" };',  // demo draait altijd lokaal
  ontModuleer(lees('js/store.js')),
  ontModuleer(lees('js/cloud.js')),
  ontModuleer(lees('js/ocr.js')),
  ontModuleer(lees('js/app.js'))
].join('\n\n');

// let op: vervangen via een functie, anders leest JavaScript tekens als
// $' en $` in de code als verwijzingen en loopt het bestand in de soep
let html = lees('index.html')
  .replace('<link rel="stylesheet" href="css/styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="config.js"></script>\n', '')
  .replace('<script src="js/app.js" type="module"></script>', () => `<script type="module">\n${script}\n</script>`)
  .replace(/<link rel="manifest"[^>]*>\s*/g, '')
  .replace(/assets\/logo-mark\.png/g, () => `data:image/png;base64,${logo}`)
  .replace(/<link rel="apple-touch-icon"[^>]*>\s*/g, '')
  .replace('<title>Levaux Bouw · Voorraad</title>', '<title>Levaux Bouw · Voorraad (demo)</title>');

fs.mkdirSync(path.join(wortel, 'demo'), { recursive: true });
const uit = path.join(wortel, 'demo/levaux-voorraad-demo.html');
fs.writeFileSync(uit, html);
console.log('Klaar:', uit, '·', Math.round(html.length / 1024) + ' kB');
