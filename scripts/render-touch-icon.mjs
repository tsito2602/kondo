import sharp from 'sharp';

// Exact pipeline used for the blue icon whose light/dark background was
// verified on the user's iPhone. The fixture test checks byte-for-byte output.
export const renderTouchIcon = source => sharp(Buffer.from(source), { density: 384 })
  .resize(180, 180)
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();
