import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { renderTouchIcon } from './render-touch-icon.mjs';

// All outputs come from this one transparent, wordmark-free vector master.
const source = await readFile('assets/brand/symbol.svg', 'utf8');
// Preserve defs/masks as well as visible groups. The journey is cut through
// both tickets using alpha, rather than painted with an opaque foreground.
const body = source.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/)[1].replace(/<title>[\s\S]*?<\/title>/, '').trim();
// Keep the ticket artwork and icon surfaces identical in both themes.
const svg = (scale = 1, monochrome = false) => {
  // Do not recolour the black/white mask: doing so fills the cutouts back in.
  const shapes = monochrome ? body.replace(/#737373|#BCBCBC/g, '#FFFFFF') : body;
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
const darkSource = source;
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
  await webPng(`public/icons/kondo-icon-v5-${size}.png`, webLight, size);
  await webPng(`public/icon-${size}.png`, webLight, size);
  await webPng(`public/icon-dark-${size}.png`, webDark, size);
}
await webPng('public/icons/icon-maskable-512.png', svg(.72), 512);
await webPng('public/icons/kondo-icon-maskable-512.png', svg(.72), 512);
await webPng('public/icons/kondo-icon-v5-maskable-512.png', svg(.72), 512);
await webPng('public/icon-maskable.png', svg(.72), 512);
// The I fixture was verified on an iPhone in light AND dark appearance.
// Keep the canvas and journey cutouts transparent; never add a white plate.
await writeFile('public/icons/apple-touch-icon-transparent.png', await renderTouchIcon(source));
// Previous versioned URLs remain frozen for the diagnostic controls.
for (const file of ['public/icons/apple-touch-icon.png', 'public/apple-touch-icon.png', 'public/apple-touch-icon-v2.png', 'public/icons/kondo-apple-touch-icon.png', 'public/icons/kondo-apple-touch-icon-v5.png', 'public/apple-touch-icon-dark.png']) {
  await writeFile(file, await renderTouchIcon(source));
}
const adaptiveIcon = webLight;
await writeFile('public/icons/icon.svg', adaptiveIcon);
await writeFile('public/icons/kondo-icon.svg', adaptiveIcon);
await writeFile('public/icons/kondo-icon-v5.svg', adaptiveIcon);
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
console.log('Exported diagonal kondo tickets with transparent journey cutouts.');
