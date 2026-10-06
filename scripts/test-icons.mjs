// The installed app's icons. The device-diagnosis comparison pages
// (/__icon-check/) are a temporary tool: their pixel experiments are not tested
// here, only that a production build never ships them.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildIconCheck } from './build-icon-check.mjs';
import { buildMobileCheck } from './build-mobile-check.mjs';

const sizeOf = async (file) => {
  const { width, height } = await sharp(path.join('public', file)).metadata();
  return `${width}x${height}`;
};

test('every icon the page, the build and the manifest point at exists at its declared size', async () => {
  const html = await readFile('index.html', 'utf8');
  const build = await readFile('scripts/build-pwa.mjs', 'utf8');
  const hrefs = new Set(
    [...html.matchAll(/rel="(?:icon|apple-touch-icon)" href="([^"]+)"/g), ...build.matchAll(/href="(\/icons\/[^"?]+)/g)].map((m) => m[1].split('?')[0]),
  );
  assert.ok(hrefs.size >= 3);
  for (const href of hrefs) {
    const buffer = await readFile(path.join('public', href));
    if (href.endsWith('.png') && href.includes('apple-touch')) assert.equal(await sizeOf(href), '180x180', href);
    assert.ok(buffer.length > 0, href);
  }
  const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) assert.equal(await sizeOf(icon.src), icon.sizes, icon.src);
});

test('a production build removes the diagnostic comparison pages', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kondo-icons-'));
  try {
    await mkdir(path.join(root, '__icon-check', 'old'), { recursive: true });
    await writeFile(path.join(root, '__icon-check', 'old', 'index.html'), 'stale');
    await buildIconCheck(root, false);
    await buildMobileCheck(root, false);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
