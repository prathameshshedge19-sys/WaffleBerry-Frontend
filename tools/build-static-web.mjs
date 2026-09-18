// Dependency-free static deployment. Only reviewed, Git-tracked product assets
// enter dist/web; native code, tools, credentials and local artifacts never do.
import { copyFile, lstat, mkdir, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(path.resolve(fileURLToPath(new URL('..', import.meta.url))));
const dist = path.join(root, 'dist');
const output = path.join(dist, 'web');
const rootAssets = new Set([
  'index.html', 'auth.html', 'chat.html', 'legacy-chat.html', 'gateway.html',
  'forgot-password.html', 'reset-password.html', 'verify-email.html',
  'verify-reset-otp.html', 'invite.html', 'privacy.html', 'terms.html',
  'favicon.ico', 'favicon.svg', 'favicon-32x32.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'site.webmanifest', 'robots.txt', 'sitemap.xml',
]);
const omitted = new Set(['js/realtime-dev.mjs', 'js/realtime-dev-auth.mjs']);
const files = JSON.parse(await readFile(new URL('./static-web-assets.json', import.meta.url), 'utf8'));
if (!Array.isArray(files) || new Set(files).size !== files.length) throw new Error('Invalid product asset manifest');
for (const file of files) if (!(typeof file === 'string' && (rootAssets.has(file) || (
  /^(?:css|js|assets|locales)\//.test(file) &&
  /\.(?:css|js|mjs|json|svg|png|ico|jpg|jpeg|webp|mp3|woff2)$/.test(file) &&
  !file.split('/').some(part => part.startsWith('.')) && !omitted.has(file)
)))) throw new Error('Non-product file in static deployment manifest');
for (const asset of rootAssets) if (!files.includes(asset)) throw new Error(`Missing product asset: ${asset}`);

// Check resolved absolute targets before recursively replacing generated output.
for (const directory of [dist, output]) {
  const info = await lstat(directory).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (info && (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== directory)) {
    throw new Error('Refusing an unsafe generated output directory');
  }
}
if (path.dirname(output) !== dist || path.dirname(dist) !== root || path.basename(output) !== 'web') {
  throw new Error('Output must be the repository-local dist/web directory');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  const source = path.resolve(root, file);
  const target = path.resolve(output, file);
  if (!source.startsWith(root + path.sep) || !target.startsWith(output + path.sep)) throw new Error('Unsafe asset path');
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink() || await realpath(source) !== source) throw new Error(`Unsafe asset: ${file}`);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}
console.log(`Static website: ${files.length} tracked product assets; no dependency installation required.`);
