# tabi Design System

> editorial travel tickets on warm paper

tabiは、ふたりで旅程・予約・持ち物を編集し、旅先でもオフラインで使える旅行アプリである。見た目の中心は「旅行雑誌の余白」と「手元に残る旅券」。ダッシュボードのように情報を詰めず、必要な情報を静かな紙面上に配置する。

## 1. Design principles

1. **Ticket first** — 旅行、移動、予約、入場券は、単なる角丸カードではなく券面として設計する。
2. **Quiet editorial** — 大きなセリフ見出し、十分な余白、細い罫線で読み物のように見せる。
3. **Offline confidence** — 保存済み、同期待ち、同期失敗を短く正確に伝え、通信状態に不安を残さない。
4. **Color is punctuation** — 基本は白と墨色。桃色は1画面に1つの強調面だけに使う。
5. **Platform-native behavior** — iOSとAndroidの戻る・モーダル・共有・ボトムナビの慣習を尊重する。
6. **No decorative copy** — 機能に関係しないキャッチコピーを置かない。画面名、状態、次の操作だけを書く。

## 2. Visual direction

ライトテーマを標準とする。温かい紙の背景に白い券面が置かれ、文字と細い罫線で情報を整理する。強い影、鮮やかな多色、グラデーション、過剰なイラストは使わない。

### Color tokens

| Name | Value | Role |
| --- | --- | --- |
| Ink | `#17191C` | 本文、見出し、主要ボタン |
| Canvas | `#FAF9F6` | アプリ背景。わずかに温かい紙色 |
| Ticket Paper | `#FFFFFF` | チケット、モーダル、浮遊面 |
| Mist | `#F2F2F3` | 入力欄、補助カード、未選択面 |
| Fog | `#FAFAFB` | セクションの弱い切り替え |
| Slate | `#777B86` | 補助文、同期状態、リンク |
| Ash | `#979799` | ラベル、分類、券面メタデータ |
| Smoke | `#A3A6AF` | プレースホルダー、無効状態 |
| Blush | `#FBE1D1` | 選択状態、半券、重要な強調面。1画面1面まで |
| Sienna | `#5D2A1A` | Blush上の文字・線に限定 |
| Hairline | `#ECECEC` | 罫線、入力境界、ミシン目 |
| Danger | `#A13D32` | 削除と重大エラーのみ |

緑、青、紫などの追加色を機能分類に使わない。航空会社や施設のブランド色は、原本画像内にある場合だけ許容する。

## 3. Typography

### Display serif

旅行名と画面の主要見出しにだけ使用する。候補はSignifier、Source Serif 4、Georgia、`ui-serif`。すべてweight 400とし、太字にしない。

| Role | Mobile | Wide | Line height | Tracking |
| --- | ---: | ---: | ---: | ---: |
| Screen title | 34px | 44px | 1.18 | -0.66px |
| Trip title | 30px | 38px | 1.20 | -0.45px |
| Section title | 26px | 32px | 1.22 | -0.30px |

### UI sans

操作、本文、日時、ラベルにはSohne、Inter、`system-ui`を使う。400〜500の細かな差で階層を作り、600以上を常用しない。

| Role | Size | Line height | Weight |
| --- | ---: | ---: | ---: |
| Caption / label | 12–14px | 1.4 | 400–500 |
| Body | 16–17px | 1.45 | 400 |
| Body large | 20px | 1.35 | 450–500 |
| UI heading | 22–26px | 1.25 | 450–500 |

券面番号、時刻、予約番号は等幅数字が使える場合はtabular numeralsを使う。

## 4. Spacing and shape

4pxを基本単位とする。

