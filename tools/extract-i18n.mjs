// Build-time inventory only. No user content, database, or API is read.
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parserRoot = process.env.I18N_PARSER_ROOT || resolve(root, '../i18n-tools/node_modules');
const { parse: parseJs } = await import(pathToFileURL(resolve(parserRoot, 'acorn/dist/acorn.mjs')));
const { parse: parseHtml, parseFragment } = await import(pathToFileURL(resolve(parserRoot, 'parse5/dist/index.js')));
const records = new Map();
const norm = s => s.replace(/\s+/g, ' ').trim();
const add = (value, file, kind = 'text') => {
  const s = norm(value);
  if (!/[A-Za-z]/.test(s) || s.length < 2 || /^(https?:|mailto:|\/[\w]|[\w-]+\.(html|js|mjs|css|svg|png)|#[\w-])/.test(s) || /^[\w.+-]+@[\w.-]+$/.test(s)) return;
  if (!records.has(s)) records.set(s, { source: s, files: [], kind });
  const row = records.get(s); if (!row.files.includes(file)) row.files.push(file);
};
function html(node, file) {
  if (['script', 'style', 'code', 'svg'].includes(node.tagName)) return;
  if (node.nodeName === '#text') add(node.value, file);
  for (const a of node.attrs || []) if (['aria-label', 'placeholder', 'title', 'alt', 'data-tooltip'].includes(a.name)) add(a.value, file, 'attribute');
  for (const c of node.childNodes || []) html(c, file);
}
const skipFiles = /^(three\.|rya\.bundle|i18n|locales|realtime-worklet|realtime-pcm|realtime-playback|realtime-client|playback-envelope|rya-renderer|memory-earth|legacy-portrait-renderer|portrait-motion)/;
function js(node, parent, file) {
  if (!node || typeof node !== 'object') return;
  let value = null;
  if (node.type === 'Literal' && typeof node.value === 'string') value = node.value;
  if (node.type === 'TemplateLiteral') value = node.quasis.map((q, i) => (q.value.cooked || q.value.raw) + (i < node.expressions.length ? `{${i}}` : '')).join('');
  if (value) {
    if (/<[a-z][^>]*>/i.test(value)) html(parseFragment(value), file);
    else if (!(parent?.type === 'Property' && parent.key === node) && !['ImportDeclaration', 'ExportNamedDeclaration'].includes(parent?.type)) {
      // Include sentence fragments, labels and human-readable state names; exclude selectors and protocol identifiers.
      const readable = /\s/.test(value) || /^[A-Z][A-Za-z]*(?:[.!…])?$/.test(value) || ['owner','viewer','collaborator','pending','active','ready','failed','enabled','disabled','processing','image','document','audio','video','unknown'].includes(value);
      if (readable && !/[;=]|=>|\b(?:const|function)\b|\[[\w-]+=/.test(value) && !/^[.#][\w-]/.test(value) && !/^[\w-]+(?: [.#>][\w:[\]="'-]+)+$/.test(value)) add(value, file, node.type === 'TemplateLiteral' ? 'template' : 'text');
    }
  }
  for (const [k, v] of Object.entries(node)) if (!['start','end','loc','raw','quasis'].includes(k)) {
    if (Array.isArray(v)) v.forEach(c => js(c, node, file)); else if (v && typeof v === 'object') js(v, node, file);
  }
}
for (const name of (await readdir(root)).filter(f => f.endsWith('.html'))) html(parseHtml(await readFile(resolve(root, name), 'utf8')), name);
for (const name of (await readdir(resolve(root, 'js'))).filter(f => /\.(m?js)$/.test(f) && !skipFiles.test(f))) {
  const code = await readFile(resolve(root, 'js', name), 'utf8');
  js(parseJs(code, { ecmaVersion: 'latest', sourceType: 'module' }), null, 'js/' + name);
}
for (const s of ['Language','Choose your language','English','Deutsch','Français','हिन्दी','मराठी','This language could not load. Please try again.']) add(s, 'language-selector');
const result = [...records.values()].sort((a,b) => a.source.localeCompare(b.source));
process.stdout.write(JSON.stringify(result, null, 2));
