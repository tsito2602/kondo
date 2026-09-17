# tabi Design System

> travel tickets behind quiet liquid glass

tabiは、旅程・予約票・持ち物をふたりで編集し、海外でもオフラインで使える旅行アプリである。視覚言語は「旅のチケット」「青いインク」「透明な旅行道具」。白と黒に近い静かな背景を土台に、低彩度のブルーグレーをアクセントとして使い、AppleのLiquid Glassを参照したGlass & Layeredな奥行きを重ねる。

## 1. Principles

1. **Ticket is structure** — 半券、ミシン目、切り欠き、券面番号、日時欄を情報構造として使う。
2. **Glass is material, not decoration** — 透明度だけのglassmorphismにしない。blur、屈折感、エッジ光、内側ハイライト、柔らかい影を組み合わせ、素材の厚みを表現する。
3. **Layer before effect** — 背景、コンテンツ、chrome、floating surfaceの順に階層を作る。すべてを同じ透明カードにしない。
4. **Quiet base, one accent hue** — 基本は白〜黒のニュートラル。通常UIのアクセントは低彩度のブルーグレー一系統に絞る。
5. **Depth with restraint** — 影は浮いているsurfaceだけに使う。本文カードへ一律に強い影を付けない。
6. **Offline confidence** — オフライン編集は即時反映し、端末保存済み・同期待ちを簡潔に示す。
7. **Native behavior** — iOSとAndroidの戻る、共有、モーダル、階層遷移を尊重する。

## 2. Color and material tokens

| Name | Value | Role |
| --- | --- | --- |
| Travel Ink | `#182A36` | 見出し、本文、バーコード |
| Ocean Slate | `#496B80` | 主要操作、リンク、アクティブ状態 |
| Ticket Paper | `#FAFCFD` | 高い可読性が必要な紙面 |
| Canvas Blue Gray | `#EEF2F4` | light背景 |
| Coastal Mist | `#E6ECEF` | 入力、補助面 |
| Ash Blue | `#C9D3D9` | 罫線、無効状態、ミシン目 |
| Smoke Blue | `#7E8C95` | メタ情報、補助文 |
| Slate Blue | `#465A67` | 二次本文、ナビラベル |
| Pale Blue | `#D7E2E8` | 選択状態、分類タグ、半券 |
| Muted Accent | `#6F8FA2` | 進捗、移動方向、小さな注目点 |
| Glass Thin | `rgba(250,252,253,.46)` | header / tab chrome |
| Glass Surface | `rgba(250,252,253,.62)` | sheet / elevated card |
| Glass Strong | `rgba(250,252,253,.78)` | menu / dialog / floating control |
| Glass Accent | `rgba(73,107,128,.84)` | glass上の強い主要操作 |
| Danger | `#B42318` | 削除、重大エラーのみ |

Dark modeでは同じ階層を`#10191F`〜`#23333F`の半透明面へ反転し、明るいエッジを弱く、下側の暗い屈折を強くする。

- 純黒は使わない。最も濃い通常色はTravel Inkとする。
- Ocean Slateを大きな面で使うのは主要操作かGlass Accentのみ。
- 通常UIにコーラル、黄、ミント、ベージュなど別色相のアクセントを加えない。
- 航空会社や施設の色は、ユーザーが保存した原本内でのみ許容する。

## 3. Typography

見出しはsystem sansを太く使い、実用画面では40–48pxを上限とする。日本語は不自然にuppercase化しない。

| Role | Mobile | Weight | Line height |
| --- | ---: | ---: | ---: |
| Screen title | 40–42px | 900 | 0.95–1.00 |
| Trip title | 32px | 900 | 1.00 |
| Card title | 16–20px | 700–900 | 1.15–1.30 |
| Body | 14–16px | 400–500 | 1.40–1.50 |
| Mono meta | 9–12px | 400–700 | 1.30–1.60 |

Monoは券面番号、時刻、予約番号、DAY番号、同期状態に使う。

## 4. Spacing and shape

8pxを基本単位にする。主な間隔は8、16、24、40、64、80、96px。

| Element | Radius |
| --- | ---: |
| Tag | 64px |
| Card / ticket | 24–32px |
| Button / input | 8–12px |
| Floating glass control | 20–48px |

- 画面左右: 20px mobile / 24–32px wide
- カードpadding: 20–24px
- コンテンツ最大幅: 800px（wide layoutは用途に応じて1280pxまで）
- 強いshadowはmenu / dialog / floating action / hover-liftだけに使う。
- gradientは装飾的な色面として使わず、Glassのスペキュラー表現と写真shadeに限定する。

## 5. Glass & Layered grammar

### Material levels

1. **Canvas** — ほぼ不透明な背景。情報の最背面。
2. **Content surface** — ticketや本文カード。可読性を優先し、透明度は低め。
3. **Chrome glass** — header、tab、sheet header。`blur 32–46px`程度、薄い半透明素材。
4. **Floating glass** — menu、dialog、FAB。Chromeより不透明度とshadowを上げ、明確に1段浮かせる。

### Optical recipe

Web/PWAでは、対応ブラウザで以下を組み合わせる。

- `backdrop-filter: blur(36–46px) saturate(160–185%) contrast(1.04–1.05)`
- 上辺に明るい1px edge、下辺に薄い青灰のedge
- `inset 0 1px`のspecular highlight
- 複数段の柔らかいshadowで接地面を作る
- 必要なsurfaceだけ、ごく薄いlinear-gradientでエッジの厚みを表現する

単に`rgba(..., .5)`とblurを置いただけのglassmorphismは禁止。Glassは背面コンテンツとの重なりで成立させる。

