import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderTouchIcon as render } from './render-touch-icon.mjs';

// Temporary device diagnosis. Never replace the app's installed icon or identity.
export async function buildIconCheck(root, enabled) {
  const output = path.join(root, '__icon-check');
  await rm(output, { recursive: true, force: true });
  if (!enabled) return;
  // Device results: A switches white/black. B/D/E are solid black in Light,
  // a dark gradient in Dark. C stays white. Rebuild from the working A next.
  const source = await readFile('assets/brand/symbol.svg', 'utf8');
  const legacySource = await readFile('scripts/fixtures/tabi-touch-source.svg', 'utf8');
  const legacy = await readFile('scripts/fixtures/tabi-touch-transparent.png');
  const rebuilt = await render(legacySource);
  if (!rebuilt.equals(legacy)) throw new Error('The working A icon was not reproduced byte-for-byte');
  // F: current geometry, A's exact two-colour palette. G: same geometry in
  // medium/dark and light neutral greys. Neither is an approved app icon yet.
  const fromA = source.replaceAll('#FFFFFF', '#496B80')
    .replaceAll('#171717', '#D7E2E8').replaceAll('#D4D4D4', '#D7E2E8');
  const neutral = fromA.replaceAll('#496B80', '#656565').replaceAll('#D7E2E8', '#E0E0E0');
  const variants = [
    { key: 'a', name: '比較A', label: '以前の青いアイコン・元データから完全再生成', image: rebuilt },
    { key: 'b', name: '比較B', label: '新しいチケット・透過', image: await readFile('public/icons/apple-touch-icon-transparent.png') },
    { key: 'c', name: '比較C', label: '新しいチケット・白背景', image: await readFile('public/icons/kondo-apple-touch-icon-v4.png') },
    { key: 'd', name: '比較D', label: '白を少し抑えたチケット・透過', image: await render(source.replaceAll('#FFFFFF', '#F5F5F5')) },
    { key: 'e', name: '比較E', label: 'ごくわずかに色味を加えたチケット・透過', image: await render(source.replaceAll('#FFFFFF', '#FDFEFF').replaceAll('#D4D4D4', '#D3D4D5').replaceAll('#171717', '#161718')) },
    { key: 'f', name: '比較F', label: 'Aの配色を使ったチケット・透過', image: await render(fromA) },
    { key: 'g', name: '比較G', label: 'Fをモノクロにしたチケット・透過', image: await render(neutral) },
    { key: 'a2', name: 'A再確認', label: '成功したAと画像データまで同一', image: legacy },
  ];
  const revision = createHash('sha256').update(Buffer.concat(variants.map(v => v.image))).digest('hex').slice(0, 10);
  const base = `/__icon-check/${revision}`;
  const style = '<style>:root{font:16px/1.7 system-ui;color:#171717;background:#f5f5f5}body{max-width:540px;margin:auto;padding:32px 20px}h1{font-size:24px}a{color:#171717}article{background:white;border-radius:16px;padding:20px;margin:16px 0}img{width:72px;height:72px;float:right;margin-left:16px;background:repeating-conic-gradient(#e1e7eb 0% 25%,#fff 0% 50%) 50%/16px 16px}h2{font-size:19px;margin:0}p{margin:12px 0}small{color:#707070}</style>';
  const document = (title, head, content) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title>${head}${style}</head><body>${content}</body></html>`;
  await mkdir(output, { recursive: true });
  const card = v => `<article><img src="${base}/${v.key}/icon.png" alt=""><h2>${v.name}：${v.label}</h2><p><a href="${base}/${v.key}/">追加用ページを開く</a></p></article>`;
  const current = variants.filter(v => v.key === 'a2').map(card).join('');
  const previous = variants.filter(v => v.key !== 'a2').map(card).join('');
  await writeFile(path.join(output, 'index.html'), document('アイコンの比較', '', `<h1>成功したAの再確認</h1><p>F・Gもライトでは黒背景になりました。新しい絵柄の比較はいったん止め、成功したAと全く同じ画像を新しく追加した場合の表示を確認します。</p>${current}<p>ホーム画面のアイコン表示をライトにした状態で「A再確認」を追加してください。以前の「比較A」を残し、隣に並べると比較できます。</p><details><summary>これまでのA〜G</summary><p>Aはライトで白・ダークで黒。B・D・Eはライトで真っ黒・ダークで黒いグラデーション。F・Gもライトで黒。Cは両方白でした。</p>${previous}</details><p>通常のkondoや、追加済みのアイコンを削除する必要はありません。</p><small>比較番号 ${revision}</small>`));
  for (const variant of variants) {
    const scope = `${base}/${variant.key}/`;
    const dir = path.join(root, scope.slice(1));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'icon.png'), variant.image);
    await writeFile(path.join(dir, 'manifest.webmanifest'), JSON.stringify({
      id: scope, name: variant.name, short_name: variant.name,
      start_url: scope, scope, display: 'standalone',
      background_color: '#FFFFFF', theme_color: '#FFFFFF',
      icons: [{ src: `${scope}icon.png`, sizes: '180x180', type: 'image/png', purpose: 'any' }],
    }));
    const head = `<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${variant.name}"><link rel="apple-touch-icon" href="${scope}icon.png"><link rel="icon" type="image/png" href="${scope}icon.png"><link rel="manifest" href="${scope}manifest.webmanifest">`;
    const guidance = variant.key === 'a2'
      ? '<p>ホーム画面のアイコン表示をライトにしてから、Safariの共有メニューで「ホーム画面に追加」してください。名前は「A再確認」です。</p><p>以前の「比較A」は残し、隣に並べて背景を比較してください。この画像は以前のAから一切変更していません。</p>'
      : '<p>Safariの共有メニューから「ホーム画面に追加」してください。</p><p>ホーム画面のカスタマイズで、ライト／ダークを切り替えてアイコンの背景を確認します。</p>';
    await writeFile(path.join(dir, 'index.html'), document(variant.name, head, `<h1>${variant.name}：${variant.label}</h1><article><img src="${scope}icon.png" alt="${variant.label}">${guidance}</article><p><a href="/__icon-check/">比較一覧へ戻る</a></p><small>比較番号 ${revision}</small>`));
  }
  return { base, variants: variants.map(({ key, name }) => ({ key, name })) };
}