| Token | Value |
| --- | ---: |
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-7` | 28px |
| `space-8` | 32px |
| `space-10` | 40px |
| `space-section` | 64–80px |

| Element | Radius |
| --- | ---: |
| Standard card | 24px |
| Elevated artifact | 20px |
| Small card / input | 16px |
| Image | 12px |
| Button / filter | 9999px |

コンテンツの最大幅はモバイルで画面幅、タブレット・Webで800px。長文ドキュメントだけ1200pxまで許容する。

## 5. Ticket grammar

tabiの固有表現。次の要素のうち最低4つを備えて初めて「チケット」と呼ぶ。

- 主券と半券の明確な分割
- 分割位置の破線またはミシン目
- ミシン目上下の半円切り欠き
- 発行者ラベル（`TABI JOURNEY`など）
- 券面番号または短い識別子
- バーコード状の識別表現
- 出発／帰着、開始／終了など対になるフィールド
- 人数、席、ゲートなど用途固有のメタデータ

### Trip ticket

ホームの旅行概要。主券は白、半券だけBlush。旅行名をセリフで置き、目的地、出発日、帰着日、参加人数、券面番号を表示する。航空券と誤認させる便名・ゲート・QRは表示しない。

### Transport ticket

航空券・鉄道券・バス券を同じ構造で扱う。会社名、区間、日時、予約番号、座席を表示する。航空会社ロゴは権利と利用条件が確認できる場合だけ使い、通常は会社名を文字で示す。

### Admission ticket

施設名、利用日、人数、入口情報を優先する。QRやバーコードは、ユーザーが保存した原本画像またはPDFを表示するときだけ再掲する。tabiが架空コードを生成しない。

### Booking document

ホテル、レストラン、ツアーは予約票として扱う。確認番号はコピー可能にし、原本のスクリーンショット・画像・PDFは端末とR2の認可された経路で保存する。

## 6. Components

### Filled pill button

Ink背景、白文字、9999px radius、左右20px、最小44px高、影なし。主要操作に使用する。対になる副操作がある場合はGhost pillを同じ行に置く。

### Ghost pill button

透明背景、1px Ink border、Ink文字。Filled pillと同じ高さ・半径にする。

### Neutral card

Mist背景、24px radius、影なし。持ち物グループや補助情報に使う。白いカードを何重にも入れ子にしない。

### Accent card

Blush背景、Sienna文字、24px radius、影なし。1画面に1枚まで。同期エラーなどネガティブ状態には使わない。

### Floating artifact

Ticket Paper背景、20px radius、Hairline border、10%以下の影。モーダル、原本プレビュー、日程編集パネルなど、本当に前面に浮く要素だけに使う。

### Input

Ticket PaperまたはMist背景、Hairline border、16px radius、16px padding、最小44px高。フォーカスは1px InkまたはSiennaで示し、派手なグローを使わない。

### Bottom navigation

主要4項目は「旅・日程・持ち物・予約」。モバイルとPWAでは画面下部に固定し、コンテンツに必要な下余白を確保する。Webの広い画面でも初期段階では同じ情報設計を維持する。ヘッダーへ移動しない。

## 7. Screen patterns

### Home

- 上部: `tabi`、同期状態、旅行追加
- 中央: 選択中のTrip ticket
- 下部: 旅程編集と招待の操作
- 旅行が複数ある場合だけ旅行切り替えを表示

### Itinerary

- 画面タイトルと予定追加
- 日付単位の紙面。DAY番号は大きな色面ではなく、Ashのラベルとして扱う
- 時刻は左列、内容は右列。罫線はHairline
- 同期待ちは画面を塞がないインライン状態

### Packing

- カテゴリはNeutral card
- 完了状態は色ではなくチェック、打ち消し、残数で伝える
- オフライン操作は即時反映

### Bookings

- 種別ごとのTicket grammarを使う
- 原本の有無を明示
- 予約番号、日時、場所を最短操作で確認・コピーできる

### Empty state

短い見出し、1文の説明、1つの主要操作だけ。装飾イラストやキャッチコピーは置かない。

## 8. Motion and feedback

- 画面遷移はOS標準を優先
- 押下はopacityまたはscaleを120–180ms
- 追加・削除は200–240ms
- 同期完了を毎回トーストしない。状態表示だけ更新
- Reduce Motion設定を尊重
- オフラインでも入力成功として即時表示し、「端末に保存済み」で状態を説明

## 9. Accessibility

- 本文と背景はWCAG AA以上
- タップ領域は最低44×44px
- 色だけで選択・同期・エラーを伝えない
- Dynamic Typeで重要情報を切らない
- 券面番号や予約番号に読み上げラベルを付ける
- QR・バーコード原本には内容を説明する代替テキストを付ける

## 10. Do / Don't

### Do

- セリフ見出しはweight 400で使う
- ボタンはpill、カードは24pxを基本にする
- 桃色は希少な強調として使う
- 情報の意味に沿ったチケット部品を使う
- 余白を増やす前に不要な文章を削る
- iOSとAndroidで同じ情報を、各OSらしい操作で提供する

### Don't

- 緑・青・紫をカテゴリごとに割り当てない
- 角丸の色付き長方形だけをチケットと呼ばない
- 架空のQR、搭乗券番号、ロゴを表示しない
- 標準カードに影を付けない
- セリフ見出しをboldにしない
- 同期や保存をユーザーの手動操作に依存させない
- 画面下部ナビをコンテンツの上に無配慮に重ねない

## 11. Implementation tokens

```ts
export const colors = {
  ink: '#17191C',
  canvas: '#FAF9F6',
  paper: '#FFFFFF',
  mist: '#F2F2F3',
  fog: '#FAFAFB',
  slate: '#777B86',
  ash: '#979799',
  smoke: '#A3A6AF',
  blush: '#FBE1D1',
  sienna: '#5D2A1A',
  hairline: '#ECECEC',
  danger: '#A13D32',
} as const;

export const radius = {
  card: 24,
  artifact: 20,
  input: 16,
  image: 12,
  pill: 9999,
} as const;
```

この文書を新規画面とUIレビューの基準とする。例外が必要な場合は、見た目の好みではなく操作性、アクセシビリティ、OS制約のいずれかを理由として記録する。