`prefers-reduced-transparency`ではblurを外し、Paper/Mistの不透明面・border・shadowで階層を維持する。高コントラスト設定ではedgeを強める。

## 6. Ticket grammar

角丸カードだけをチケットと呼ばない。最低4要素を備える。

- 明るい主券と色付きの半券
- 破線のミシン目
- ミシン目上下の半円切り欠き
- `TABI TRIP TICKET`などの発行者表示
- 券面番号または短い識別子
- バーコード状の装飾的な識別表現
- 出発／帰着、開始／終了など対になる欄
- 人数、座席、入口など用途固有のメタ情報

### Trip ticket

ホームの旅行概要。glass edgeを持つTicket Paper相当の主券とPale Blueの半券を標準とする。写真がある場合は写真そのものを透明化せず、外周のedgeとshadowでレンズ感を出す。旅行名、目的地、出発日、帰着日、人数、券面番号を載せる。航空券ではないため、架空の便名、ゲート、QRは載せない。

### Booking document

航空・鉄道・宿・施設・レストランの予約は、明るい主券とMistまたはPale Blueの半券で表現する。確認番号はコピー可能にし、スクリーンショット・画像・PDFの原本へ1タップで到達できるようにする。tabiが利用不能なQRコードを生成しない。

## 7. Components

### Primary button

Ocean SlateまたはGlass Accent背景、Ticket Paper文字、8–12px radius、16×24px padding、16px/700。画面内の最重要操作に使う。

### Secondary button

Glass StrongまたはTicket Paper背景、Ocean Slate文字。透明面ではedgeを必ず持たせ、背景に溶け込ませない。

### Trip top chrome

旅行を選択した後だけ表示する。header全体はChrome Glass、戻る・メニューは独立した小さなGlass Strong control。旅行名は左右の操作幅に影響されない位置を維持する。

上部タブは「しおり／行きたい場所／準備／予約／メモ」を横スクロール可能にし、選択項目はPale Blueまたは同等のselected materialと太字で示す。

### Standard card

本文カードはPaper寄りの高可読性surface。Glassを使う場合も透明度を上げすぎず、背面が文字のコントラストを損なわないようにする。

### Modal / sheet

背景overlayをわずかにblurし、その上にGlass Surfaceを置く。sheet headerは本文より1段強いChrome Glass。dialogはGlass Strong＋Floating shadow。

### Input

Glass InputまたはMist背景、8–12px radius、16px padding、最小48px。フォーカスは2px Ocean Slate。入力面を完全透明にしない。

### Floating action

Glass Strongの円形またはpill。強いedge、specular highlight、Floating shadowを持ち、アイコンはOcean Slate。押下時はscaleとshadowをわずかに下げる。

## 8. Screen rules

- **Login:** 静かなCanvas上にロゴ。主要ログイン操作のみ強いアクセント。
- **Home:** headerはChrome Glass。Trip ticketはcontent surfaceとして浮かせる。
- **Itinerary:** 日付・予定の可読性を優先。hero写真上のheaderではblur/refractionを最も活かす。
- **Packing:** 進捗はPale Blueを中心にし、Glassはタブや操作chromeへ使う。
- **Bookings:** 予約ごとのticket grammarを保ち、素材効果で情報構造を壊さない。
- **Places / Notes:** 詳細sheetとfloating actionをGlass階層の基準にする。
- **Empty state:** 短い見出し、1文、主要操作1つ。

## 9. Accessibility

- WCAG AA以上
- タップ領域44×44px以上
- 色だけで選択・完了・エラーを伝えない
- Dynamic Typeで重要情報を切らない
- 券面番号・予約番号に読み上げラベルを付ける
- 原本画像のQR・バーコードには説明ラベルを付ける
- `prefers-reduced-motion`と`prefers-reduced-transparency`を尊重する
- blur越しの背景で文字コントラストが不足する場合はsurface opacityを上げる

## 10. Do / Don't

### Do

- Glassの強度をsurfaceの階層に合わせる
- edge、specular、shadowをセットで使って素材の厚みを出す
- Travel Inkは文字、Ocean Slateは操作、Pale Blueは選択、Muted Accentは小さな強調に使う
- 写真上のchromeでbackdrop blurを活かす
- light / darkで同じ深度関係を維持する

### Don't

- すべてのカードを同じ半透明glassにする
- opacityとblurだけの単純なglassmorphismにする
- 強いshadowを本文カードへ一律に付ける
- 読みにくくなるほど背景を透過させる
- 架空のQR、搭乗券番号、企業ロゴを表示しない
- 旅行一覧と旅行内の機能を同じナビゲーション階層に並べない

## 11. Implementation tokens

```ts
export const palette = {
  ink: '#182A36', ocean: '#496B80', paper: '#FAFCFD', canvas: '#EEF2F4',
  mist: '#E6ECEF', ash: '#C9D3D9', smoke: '#7E8C95', slate: '#465A67',
  sky: '#D7E2E8', accent: '#6F8FA2', soft: '#E9EEF1', danger: '#B42318',
  glass: 'rgba(250,252,253,0.58)',
  glassStrong: 'rgba(250,252,253,0.76)',
  glassNative: 'rgba(250,252,253,0.88)',
  glassEdge: 'rgba(255,255,255,0.72)',
  glassAccent: 'rgba(73,107,128,0.86)',
} as const;
```

Webの光学効果は`src/glass.css`を正とし、React Native側は同じmaterial hierarchyをtheme token・border・shadowで近似する。この文書を新規画面とUIレビューの基準とする。例外は操作性、アクセシビリティ、OS制約のいずれかを理由として記録する。
