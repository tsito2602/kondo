# tabi Design System

> travel tickets in quiet blue-gray

tabiは、旅程・予約票・持ち物をふたりで編集し、海外でもオフラインで使える旅行アプリである。視覚言語は「旅のチケット」「青いインク」「静かな紙面」。青みを含む無彩色の台紙に、明るい券面と濃淡の異なるブルーグレーだけを置く。

## 1. Principles

1. **Ticket is structure** — 半券、ミシン目、切り欠き、券面番号、日時欄を情報構造として使う。
2. **Airy, not heavy** — 濃色は文字と細い線に限定し、大きな黒・濃紺の面を作らない。
3. **One quiet hue** — 通常UIは低彩度のブルーグレー一系統に絞り、色相ではなく濃淡で階層を作る。
4. **Flat and physical** — 影とグラデーションを使わず、紙色、罫線、切り取り線で物理感を出す。
5. **Offline confidence** — オフライン編集は即時反映し、端末保存済み・同期待ちを簡潔に示す。
6. **Native behavior** — iOSとAndroidの戻る、共有、モーダル、ボトムナビを尊重する。

## 2. Color tokens

| Name | Value | Role |
| --- | --- | --- |
| Travel Ink | `#182A36` | 見出し、本文、バーコード。青みのある墨色 |
| Ocean Slate | `#496B80` | 主要操作、時刻、リンク、アクティブな線 |
| Ticket Paper | `#FAFCFD` | カード、チケット、入力面。青みを帯びた白 |
| Canvas Blue Gray | `#EEF2F4` | 全画面の背景。静かな青灰の台紙 |
| Coastal Mist | `#E6ECEF` | 入力、未選択pill、補助パネル |
| Ash Blue | `#C9D3D9` | 罫線、無効状態、ミシン目 |
| Smoke Blue | `#7E8C95` | メタ情報、補助文、未選択アイコン |
| Slate Blue | `#465A67` | 二次本文、ナビラベル |
| Pale Blue | `#D7E2E8` | 選択状態、分類タグ、チケット半券 |
| Muted Accent | `#6F8FA2` | 進捗、移動方向、極小の注目点 |
| Soft Blue Gray | `#E9EEF1` | 補助的な面の差 |
| Danger | `#B42318` | 削除、重大エラーのみ |

- 純黒は使わない。最も濃い色はTravel Inkとする。
- Ocean Slateを大きな面で使うのは主要ボタンのみ。カード全面を濃色にしない。
- Pale Blueは小〜中面積、Muted Accentは点・線・進捗など小面積に限定する。
- 通常UIにコーラル、黄、ミント、ベージュなど別色相のアクセントを加えない。
- 航空会社や施設の色は、ユーザーが保存した原本内でのみ許容する。

## 3. Typography

見出しは幅の狭いsystem sansを太く使い、実用画面では40–48pxを上限とする。日本語は不自然にuppercase化しない。

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
| Card | 24–32px |
| Ticket | 28px |
| Button / input | 8px |
| Bottom nav pill | 48px |

- 画面左右: 20px mobile / 24px wide
- カードpadding: 20–24px
- コンテンツ最大幅: 800px
- 影: 常に0
- グラデーション: 使用禁止

## 5. Ticket grammar

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

ホームの旅行概要。Ticket Paperの主券とPale Blueの半券を標準とする。Travel Inkは文字とバーコードに、Oceanは罫線に、Coralは出発点と矢印に使う。旅行名、目的地、出発日、帰着日、人数、券面番号を載せる。航空券ではないため、架空の便名、ゲート、QRは載せない。

### Booking document

航空・鉄道・宿・施設・レストランの予約は、白い主券とMistまたはPale Blueの半券で表現する。確認番号はコピー可能にし、スクリーンショット・画像・PDFの原本へ1タップで到達できるようにする。tabiが利用不能なQRコードを生成しない。

## 6. Components

### Primary button

Ocean Slate背景、Ticket Paper文字、8px radius、16×24px padding、16px/700、影なし。画面内の最重要操作に使う。

### Secondary button

Ticket Paper背景、Ocean Slateの文字または1px枠、8px radius。黒い反転面を副操作に使わない。

### Nav pill

Ticket Paper背景、48px radius、影なし。主要4項目「旅・日程・持ち物・予約」を画面下部に固定する。選択項目はPale Blueの小さなpillとOcean Slateのアイコンで示す。

### Standard card

Ticket Paper背景、24–32px radius、枠と影なし。Canvas Blue Grayとの面差だけで分離する。

### Progress card

Pale Blue背景、Travel Ink文字。進捗バーはTicket PaperのtrackとMuted Accentのfillを使う。濃色の反転カードは使わない。

### Input

Ticket Paper背景、8px radius、16px padding、最小48px、枠なし。フォーカスは2px Ocean Slate。

## 7. Screen rules

- **Login:** Canvas Blue Gray上に大きなTravel Inkの`TABI`。GoogleログインはOcean Slateのボタン。
- **Home:** 同期状態、旅行追加、旅行切替、Trip ticket、旅程編集・招待だけを置く。Trip ticketを最大の明るい紙面にする。
- **Itinerary:** 日付ごとに白い32pxカード。DAY番号はSky、時刻はOcean Slate。
- **Packing:** 進捗をPale Blueカードに置き、Muted Accentを進捗に使う。チェック済みはPale Blueと記号の両方で示す。
- **Bookings:** 予約ごとに白いチケットを使い、右側を明るい半券として分離する。
- **Empty state:** 短い見出し、1文、主要操作1つ。

## 8. Accessibility

- WCAG AA以上
- タップ領域44×44px以上
- 色だけで選択・完了・エラーを伝えない
- Dynamic Typeで重要情報を切らない
- 券面番号・予約番号に読み上げラベルを付ける
- 原本画像のQR・バーコードには説明ラベルを付ける

## 9. Do / Don't

### Do

- Canvas Blue Grayを全画面背景にする
- Travel Inkは文字、Ocean Slateは操作、Pale Blueは選択、Muted Accentは小さな強調に使う
- チケットの紙面、半券、ミシン目、ノッチを意味のある情報構造にする
- カード24–32px、操作8pxの半径差を守る

### Don't

- 純黒や濃紺をカード全面に使わない
- カードやボタンに影を付けない
- グラデーションを使わない
- 架空のQR、搭乗券番号、企業ロゴを表示しない
- ボトムナビをコンテンツに重ねない

## 10. Implementation tokens

```ts
export const palette = {
  ink: '#182A36', ocean: '#496B80', paper: '#FAFCFD', canvas: '#EEF2F4',
  mist: '#E6ECEF', ash: '#C9D3D9', smoke: '#7E8C95', slate: '#465A67',
  sky: '#D7E2E8', accent: '#6F8FA2', soft: '#E9EEF1', danger: '#B42318',
} as const;
```

この文書を新規画面とUIレビュー、staging確認の基準とする。例外は操作性、アクセシビリティ、OS制約のいずれかを理由として記録する。
