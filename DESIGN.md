# tabi Design System

> brutalist travel showroom on warm gray

tabiは、旅程・予約票・持ち物をふたりで編集し、海外でもオフラインで使える旅行アプリである。視覚言語は「ブルータリストな旅行編集誌」と「物理的な旅券」。暖色グレーの台紙に、白・黒の平らな券面を大胆な文字組みで置く。

## 1. Principles

1. **Ticket is structure** — 半券、ミシン目、切り欠き、券面番号、日時欄を情報構造として使う。
2. **Typography leads** — 装飾ではなく、大きさ・太さ・密度の差で画面に個性を出す。
3. **Flat and physical** — 影とグラデーションを使わず、面の色と大きな角丸で紙や券の重なりを表す。
4. **Accent is scarce** — ミントはタグと選択、黄色は点や細線だけに限定する。
5. **Offline confidence** — オフライン編集は即時反映し、端末保存済み・同期待ちを簡潔に示す。
6. **No filler copy** — 機能に関係しないキャッチコピーや説明を置かない。
7. **Native behavior** — iOSとAndroidの戻る、共有、モーダル、ボトムナビを尊重する。

## 2. Color tokens

| Name | Value | Role |
| --- | --- | --- |
| Carbon | `#000000` | 見出し、本文、主要操作、反転面 |
| Paper | `#FFFFFF` | カード、チケット、反転文字 |
| Warm Canvas | `#E5E5E5` | 全画面の背景 |
| Mist | `#F3F3F3` | 入力、ナビ、補助パネル |
| Ash | `#C6C6C6` | 罫線、無効状態、ミシン目 |
| Smoke | `#979797` | メタ情報、補助文、未選択アイコン |
| Slate | `#444444` | 二次本文、ナビラベル |
| Graphite | `#2F2F2F` | 黒より弱い反転面 |
| Mint | `#D1FFCA` | タグ、選択状態、チケット半券 |
| Voltage | `#FFF100` | 状態点、進捗端、極小の注意喚起 |
| Danger | `#B42318` | 削除、重大エラーのみ |

ミントと黄色を大きな背景にしない。航空会社や施設の色は、ユーザーが保存した原本内でのみ許容する。

## 3. Typography

### Display

SuisseIntlCond、Anton、Bebas Neue、Barlow Condensed Boldを候補とし、未導入時は幅の狭いシステムsansを使う。weight 700、line-height 0.90–0.98、tracking `-0.03em`。英字は原則uppercase。日本語は大文字化せず、太字・詰めた行間・強いサイズ差で同じ圧を作る。

| Role | Mobile | Wide | Line height |
| --- | ---: | ---: | ---: |
| Screen title | 40px | 48px | 0.95 |
| Trip title | 32px | 40px | 0.95 |
| Section title | 28px | 40px | 1.00–1.10 |
| Marketing display | 64px | 80–130px | 0.90 |

アプリ内で130pxを常用しない。旅行中の実用画面では40–48pxを上限とする。

### UI sans

SuisseIntl、Inter、Söhne、system-ui。本文16px/400、操作16px/500、補助14px/450。

### Mono

SuisseIntlMono、JetBrains Mono、IBM Plex Mono、ui-monospace。12px/400。券面番号、時刻、予約番号、DAY番号、同期状態に使う。

## 4. Spacing and shape

8pxを基本単位にする。主な間隔は8、16、24、40、64、80、96px。

| Element | Radius |
| --- | ---: |
| Tag | 64px |
| Card | 24–32px |
| Large feature card | 64px |
| Button / input | 4–8px |
| Bottom nav pill | 48px |

- 画面左右: 20px mobile / 24px wide
- カードpadding: 24px
- 要素間: 16–24px
- コンテンツ最大幅: 800px。紹介ページのみ1200px
- 影: 常に0
- グラデーション: 使用禁止

## 5. Ticket grammar

角丸カードだけをチケットと呼ばない。最低4要素を備える。

- 主券と半券
- 破線のミシン目
- ミシン目上下の半円切り欠き
- `TABI JOURNEY`などの発行者表示
- 券面番号または短い識別子
- バーコード状の識別表現
- 出発／帰着、開始／終了など対になる欄
- 人数、座席、入口など用途固有のメタ情報

### Trip ticket

ホームの旅行概要。Carbonの主券とMintの半券を標準とする。旅行名、目的地、出発日、帰着日、人数、券面番号を載せる。航空券ではないため、架空の便名、ゲート、QRは載せない。

