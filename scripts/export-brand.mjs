import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { renderTouchIcon } from './render-touch-icon.mjs';

// All outputs come from this one transparent, wordmark-free vector master.
const source = await readFile('assets/brand/symbol.svg', 'utf8');
// Keep all visible groups from the transparent master. Journey details are opaque black.
const body = source.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/)[1].replace(/<title>[\s\S]*?<\/title>/, '').trim();
// White edging keeps the same journey mark visible on light and dark surfaces.
const svg = (scale = 1, monochrome = false) => {
  // The monochrome platform asset uses the combined silhouette.
  const shapes = monochrome ? body.replace(/#B0B0B0|#000000/g, '#FFFFFF') : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>kondo</title><g transform="translate(${512 * (1 - scale)} ${512 * (1 - scale)}) scale(${scale})">${shapes}</g></svg>\n`;
};
await mkdir('public/icons', { recursive: true });
const png = async (file, input, size) => {
  const output = sharp(Buffer.from(input)).resize(size, size);
  await writeFile(file, await output.png().toBuffer());
};
const light = svg();
const dark = light;
await writeFile('assets/brand/icon.svg', light);
await writeFile('assets/brand/icon-dark.svg', dark);
// In-app dark logo is white ink with transparent negative space.
// Home-screen icons keep black ink and white edging in both appearances.
const darkSource = source.replace(/<g data-appearance="edge"[^>]*>[\s\S]*?<\/g>/, '').replaceAll('#000000', '#FFFFFF').replace(/^[ \t]+$/gm, '');
await writeFile('assets/brand/symbol-dark.svg', darkSource);
await png('assets/brand/icon.png', light, 1024);
await png('assets/brand/icon-dark.png', dark, 1024);
await png('assets/brand/logo.png', source, 1024);
await png('assets/brand/logo-dark.png', darkSource, 1024);
// Keep the whole mark inside the Android / maskable safe circle.
await png('assets/brand/adaptive-foreground.png', svg(.72), 1024);
await png('assets/brand/adaptive-monochrome.png', svg(.72, true), 1024);
await png('assets/brand/favicon.png', light, 48);
// Match konogoro's web export pipeline, separately from native store assets:
// Preserve transparent backgrounds and true-colour RGBA; render SVG at density 384.
const webPng = async (file, input, size) => sharp(Buffer.from(input), { density: 384 })
  .resize(size, size).png({ compressionLevel: 9, palette: false }).toFile(file);
const webLight = svg();
const webDark = dark;
for (const size of [192, 512]) {
  await webPng(`public/icons/icon-light-${size}.png`, webLight, size);
  await webPng(`public/icons/kondo-icon-${size}.png`, webLight, size);
  await webPng(`public/icons/kondo-icon-v11-${size}.png`, webLight, size);
  await webPng(`public/icon-${size}.png`, webLight, size);
  await webPng(`public/icon-dark-${size}.png`, webDark, size);
}
await webPng('public/icons/icon-maskable-512.png', svg(.72), 512);
await webPng('public/icons/kondo-icon-maskable-512.png', svg(.72), 512);
await webPng('public/icons/kondo-icon-v11-maskable-512.png', svg(.72), 512);
await webPng('public/icon-maskable.png', svg(.72), 512);
// Preserve canvas transparency; black details and their white edging are opaque.
// Device-approved I remains frozen separately; this version changes its structure.
await writeFile('public/icons/apple-touch-icon-transparent.png', await renderTouchIcon(source));
// Previous versioned URLs remain frozen for the diagnostic controls.
for (const file of ['public/icons/apple-touch-icon.png', 'public/apple-touch-icon.png', 'public/apple-touch-icon-v2.png', 'public/icons/kondo-apple-touch-icon.png', 'public/icons/kondo-apple-touch-icon-v11.png', 'public/apple-touch-icon-dark.png']) {
  await writeFile(file, await renderTouchIcon(source));
}
const adaptiveIcon = webLight;
await writeFile('public/icons/icon.svg', adaptiveIcon);
await writeFile('public/icons/kondo-icon.svg', adaptiveIcon);
await writeFile('public/icons/kondo-icon-v11.svg', adaptiveIcon);
await writeFile('public/favicon.svg', adaptiveIcon);
const faviconImages = [];
for (const size of [16, 32]) {
  const file = `public/icons/favicon-${size}x${size}.png`;
  await webPng(file, webLight, size);
  faviconImages.push(await readFile(file));
}
// Same PNG-backed, 32-bit ICO directory used by konogoro.
const ico = Buffer.alloc(6 + faviconImages.length * 16);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(faviconImages.length, 4);
let offset = ico.length;
for (const [index, image] of faviconImages.entries()) {
  const entry = 6 + index * 16;
  ico.writeUInt8(index === 0 ? 16 : 32, entry); ico.writeUInt8(index === 0 ? 16 : 32, entry + 1);
  ico.writeUInt16LE(1, entry + 4); ico.writeUInt16LE(32, entry + 6);
  ico.writeUInt32LE(image.length, entry + 8); ico.writeUInt32LE(offset, entry + 12);
  offset += image.length;
}
await writeFile('public/icons/favicon.ico', Buffer.concat([ico, ...faviconImages]));
await writeFile('public/logo.svg', source);
await writeFile('public/logo-dark.svg', darkSource);
console.log('Exported adopted dotted journey icon and white in-app dark logo.');

// Alternate concept stays separate from the app's selected icon.
const proposal = await readFile('assets/brand/proposals/journey-perforation.svg', 'utf8');
await writeFile('public/icons/kondo-journey-perforation-v1.png', await renderTouchIcon(proposal));
await png('assets/brand/proposals/journey-perforation.png', proposal, 1024);
const inner = input => input.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/)[1].replace(/<title>[\s\S]*?<\/title>/, '');
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="404" viewBox="0 0 720 404">
  <rect width="720" height="404" fill="#E7E8EA"/>
  <defs><clipPath id="plate"><rect width="300" height="300" rx="66"/></clipPath></defs>
  ${[await readFile('assets/brand/proposals/tickets-pin-corrected.svg', 'utf8'), proposal].map((input, i) => `<g transform="translate(${40 + i * 340} 28)"><g clip-path="url(#plate)"><rect width="300" height="300" fill="#FFFFFF"/><g transform="scale(${300 / 1024})">${inner(input)}</g></g></g>`).join('')}
  <g fill="#171717" font-family="sans-serif" font-size="24" text-anchor="middle"><text x="190" y="376">N</text><text x="530" y="376">O</text></g>
