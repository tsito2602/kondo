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
console.log('Trip transitions:`);
const browser = 'scripts/issue-145-browser.cjs';
replace(browser, 'const record = { ready: false, ended: false, error: null };', "const record = { ready: false, ended: false, error: null, skips: [], sourceNames: [...document.querySelectorAll('[style]')].map(el => el.style.getPropertyValue('view-transition-name')).filter(Boolean) };");
replace(browser, 'const transition = original(update);', 'const transition = original(update);\n            const skip = transition.skipTransition.bind(transition);\n            transition.skipTransition = () => { record.skips.push(new Error().stack); skip(); };');
replace(browser, "await page.waitForFunction(() => window.tripTransitions.some((entry) => entry.ready), null, { timeout: 5000 });", `await page.waitForFunction(() => window.tripTransitions.some((entry) => entry.ready), null, { timeout: 5000 }).catch(async (error) => {
          console.log('Transition diagnostics', JSON.stringify(await page.evaluate(() => ({ transitions: window.tripTransitions, path: location.pathname, named: [...document.querySelectorAll('[style]')].map(el => el.style.getPropertyValue('view-transition-name')).filter(Boolean) }))));
          await page.screenshot({ path: output + '/' + variant.name + '-failure.png' });
          throw error;
        });`);