### Transport ticket

航空・鉄道・バス。会社名、区間、日時、予約番号、座席を優先する。会社ロゴは利用条件を確認できる場合だけ使用する。

### Admission ticket

施設名、利用日、人数、入口情報を優先。QRやバーコードは、保存した原本画像・PDFを表示するときだけ再掲する。tabiが利用不能なコードを生成しない。

### Booking document

宿、レストラン、ツアー。確認番号はコピー可能にし、スクリーンショット・画像・PDFの原本へ1タップで到達できるようにする。

## 6. Components

### Filled dark button

Carbon背景、Paper文字、8px radius、16×24px padding、16px/500、影なし。画面内の最重要操作に使う。

### Ghost border button

透明背景、1.5px Slate border、4–8px radius。副操作に使う。

### Text action

背景と枠なし。Carbon、16px/500。Webではhover時だけunderline。

### Nav pill

Paper背景、48px radius、影なし。主要4項目「旅・日程・持ち物・予約」を画面下部に固定する。選択項目はMintの小さなpillで示す。

### Standard card

Paper背景、24–32px radius、24px padding、枠と影なし。Warm Canvasとの面差だけで分離する。

### Inverted card

Carbon背景、Paper文字、32px radius、影なし。1画面の主役となる面に限る。

### Mint tag

Mint背景、Carbon文字、64px radius、8×16px程度、Mono 12px。分類・現在地・選択状態に使う。

### Voltage mark

Voltageの点、短い線、進捗の終端。小面積に限定し、ボタン全面には使わない。

### Input

Paper背景、8px radius、16px padding、最小48px、枠なし。フォーカスは2px Carbon。派手なグローを使わない。

## 7. Screen rules

### Login

Warm Canvas上に大きな`TABI`。機能説明は1文のみ。GoogleログインはCarbonの矩形ボタン。装飾イラストは置かない。

### Home

同期状態、旅行追加、旅行切替、Trip ticket、旅程編集・招待だけを置く。Trip ticketを最も大きな反転面にする。

### Itinerary

日付ごとに白い32pxカード。DAY番号はMint tag。時刻はMonoの左列、予定は右列。罫線はAsh。

### Packing

進捗をCarbonの反転カードに置き、Voltageを進捗端に使う。チェック済みはMintと記号の両方で示す。

### Bookings

予約ごとに白いチケットを使う。種別をMint tag、券面番号をMono、右側を半券として分離する。原本未保存時に架空QRを表示しない。

### Empty state

短い見出し、1文、主要操作1つ。画像、キャッチコピー、複数ボタンを置かない。

## 8. Motion and feedback

- 画面遷移とモーダルはOS標準
- 押下はopacityまたはscale、120–180ms
- 追加・削除は200–240ms
- 同期完了トーストを連発しない
- オフライン入力は即時反映し「端末に保存済み」と示す
- Reduce Motionを尊重する

## 9. Accessibility

- WCAG AA以上
- タップ領域44×44px以上
- 色だけで選択・完了・エラーを伝えない
- Dynamic Typeで重要情報を切らない
- 券面番号・予約番号に読み上げラベルを付ける
- 原本画像のQR・バーコードには説明ラベルを付ける

## 10. Do / Don't

### Do

- Warm Canvasを全画面背景にする
- 白／黒の面差と文字サイズで階層を作る
- 見出しを太く、短く、詰めて組む
- Mintをタグと選択に、Voltageを極小の状態表現に使う
- カード24–32px、操作4–8pxの半径差を守る
- チケット部品を情報の意味と対応させる

### Don't

- カードやボタンに影を付けない
- グラデーションを使わない
- 純白をページ背景にしない
- ミントや黄色を大面積に使わない
- 日本語を不自然な英語やuppercaseへ置き換えない
- 架空のQR、搭乗券番号、企業ロゴを表示しない
- ボトムナビをコンテンツに重ねない

## 11. Implementation tokens

```ts
export const colors = {
  carbon: '#000000', paper: '#FFFFFF', canvas: '#E5E5E5', mist: '#F3F3F3',
  ash: '#C6C6C6', smoke: '#979797', slate: '#444444', graphite: '#2F2F2F',
  mint: '#D1FFCA', voltage: '#FFF100', danger: '#B42318',
} as const;

export const radius = {
  button: 8, card: 32, tag: 64, nav: 48,
} as const;
```

この文書を新規画面とUIレビューの基準とする。例外は操作性、アクセシビリティ、OS制約のいずれかを理由として記録する。
