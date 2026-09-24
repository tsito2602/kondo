import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { buildIconCheck } from './build-icon-check.mjs';
import { renderTouchIcon } from './render-touch-icon.mjs';

const root = await mkdtemp(path.join(tmpdir(), 'tabi-icon-check-'));
try {
  const { base, variants } = await buildIconCheck(root, true);
  const scopes = new Set();
  for (const variant of variants) {
    const scope = `${base}/${variant.key}/`;
    const dir = path.join(root, scope.slice(1));
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.webmanifest'), 'utf8'));
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    assert.equal(manifest.id, scope);
    assert.equal(manifest.start_url, scope);
    assert.equal(manifest.scope, scope);
    assert.ok(html.includes(`rel="apple-touch-icon" href="${manifest.icons[0].src}"`));
    assert.ok(!html.includes('serviceWorker'));
    scopes.add(manifest.id);
  }
  assert.equal(scopes.size, 20);
  assert.deepEqual(await readFile(path.join(root, base, 'a/icon.png')), await readFile('scripts/fixtures/tabi-touch-transparent.png'));
  assert.deepEqual(await readFile(path.join(root, base, 'a2/icon.png')), await readFile('scripts/fixtures/tabi-touch-transparent.png'));
  assert.equal(JSON.parse(await readFile(path.join(root, base, 'a2/manifest.webmanifest'), 'utf8')).name, 'A再確認');
  const a = await sharp(path.join(root, base, 'a/icon.png')).raw().toBuffer();
  const h = await sharp(path.join(root, base, 'h/icon.png')).raw().toBuffer();
  assert.equal(a.length, h.length);
  for (let p = 0; p < a.length; p += 4) {
    assert.equal(h[p + 3], a[p + 3]);
    if (h[p + 3] === 255) {
      assert.equal(h[p], h[p + 1]);
      assert.equal(h[p], h[p + 2]);
    }
  }
  const i = await sharp(path.join(root, base, 'i/icon.png')).raw().toBuffer();
  const g = await sharp(path.join(root, base, 'g/icon.png')).raw().toBuffer();
  // The start marker is a true hole through both tickets, not opaque paint.
  assert.equal(i[(75 * 180 + 69) * 4 + 3], 0);
  assert.equal(g[(75 * 180 + 69) * 4 + 3], 255);
  assert.equal(i[(85 * 180 + 90) * 4 + 3], 255);
  assert.deepEqual(await readFile(path.join(root, base, 'b/icon.png')), await readFile('scripts/fixtures/kondo-outlined-touch.png'));
  // Preserve the exact device-approved I image independently of future edits.
  assert.deepEqual(await readFile(path.join(root, base, 'i/icon.png')), await renderTouchIcon(await readFile('scripts/fixtures/kondo-cutout-source.svg')));
  assert.deepEqual(await readFile(path.join(root, base, 'c/icon.png')), await readFile('public/icons/kondo-apple-touch-icon-v4.png'));
  assert.equal((await sharp(path.join(root, base, 'a/icon.png')).stats()).isOpaque, false);
  assert.equal((await sharp(path.join(root, base, 'b/icon.png')).stats()).isOpaque, false);
  assert.equal((await sharp(path.join(root, base, 'c/icon.png')).stats()).isOpaque, true);
  const original = await sharp(path.join(root, base, 'b/icon.png')).raw().toBuffer();
  for (const key of ['d', 'e']) {
    const variant = sharp(path.join(root, base, `${key}/icon.png`));
    const { data, info } = await variant.raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 180);
    assert.equal(info.height, 180);
    assert.equal(info.channels, 4);
    assert.equal((await variant.stats()).isOpaque, false);
    // Only colour changes: geometry, transparency and placement stay identical.
    for (let i = 3; i < data.length; i += 4) assert.equal(data[i], original[i]);
    assert.notDeepEqual(data, original);
    if (key === 'd') {
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 255) assert.ok(data[i] <= 245);
      }
    } else {
      assert.ok(data.some((value, i) => i % 4 === 0 && data[i + 3] === 255 && value !== data[i + 2]));
    }
  }
  for (const [key, palette] of [
    ['f', ['73,107,128', '215,226,232']],
    ['g', ['101,101,101', '224,224,224']],
  ]) {
    const { data, info } = await sharp(path.join(root, base, `${key}/icon.png`)).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    assert.equal(data.length, original.length);
    // Keep the geometry identical to B; only change colour. Allow intermediate
    // colours where two opaque shapes meet through antialiasing.
    const opaqueColours = new Set();
    for (let i = 0; i < data.length; i += 4) {
      assert.equal(data[i + 3], original[i + 3]);
      if (data[i + 3] === 255) opaqueColours.add([...data.subarray(i, i + 3)].join(','));
      if (key === 'g' && data[i + 3] === 255) {
        assert.equal(data[i], data[i + 1]);
        assert.equal(data[i], data[i + 2]);
      }
    }
    for (const colour of palette) assert.ok(opaqueColours.has(colour));
  }
  // The new master keeps a transparent canvas and paints the journey opaque black.
  const indexHtml = await readFile('index.html', 'utf8');
  const touchHref = indexHtml.match(/rel="apple-touch-icon" href="([^"]+)"/)[1];
  const touchImage = sharp(path.join('public', touchHref));
  const { data, info } = await touchImage.raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 180);
  assert.equal(info.height, 180);
  assert.equal(info.channels, 4);
  assert.equal((await touchImage.stats()).isOpaque, false);
  assert.equal(data[3], 0);
  // The enlarged journey marker remains opaque black; empty space stays clear.
  assert.deepEqual([...data.subarray((56 * 180 + 33) * 4, (56 * 180 + 33) * 4 + 4)], [0, 0, 0, 255]);
  assert.equal(data[(90 * 180 + 90) * 4 + 3], 0);
  assert.deepEqual(await readFile(path.join(root, base, 's/icon.png')), await readFile(path.join('public', touchHref)));
  const iconSvg = await readFile('assets/brand/icon.svg', 'utf8');
  assert.ok(!iconSvg.includes('<mask'));
  // SVG and touch exports must render identical opaque details.
  const svgPixels = await renderTouchIcon(iconSvg);
  assert.deepEqual(svgPixels, await readFile(path.join('public', touchHref)));
  for (const file of ['assets/brand/adaptive-foreground.png', 'assets/brand/adaptive-monochrome.png']) {
    const { data: pixels, info: size } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    assert.equal(size.channels, 4);
    assert.equal(pixels[(374 * size.width + 280) * 4 + 3], 255);
    assert.equal(pixels[(512 * size.width + 512) * 4 + 3], 0);
  }
  assert.equal((await sharp('assets/brand/logo.png').stats()).isOpaque, false);
  // In-app dark mode uses white strokes, while the installed icon stays identical.
  const darkLogo = await renderTouchIcon(await readFile('public/logo-dark.svg'));
  const darkPixels = await sharp(darkLogo).raw().toBuffer();
  assert.ok(darkPixels.some((value, index) => index % 4 === 3 && value === 255));
  for (let offset = 0; offset < darkPixels.length; offset += 4) {
    if (darkPixels[offset + 3] > 0) assert.deepEqual([...darkPixels.subarray(offset, offset + 3)], [255, 255, 255]);
  }
  assert.equal(darkPixels[(90 * 180 + 90) * 4 + 3], 0);
  // The solid destination pin keeps its circular cutout in dark mode.
  assert.equal(darkPixels[(117 * 180 + 143) * 4 + 3], 0);
  // Count visible islands: the joined start/upper stroke, five separated dashes,
  // and the pin. This also catches renderers ignoring pathLength on dash arrays.
  const seen = new Set();
  let islands = 0;
  for (let pixel = 0; pixel < 180 * 180; pixel++) {
    if (seen.has(pixel) || darkPixels[pixel * 4 + 3] < 128) continue;
    islands++;
    const queue = [pixel];
    seen.add(pixel);
    while (queue.length) {
      const current = queue.pop();
      const x = current % 180;
      const y = Math.floor(current / 180);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= 180 || ny < 0 || ny >= 180) continue;
        const next = ny * 180 + nx;
        if (!seen.has(next) && darkPixels[next * 4 + 3] >= 128) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }
  assert.equal(islands, 7, 'all five dashes must remain distinct at touch-icon size');
  // Compare the settled boot symbol with the actual shipped logos in both themes.
  // Reveal masks are fully open and the temporary ink tips are gone at this point.
  for (const theme of ['light', 'dark']) {
    const dom = new JSDOM(indexHtml);
    const symbol = dom.window.document.querySelector('.boot-symbol');
    symbol.setAttribute('viewBox', '0 0 1024 1024');
    symbol.setAttribute('color', theme === 'dark' ? '#FFFFFF' : '#000000');
    symbol.querySelectorAll('.boot-pen-tip').forEach(node => node.remove());
    symbol.querySelectorAll('[mask]').forEach(node => node.removeAttribute('mask'));
    if (theme === 'dark') symbol.querySelectorAll('.boot-edge').forEach(node => node.remove());
    const animated = await sharp(await renderTouchIcon(symbol.outerHTML)).raw().toBuffer();
    const shipped = await sharp(await renderTouchIcon(await readFile(`public/logo${theme === 'dark' ? '-dark' : ''}.svg`))).raw().toBuffer();
    assert.deepEqual(animated, shipped, `${theme} boot symbol must finish on the shipped logo`);
    dom.window.close();
  }
  assert.notDeepEqual(darkLogo, await renderTouchIcon(await readFile('public/logo.svg')));
  assert.deepEqual(await readFile('public/icon-dark-192.png'), await readFile('public/icon-192.png'));

  await buildIconCheck(root, false);
  assert.deepEqual(await readdir(root), []);
  console.log('Icon comparison: isolated identities, legacy controls, new kondo variants, production cleanup passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
