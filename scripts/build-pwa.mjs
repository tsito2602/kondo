import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve('dist');
const template = await readFile('scripts/service-worker.js', 'utf8');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}
const exportedFiles = await walk(root);
// Expo replaces custom rel=icon links with favicon.ico during export.
// Restore the theme-aware vector icon on every statically generated page.
for (const file of exportedFiles.filter((file) => file.endsWith('.html'))) {
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace(/<link\b(?=[^>]*\brel="icon")[^>]*>/g, '<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any"/>'));
}
const files = exportedFiles.filter((file) => !/\.(map|html)$/.test(file) && !/\/(sw\.js|_headers|metadata\.json)$/.test(file));
files.push(path.join(root, 'index.html'));
files.sort();
const digest = createHash('sha256');
// Changes to cache semantics also need a distinct shell version.
digest.update(template);
for (const file of files) { digest.update(path.relative(root, file)); digest.update(await readFile(file)); }
const version = digest.digest('hex').slice(0, 16);
// Workers redirects /index.html to /. Cache the canonical URL directly.
const urls = files.map((file) => file === path.join(root, 'index.html') ? '/' : '/' + path.relative(root, file).split(path.sep).join('/'));
await writeFile(path.join(root, 'sw.js'), template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(urls)));
console.log(`PWA ${version}: ${urls.length} files prepared for offline startup`);
