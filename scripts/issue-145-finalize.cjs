const fs = require('node:fs');
function replace(path, old, next) {
  const source = fs.readFileSync(path, 'utf8');
  if (source.split(old).length !== 2) throw new Error(`Expected one exact match in ${path}: ${old.slice(0, 80)}`);
  fs.writeFileSync(path, source.replace(old, next));
}
replace('src/utils/trip-transition.web.ts', "      if (op.decorate) decorate(op, direction === 'open' ? destination : ticket(tripId), direction === 'close');", "      if (op.decorate) {\n        // Keep this mounted page settled after snapshot cleanup; restoring the\n        // ordinary entrance animation would fade the journal a second time.\n        const page = destination.closest<HTMLElement>('.motion-page-content') ?? destination.querySelector<HTMLElement>('.motion-page-content');\n        page?.setAttribute('data-trip-journey-page', '');\n        decorate(op, direction === 'open' ? destination : ticket(tripId), direction === 'close');\n      }");
replace('src/trip-transitions.css', 'html[data-trip-transition] .motion-page-content {', 'html[data-trip-transition] .motion-page-content,\n.motion-page-content[data-trip-journey-page] {');
replace('scripts/issue-145-browser.cjs', "const first = page.getByTestId('trip-ticket').first();", "const first = page.locator('[data-testid=\"trip-ticket\"]:visible').first();");
replace('scripts/issue-145-browser.cjs', "page.getByRole('button', { name: '旅行を編集', exact: true })", "page.getByText('旅行を編集', { exact: true })");
replace('scripts/issue-145-browser.cjs', '      const overflow = await page.evaluate', "      if (variant.reducedMotion !== 'reduce') {\n        assert.equal(await page.getByTestId('route-transition').last().evaluate(el => getComputedStyle(el).animationName), 'none', 'the page entrance must not restart after shared snapshots finish');\n      }\n      const overflow = await page.evaluate");
replace('scripts/test-trip-transition.mjs', "console.log('Trip transitions:", `{
  const f = setup();
  f.controller.run('open', 'a', () => {
    f.detail(); f.document.querySelector('main').className = 'motion-page-content';
  });
  await tick();
  f.transitions[0].finish(); await tick();
  assert(f.document.querySelector('.motion-page-content').hasAttribute('data-trip-journey-page'), 'snapshot cleanup must not restart this page entrance');
  assert.equal(f.document.documentElement.hasAttribute('data-trip-transition'), false);
  f.close();
}
console.log('Trip transitions:`);
