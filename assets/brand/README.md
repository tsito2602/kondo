# kondo アイコン

`symbol.svg` が文字なしの正本。2枚の重なったチケット、白い旅の軌跡とピンを表す。

- 本体: Charcoal `#202020`
- 背面のチケット: Gray `#A4A4A4`
- 通常背景: White `#FFFFFF`
- ダーク背景: Black `#000000`

`npm run icons:export` でSVG原本からPNG・SVGを再生成する。PNGの直接編集はしない。ダーク版はチケットと軌跡を反転する。`logo*.png` と `symbol*.svg` は背景が透過。

- `icon*.png`: iOS用1024px、通常・ダーク背景あり
- `adaptive-foreground.png`: Android用、セーフエリア内の透過絵柄
- `adaptive-monochrome.png`: Androidテーマアイコン用の単色透過絵柄
- `public/icon-*.png`: PWA用192/512pxとmaskable
- `public/apple-touch-icon*.png`: iOS Web用180px
- `public/favicon.svg`: OSの明暗に対応するブラウザアイコン

iOSネイティブの明暗アイコンはExpoの`ios.icon.light/dark`で設定。Androidはadaptive/monochromeを設定。インストール済みPWAのホームアイコンの更新時期・明暗切替はOSに依存するため、通常PNGを既定にしダークPNGも用意する。アプリ全体のテーマ切替とは独立したアイコン設定。
