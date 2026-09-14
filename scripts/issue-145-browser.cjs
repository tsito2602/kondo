const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('/tmp/tabi-browser/node_modules/playwright');
const output = '/tmp/tabi-145-screenshots';
fs.mkdirSync(output, { recursive: true });
const root = path.resolve('dist');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"Local demo only"}'); return; }
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise((resolve) => server.listen(4173, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    for (const variant of [
      { name: 'mobile', viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' },
      { name: 'desktop', viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' },
      { name: 'mobile-reduced', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' },
    ]) {
      const context = await browser.newContext({ viewport: variant.viewport, reducedMotion: variant.reducedMotion, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('tabi.demo-active', '1');
        window.tripTransitions = [];
        if (typeof document.startViewTransition === 'function') {
          const original = document.startViewTransition.bind(document);
          document.startViewTransition = (update) => {
            const record = { ready: false, ended: false, error: null };
            window.tripTransitions.push(record);
            const transition = original(update);
            transition.ready.then(() => { record.ready = true; }, (error) => { record.error = error.message; });
            transition.finished.then(() => { record.ended = true; }, () => { record.ended = true; });
            return transition;
          };
        }
      });
      await page.goto('http://127.0.0.1:4173/');
      const first = page.getByTestId('trip-ticket').first();
      await first.waitFor({ state: 'visible', timeout: 20000 });
      await page.screenshot({ path: `${output}/${variant.name}-list.png` });
      await first.click();
      await page.waitForURL(/\/trips\/[^/]+\/itinerary/);
      await page.getByTestId('trip-hero-cover').waitFor({ state: 'visible' });
      if (variant.reducedMotion !== 'reduce') {
        await page.waitForFunction(() => window.tripTransitions.some((entry) => entry.ready), null, { timeout: 5000 });
        await page.screenshot({ path: `${output}/${variant.name}-opening.png`, animations: 'allow' });
      }
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-trip-transition'));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `${variant.name}: viewport must not overflow`);
      await page.screenshot({ path: `${output}/${variant.name}-journal.png` });
      if (variant.name === 'desktop') await page.getByText('すべての旅行', { exact: true }).click();
      else await page.getByRole('button', { name: '旅行一覧へ戻る', exact: true }).click();
      await page.waitForURL('http://127.0.0.1:4173/');
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-trip-transition'));
      const results = await page.evaluate(() => window.tripTransitions);
      if (variant.reducedMotion === 'reduce') assert.equal(results.length, 0, 'reduced motion does not create snapshots');
      else {
        assert.equal(results.length, 2, 'one opening and one closing transition');
        assert(results.every((entry) => entry.ready && !entry.error), JSON.stringify(results));
      }
      assert.deepEqual(errors, [], `${variant.name}: no runtime errors`);
      console.log(`${variant.name}: open/close, rendered cover, viewport and motion preference passed`);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
