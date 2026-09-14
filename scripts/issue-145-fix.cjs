const fs = require('node:fs');
function replace(path, old, next) {
  const source = fs.readFileSync(path, 'utf8');
  if (source.split(old).length !== 2) throw new Error(`Expected one exact match in ${path}: ${old.slice(0, 80)}`);
  fs.writeFileSync(path, source.replace(old, next));
}
const controller = 'src/utils/trip-transition.web.ts';
replace(controller, '  cancelWait?: () => void;', '  cancelWait?: () => void;\n  checkDestination?: () => void;');
replace(controller, '  let active: Operation | undefined;', '  let active: Operation | undefined;\n  let renderedPath: string | undefined;');
replace(controller, "const path = win.location.pathname.replace(/\\/$/, '') || '/';", "const path = (renderedPath ?? win.location.pathname).replace(/\\/$/, '') || '/';");
replace(controller, '      op.cancelWait = undefined;', '      op.cancelWait = undefined;\n      op.checkDestination = undefined;');
replace(controller, '    op.cancelWait = () => end(null);', '    op.cancelWait = () => end(null);\n    op.checkDestination = check;');
replace(controller, '  const routeDidRender = (pathname: string) => {\n    if (active', '  const routeDidRender = (pathname: string) => {\n    // The router can commit before its browser-history effect. Use its actual\n    // rendered route, not a briefly stale location.pathname, to settle capture.\n    renderedPath = pathname;\n    active?.checkDestination?.();\n    if (active');
replace(controller, "  const ticket = (id: string) => doc.getElementById(`trip-ticket-${id}`);\n  const workspace = (id: string) => doc.getElementById(`trip-workspace-${id}`);\n  const list = () => doc.getElementById('trip-list-ready');", "  // Native-stack may retain a hidden copy of the list after replace('/').\n  // Resolve the visible screen rather than the first duplicate nativeID.\n  const liveById = (id: string) => {\n    const first = doc.getElementById(id);\n    return visible(first) ? first : Array.from(doc.querySelectorAll<HTMLElement>('[id]')).find((element) => element.id === id && visible(element)) ?? null;\n  };\n  const ticket = (id: string) => liveById(`trip-ticket-${id}`);\n  const workspace = (id: string) => liveById(`trip-workspace-${id}`);\n  const list = () => liveById('trip-list-ready');");
replace('scripts/test-trip-transition.mjs', "console.log('Trip transitions:", `{
  const f = setup();
  f.controller.routeDidRender('/');
  f.controller.run('open', 'a', () => {
    f.detail();
    // Model React's layout commit preceding the browser history effect.
    f.dom.window.history.replaceState({}, '', '/');
    f.controller.routeDidRender('/trips/a/itinerary');
  });
  await tick();
  assert.equal(f.transitions[0].skipped, false, 'a committed route is not cancelled by stale browser history');
  assert.equal(f.transitions[0].new.length, 2);
  f.transitions[0].finish(); await tick(); f.close();
}
{
  const f = setup();
  f.document.getElementById('trip-list-ready').scrollTop = 360;
  const retained = f.document.getElementById('trip-list-ready').cloneNode(true);
  f.controller.run('open', 'a', () => f.detail()); await tick();
  f.transitions[0].finish(); await tick();
  f.controller.run('close', 'a', () => {
    f.home();
    const hidden = f.document.createElement('section');
    hidden.setAttribute('aria-hidden', 'true');
    hidden.append(retained); f.document.body.prepend(hidden);
  });
  await tick();
  const live = f.document.querySelectorAll('#trip-list-ready')[1];
  assert.equal(f.transitions[1].new.length, 2, 'hidden retained screens cannot steal shared element names');
  assert.equal(live.scrollTop, 360);
  assert(live.contains(f.document.activeElement), 'focus returns to the visible copy');
  f.transitions[1].finish(); await tick(); f.close();
}
console.log('Trip transitions:`);
const browser = 'scripts/issue-145-browser.cjs';
replace(browser, 'const record = { ready: false, ended: false, error: null };', "const record = { ready: false, ended: false, error: null, skips: [], sourceNames: [...document.querySelectorAll('[style]')].map(el => el.style.getPropertyValue('view-transition-name')).filter(Boolean) };");
replace(browser, 'const transition = original(update);', 'const transition = original(update);\n            const skip = transition.skipTransition.bind(transition);\n            transition.skipTransition = () => { record.skips.push(new Error().stack); skip(); };');
replace(browser, "await page.waitForFunction(() => window.tripTransitions.some((entry) => entry.ready), null, { timeout: 5000 });", `await page.waitForFunction(() => window.tripTransitions.some((entry) => entry.ready), null, { timeout: 5000 }).catch(async (error) => {
          console.log('Transition diagnostics', JSON.stringify(await page.evaluate(() => ({ transitions: window.tripTransitions, path: location.pathname, named: [...document.querySelectorAll('[style]')].map(el => el.style.getPropertyValue('view-transition-name')).filter(Boolean) }))));
          await page.screenshot({ path: output + '/' + variant.name + '-failure.png' });
          throw error;
        });`);
replace(browser, '      assert.deepEqual(errors, [],', `      if (variant.name === 'mobile') {
        await first.click();
        await page.waitForURL(/\\/trips\\/[^/]+\\/itinerary/);
        await page.waitForFunction(() => !document.documentElement.hasAttribute('data-trip-transition'));
        await page.getByRole('button', { name: '旅行メニュー', exact: true }).click();
        await page.getByRole('button', { name: '旅行を編集', exact: true }).click();
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><defs><linearGradient id="g"><stop stop-color="#496B80"/><stop offset="1" stop-color="#92ADB7"/></linearGradient></defs><path fill="url(#g)" d="M0 0h800v500H0z"/><path fill="#E6ECEF" d="M0 420L180 160 360 320 570 80 800 390v110H0z"/></svg>';
        await page.locator('input[type="file"]').setInputFiles({ name: 'cover.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
        await page.getByRole('button', { name: '画像を解除', exact: true }).waitFor({ state: 'visible' });
        await page.getByTestId('sheet-header').getByRole('button').last().click();
        await page.getByTestId('form-sheet').waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: '旅行一覧へ戻る', exact: true }).click();
        await page.waitForURL('http://127.0.0.1:4173/');
        await page.waitForFunction(() => !document.documentElement.hasAttribute('data-trip-transition'));
        await first.click();
        await page.waitForURL(/\\/trips\\/[^/]+\\/itinerary/);
        await page.getByTestId('trip-hero-photo').waitFor({ state: 'visible' });
        await page.waitForFunction(() => !document.documentElement.hasAttribute('data-trip-transition'));
        assert(await page.evaluate(() => window.tripTransitions.every(entry => entry.ready && !entry.error)), 'photo journeys capture both ends');
        await page.screenshot({ path: output + '/mobile-photo-journal.png' });
        const count = await page.evaluate(() => window.tripTransitions.length);
        await page.getByRole('tab', { name: 'メモ', exact: true }).click();
        await page.waitForURL(/\\/notes/);
        assert.equal(await page.evaluate(() => window.tripTransitions.length), count, 'tabs do not replay ticket journeys');
        console.log('mobile photo cover and ordinary tab navigation passed');
      }
      assert.deepEqual(errors, [],`);
