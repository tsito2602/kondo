import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Temporary device diagnosis. Never replace the app's installed icon or identity.
export async function buildIconCheck(root, enabled) {
  const output = path.join(root, '__icon-check');
  await rm(output, { recursive: true, force: true });
  if (!enabled) return;
  const variants = [
    { key: 'a', name: '比較A', label: '以前の青いアイコン・透過', image: await readFile('scripts/fixtures/tabi-touch-transparent.png') },
    { key: 'b', name: '比較B', label: '新しいチケット・透過', image: await readFile('public/icons/apple-touch-icon-transparent.png') },
    { key: 'c', name: '比較C', label: '新しいチケット・白背景', image: await readFile('public/icons/kondo-apple-touch-icon-v4.png') },
  ];
  const revision = createHash('sha256').update(Buffer.concat(variants.map(v => v.image))).digest('hex').slice(0, 10);
  const base = `/__icon-check/${revision}`;
  const style = '<style>:root{font:16px/1.7 system-ui;color:#171717;background:#f5f5f5}body{max-width:540px;margin:auto;padding:32px 20px}h1{font-size:24px}a{color:#171717}article{background:white;border-radius:16px;padding:20px;margin:16px 0}img{width:72px;height:72px;float:right;margin-left:16px;background:repeating-conic-gradient(#e1e7eb 0% 25%,#fff 0% 50%) 50%/16px 16px}h2{font-size:19px;margin:0}p{margin:12px 0}small{color:#707070}</style>';
  const document = (title, head, content) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title>${head}${style}</head><body>${content}</body></html>`;
  await mkdir(output, { recursive: true });
  const cards = variants.map(v => `<article><img src="${base}/${v.key}/icon.png" alt=""><h2>${v.name}：${v.label}</h2><p><a href="${base}/${v.key}/">追加用ページを開く</a></p></article>`).join('');
  await writeFile(path.join(output, 'index.html'), document('アイコンの比較', '', `<h1>ホーム画面アイコンの比較</h1><p>以前の青い画像（A）と、新しいチケットの透過版（B）・白背景版（C）を同じ条件で比較できます。</p>${cards}<p>普段のkondoを削除する必要はありません。それぞれ別の名前でホーム画面に追加されます。</p><small>比較番号 ${revision}</small>`));
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
    await writeFile(path.join(dir, 'index.html'), document(variant.name, head, `<h1>${variant.name}：${variant.label}</h1><article><img src="${scope}icon.png" alt="${variant.label}"><p>Safariの共有メニューから「ホーム画面に追加」してください。</p></article><p>ホーム画面のカスタマイズで、ライト／ダークを切り替えてアイコンの背景を確認します。</p><p><a href="/__icon-check/">比較一覧へ戻る</a></p><small>比較番号 ${revision}</small>`));
  }
  return { base, variants: variants.map(({ key, name }) => ({ key, name })) };
}
