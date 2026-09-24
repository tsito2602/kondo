# kondo アイコン

`symbol.svg` が文字なしの正本。2枚の重なったチケット、旅の軌跡とピンを表す。

- 前面のチケット: White `#FFFFFF`
- 輪郭・軌跡・ピン: Black `#151515`
- 背面のチケット: Gray `#A4A4A4`
- 背景: 透過（白い面やグラデーションを描画しない）

`npm run icons:export` でSVG原本からPNG・SVGを再生成する。PNGの直接編集はしない。
ライト／ダークとも同じ絵柄・配色を使う。互換用の `*-dark` ファイルも通常版と同じ内容。
SVG・PNG・ICOとも背景を透過させる。

- `icon*.png`: 1024px、背景透過
- `adaptive-foreground.png`: Android用、セーフエリア内の透過絵柄
- `adaptive-monochrome.png`: Androidテーマアイコン用の単色透過絵柄
- `public/icon-*.png`: PWA用192/512pxとmaskable
- `public/apple-touch-icon*.png`: iOS Web用180px
- `public/favicon.svg`: テーマで配色を切り替えないブラウザアイコン

PWAのmanifestと`apple-touch-icon`は`kondo-`付きのURLを使う。旧URLの画像も互換用に残す。
インストール済みPWAのホームアイコンの更新時期やOS独自の色付けはOS側の仕様に依存する。
