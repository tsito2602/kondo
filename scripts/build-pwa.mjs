import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { buildIconCheck } from './build-icon-check.mjs';
import { buildMobileCheck } from './build-mobile-check.mjs';
const root = path.resolve('dist');
const template = await readFile('scripts/service-worker.js', 'utf8');
// Clean a previous diagnostic export even when rebuilding for production.
await buildIconCheck(root, false);
await buildMobileCheck(root, false);
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}
const exportedFiles = await walk(root);
// Apply the same icon set to every generated HTML page.
const iconLinks = '<link rel="apple-touch-icon" href="/icons/kondo-apple-touch-icon-v13.png"/><link rel="icon" href="/icons/favicon.ico?v=kondo13" sizes="any"/><link rel="icon" href="/icons/favicon-32x32.png?v=kondo13" type="image/png" sizes="32x32"/><link rel="icon" href="/icons/favicon-16x16.png?v=kondo13" type="image/png" sizes="16x16"/><link rel="icon" href="/icons/kondo-icon-v13.svg" type="image/svg+xml" sizes="any"/>';
for (const file of exportedFiles.filter((file) => file.endsWith('.html'))) {
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace(/<link\b(?=[^>]*\brel="(?:icon|apple-touch-icon)")[^>]*>/g, '').replace('</head>', `${iconLinks}</head>`));
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
// Generate after icon rewriting and precaching: each comparison keeps its own
// icon/manifest and never receives the main app's cached shell.
await buildIconCheck(root, process.env.EXPO_PUBLIC_ENABLE_DEMO === 'true');
await buildMobileCheck(root, process.env.EXPO_PUBLIC_ENABLE_DEMO === 'true');
