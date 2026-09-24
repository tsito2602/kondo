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
  // Freeze earlier controls as the production master evolves.
  const source = await readFile('scripts/fixtures/kondo-outlined-source.svg', 'utf8');
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
    { key: 'b', name: '比較B', label: '以前の縁取りチケット・透過', image: await readFile('scripts/fixtures/kondo-outlined-touch.png') },
    { key: 'c', name: '比較C', label: '新しいチケット・白背景', image: await readFile('public/icons/kondo-apple-touch-icon-v4.png') },
    { key: 'd', name: '比較D', label: '白を少し抑えたチケット・透過', image: await render(source.replaceAll('#FFFFFF', '#F5F5F5')) },
    { key: 'e', name: '比較E', label: 'ごくわずかに色味を加えたチケット・透過', image: await render(source.replaceAll('#FFFFFF', '#FDFEFF').replaceAll('#D4D4D4', '#D3D4D5').replaceAll('#171717', '#161718')) },
    { key: 'f', name: '比較F', label: 'Aの配色を使ったチケット・透過', image: await render(fromA) },
    { key: 'g', name: '比較G', label: 'Fをモノクロにしたチケット・透過', image: await render(neutral) },
    { key: 'a2', name: 'A再確認', label: '成功したAと画像データまで同一', image: legacy },
    { key: 'h', name: '比較H', label: '成功したAの色だけをモノクロに変更', image: await render(legacySource.replaceAll('#496B80', '#656565').replaceAll('#D7E2E8', '#E0E0E0')) },
    { key: 'i', name: '比較I', label: 'ライト／ダーク切替を実機確認済み', image: await readFile('scripts/fixtures/kondo-cutout-touch.png') },
    { key: 'j', name: '調整版J', label: '斜めにずらした2枚・グレーの配色を調整', image: await readFile('public/icons/kondo-apple-touch-icon-v5.png') },
    { key: 'k', name: '調整版K', label: '白背景で前面と模様が見えなくなった版', image: await readFile('public/icons/kondo-apple-touch-icon-v6.png') },
    { key: 'l', name: '調整版L', label: '白い前面と透過の模様にグレーの細い縁を追加', image: await readFile('public/icons/kondo-apple-touch-icon-v7.png') },
    { key: 'm', name: '調整版M', label: '白い前面・黒い縁取りと模様', image: await readFile('public/icons/kondo-apple-touch-icon-v8.png') },
    { key: 'n', name: '調整版N', label: '白いチケット・ピンの線幅を元に修正', image: await readFile('public/icons/kondo-apple-touch-icon-v9.png') },
    { key: 'o', name: '別案O', label: '模様を主役に、半券のミシン目が端で見切れる案', image: await readFile('public/icons/kondo-journey-perforation-v1.png') },
    { key: 'p', name: '調整版P', label: '模様のみ・黒背景でも見える白い細縁', image: await readFile('public/icons/kondo-apple-touch-icon-v10.png') },
    { key: 'q', name: 'kondo採用案', label: '上は実線・下は丸い点線', image: await readFile('public/icons/kondo-apple-touch-icon-v11.png') },
    { key: 'r', name: 'kondo採用版', label: '下の線を少し伸ばした丸端の破線', image: await readFile('public/icons/kondo-apple-touch-icon-v12.png') },
  ];
  const revision = createHash('sha256').update(Buffer.concat(variants.map(v => v.image))).digest('hex').slice(0, 10);
  const base = `/__icon-check/${revision}`;
  const style = '<style>:root{font:16px/1.7 system-ui;color:#171717;background:#f5f5f5}body{max-width:540px;margin:auto;padding:32px 20px}h1{font-size:24px}a{color:#171717}article{background:white;border-radius:16px;padding:20px;margin:16px 0}img{width:72px;height:72px;float:right;margin-left:16px;background:repeating-conic-gradient(#e1e7eb 0% 25%,#fff 0% 50%) 50%/16px 16px}h2{font-size:19px;margin:0}p{margin:12px 0}small{color:#707070}</style>';
  const document = (title, head, content) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title>${head}${style}</head><body>${content}</body></html>`;
  await mkdir(output, { recursive: true });
  const card = v => `<article><img src="${base}/${v.key}/icon.png" alt=""><h2>${v.name}：${v.label}</h2><p><a href="${base}/${v.key}/">追加用ページを開く</a></p></article>`;
  const current = variants.filter(v => v.key === 'r').map(card).join('');
  const baseline = variants.filter(v => v.key === 'i').map(card).join('');
  const previous = variants.filter(v => !['i', 'r'].includes(v.key)).map(card).join('');
  await writeFile(path.join(output, 'index.html'), document('アイコンの比較', '', `<h1>チケットの調整版</h1><p>採用案は上の実線を「これまでの旅」、下の丸端の破線を「こんど向かう旅」として描いています。丸い点をカーブに沿って少し伸ばし、線の流れが感じられる形にしました。ホーム画面では黒い模様と白い細縁を使い、アプリ内のダークモードでは模様を白に切り替えます。iPhoneでの背景の自動切替は、この版では実機未確認です。</p>${current}<details><summary>確認済みのIと比較する</summary>${baseline}</details><details><summary>これまでの結果</summary><p>A・A再確認・H・Iは白／黒に切り替わる。B・D・Eはライトで真っ黒・ダークで黒いグラデーション。F・Gもライトで黒。Cは両方白でした。Kはライトで白背景になりましたが、白い前面と模様が見えなくなりました。</p>${previous}</details><p>追加済みのアイコンを削除する必要はありません。</p><small>比較番号 ${revision}</small>`));
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
