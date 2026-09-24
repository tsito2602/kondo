import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// All outputs come from this one transparent, wordmark-free vector master.
const source = await readFile('assets/brand/symbol.svg', 'utf8');
const body = source.match(/<g[\s\S]*<\/g>/)[0];
const darkBody = body.replaceAll('#A4A4A4', '#777777').replaceAll('#202020', '#F8F8F8').replaceAll('#FFFFFF', '#151515');
const svg = (background, scale = 1, monochrome = false, dark = false) => {
  const shapes = monochrome ? body.replace(/#202020|#A4A4A4|#FFFFFF/g, '#FFFFFF') : dark ? darkBody : body;
  const backdrop = background ? `<defs><linearGradient id="surface" x2="0" y2="1"><stop stop-color="${dark ? '#222222' : '#FFFFFF'}"/><stop offset="1" stop-color="${dark ? '#101010' : '#F2F2F2'}"/></linearGradient></defs><rect width="1024" height="1024" fill="${background}"/><rect x="42" y="42" width="940" height="940" rx="154" fill="url(#surface)"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>kondo</title>${backdrop}<g transform="translate(${512 * (1 - scale)} ${512 * (1 - scale)}) scale(${scale})">${shapes}</g></svg>\n`;
};
await mkdir('public/icons', { recursive: true });
const png = async (file, input, size) => {
  let output = sharp(Buffer.from(input)).resize(size, size);
  // Store icons must have no alpha channel; in-app/adaptive artwork stays transparent.
  if (input.includes('<rect width="1024" height="1024" fill=')) output = output.removeAlpha();
  await writeFile(file, await output.png().toBuffer());
};
const light = svg('#FFFFFF');
const dark = svg('#000000', 1, false, true);
await writeFile('assets/brand/icon.svg', light);
await writeFile('assets/brand/icon-dark.svg', dark);
const darkSource = source.replace(body, darkBody);
await writeFile('assets/brand/symbol-dark.svg', darkSource);
await png('assets/brand/icon.png', light, 1024);
await png('assets/brand/icon-dark.png', dark, 1024);
await png('assets/brand/logo.png', source, 1024);
await png('assets/brand/logo-dark.png', darkSource, 1024);
// Keep the whole mark inside the Android / maskable safe circle.
await png('assets/brand/adaptive-foreground.png', svg(null, .72), 1024);
await png('assets/brand/adaptive-monochrome.png', svg(null, .72, true), 1024);
await png('assets/brand/favicon.png', light, 48);
// Match konogoro's web export pipeline, separately from native store assets:
// retain RGBA, render SVG at density 384, true-colour PNG, white/black backgrounds.
// An opaque background and an alpha channel are compatible: alpha stays 255.
const webPng = async (file, input, size) => sharp(Buffer.from(input), { density: 384 })
  .resize(size, size).png({ compressionLevel: 9, palette: false }).toFile(file);
const webLight = svg('#FFFFFF');
const webDark = dark;
for (const size of [192, 512]) {
  await webPng(`public/icons/icon-light-${size}.png`, webLight, size);
  await webPng(`public/icon-${size}.png`, webLight, size);
  await webPng(`public/icon-dark-${size}.png`, webDark, size);
}
await webPng('public/icons/icon-maskable-512.png', svg('#FFFFFF', .72), 512);
await webPng('public/icon-maskable.png', svg('#FFFFFF', .72), 512);
// Device comparison C switches Home Screen appearance. Use the exact same
// transparent source/export; alpha presence alone with white pixels did not work.
for (const file of ['public/icons/apple-touch-icon-transparent.png', 'public/icons/apple-touch-icon.png', 'public/apple-touch-icon.png', 'public/apple-touch-icon-v2.png']) {
  await webPng(file, source, 180);
}
await webPng('public/apple-touch-icon-dark.png', webDark, 180);
const adaptiveIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><style>.dark{display:none}@media(prefers-color-scheme:dark){.background{fill:#000000}.light{display:none}.dark{display:inline}}</style><rect class="background" width="1024" height="1024" fill="#FFFFFF"/><g class="light">${body}</g><g class="dark">${darkBody}</g></svg>\n`;
await writeFile('public/icons/icon.svg', adaptiveIcon);
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
console.log('Exported light, dark, transparent, adaptive and web kondo icons.');
