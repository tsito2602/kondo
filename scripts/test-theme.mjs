import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const { outputFiles } = await build({ stdin: { contents: "export * from './src/theme/preferences'; export * from './src/constants/design';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react-native'] });
const module = { exports: {} };
new Function('require', 'module', 'exports', outputFiles[0].text)(() => ({ Platform: { OS: 'web' } }), module, module.exports);
const { normalizeThemePreference, resolveTheme, lightPalette, darkPalette } = module.exports;

test('explicit themes override the system and system mode follows changes', () => {
  assert.equal(resolveTheme('dark', 'light'), 'dark');
  assert.equal(resolveTheme('light', 'dark'), 'light');
  assert.equal(resolveTheme('system', 'dark'), 'dark');
  assert.equal(resolveTheme('system', 'light'), 'light');
  assert.equal(resolveTheme('system', null), 'light');
  for (const value of [null, undefined, 'invalid', {}, 'system']) assert.equal(normalizeThemePreference(value), 'system');
  for (const value of ['dark', 'light']) assert.equal(normalizeThemePreference(value), value);
});
function luminance(hex) {
  const rgb = hex.match(/[a-f0-9]{2}/gi).map((value) => parseInt(value, 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function contrast(a, b) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); }
test('dark surfaces, text, controls and placeholders retain readable contrast', () => {
  assert.deepEqual(Object.keys(darkPalette).sort(), Object.keys(lightPalette).sort());
  for (const surface of ['canvas', 'paper', 'sky', 'mist', 'successSurface']) {
    for (const text of ['ink', 'slate', 'ocean']) assert.ok(contrast(darkPalette[text], darkPalette[surface]) >= 4.5, `${text} on ${surface}`);
  }
  assert.ok(contrast(darkPalette.onOcean, darkPalette.ocean) >= 4.5);
  assert.ok(contrast(darkPalette.placeholder, darkPalette.paper) >= 4.5);
});