</svg>`;
await sharp(Buffer.from(preview)).png().toFile('assets/brand/proposals/comparison-n-o.png');

// Background comparison is a local rendering, not an iOS screenshot.
const appearancePreview = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="404" viewBox="0 0 720 404">
<rect width="720" height="404" fill="#E7E8EA"/>
${['#FFFFFF', '#111111'].map((background, i) => `<g transform="translate(${40 + i * 340} 28)"><rect width="300" height="300" rx="66" fill="${background}"/><g transform="scale(${300 / 1024})">${inner(source)}</g></g>`).join('')}
<g fill="#171717" font-family="sans-serif" font-size="22" text-anchor="middle"><text x="190" y="376">Light</text><text x="530" y="376">Dark</text></g>
</svg>`;
await sharp(Buffer.from(appearancePreview)).png().toFile('assets/brand/proposals/journey-light-dark.png');

const appPreview = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="404" viewBox="0 0 720 404">
<rect width="720" height="404" fill="#E7E8EA"/>
${[source, darkSource].map((input, i) => `<g transform="translate(${40 + i * 340} 28)"><rect width="300" height="300" rx="66" fill="${i ? '#111111' : '#FFFFFF'}"/><g transform="scale(${300 / 1024})">${inner(input)}</g></g>`).join('')}
<g fill="#171717" font-family="sans-serif" font-size="22" text-anchor="middle"><text x="190" y="376">App / Light</text><text x="530" y="376">App / Dark</text></g>
</svg>`;
await sharp(Buffer.from(appPreview)).png().toFile('assets/brand/proposals/adopted-app-themes.png');
