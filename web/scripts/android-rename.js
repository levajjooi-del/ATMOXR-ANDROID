/**
 * Pós-build p/ o APK Android.
 *
 * O AAPT (empacotador do Android) ignora arquivos/pastas de assets cujo
 * nome começa com "_". O export do Next.js coloca TODO o JavaScript em
 * "_next/" — sem esta renomeação, o APK sai oco (só ~140 KB, sem o app).
 *
 * Este script renomeia no export (web/out):
 *   _next/            -> next/
 *   _buildManifest.js -> buildManifest.js
 *   _ssgManifest.js   -> ssgManifest.js
 *   _app-*.js         -> app-*.js
 *   _error-*.js       -> error-*.js
 * e reescreve as referências correspondentes nos arquivos de texto
 * (HTML/JS/CSS/JSON), incluindo o publicPath do webpack ("/_next/").
 *
 * Roda automaticamente via "postbuild" (npm run build), local e no CI.
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'out');

if (!fs.existsSync(OUT)) {
  console.log('[android-rename] pasta out/ não existe; pulando.');
  process.exit(0);
}

// Regras de reescrita de referências (ordenadas; "_" só some de NOMES DE
// ARQUIVO/PASTA — chaves de rota como "/_app" e variáveis como
// __BUILD_MANIFEST NÃO são tocadas).
const REPLACEMENTS = [
  ['/_next/', '/next/'],
  ['\\/_next\\/', '\\/next\\/'],
  ['/_next"', '/next"'],
  ["/_next'", "/next'"],
  ['/_buildManifest.js', '/buildManifest.js'],
  ['/_ssgManifest.js', '/ssgManifest.js'],
  ['/_app-', '/app-'],
  ['/_error-', '/error-'],
];

const TEXT_EXT = new Set(['.html', '.js', '.css', '.json', '.txt']);

function walk(dir, fn) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, fn);
    fn(p, entry);
  }
}

// 1) Renomeia arquivos/pastas com "_" inicial (arquivos antes das pastas,
//    pastas da mais profunda para a mais rasa).
const toRename = [];
walk(OUT, (p, entry) => {
  if (entry.name.startsWith('_')) {
    toRename.push({ from: p, to: path.join(path.dirname(p), entry.name.slice(1)), isDir: entry.isDirectory() });
  }
});
toRename.sort((a, b) => (a.isDir === b.isDir ? b.from.length - a.from.length : a.isDir ? 1 : -1));
for (const r of toRename) fs.renameSync(r.from, r.to);

// 2) Reescreve as referências nos arquivos de texto.
let touched = 0;
walk(OUT, (p, entry) => {
  if (entry.isDirectory()) return;
  if (!TEXT_EXT.has(path.extname(entry.name))) return;
  let txt = fs.readFileSync(p, 'utf8');
  const orig = txt;
  for (const [oldStr, newStr] of REPLACEMENTS) txt = txt.split(oldStr).join(newStr);
  if (txt !== orig) {
    fs.writeFileSync(p, txt);
    touched++;
  }
});

console.log(`[android-rename] ${toRename.length} caminho(s) renomeado(s), ${touched} arquivo(s) reescrito(s).`);
