# tabi

夫婦で旅行の予定、持ち物、予約情報をまとめて管理するPWA。iPhone・Pixelのホーム画面から使えます。

## 現在の機能

- 画像付き旅行一覧と旅行の編集・削除
- 日ごとの旅程とオフライン保存
- 行きたい場所・営業時間・地図リンク・予約状況・訪問ステータス
- 追加・完了操作ができる持ち物リスト
- フライト、宿泊、レンタカー、飲食店の予約一覧

## 開発

```bash
npm install
npm run web
```

PWAの開発・更新・保存仕様は[PWA](docs/PWA.md)を参照。

旧ネイティブプレビューをGoogle設定なしで試す場合は`npm run preview`を実行し、QRコードをExpo Goで読み取る。「サンプルの旅行で試す」から主要操作を確認できる。

APK・iPhone・Simulatorでの起動手順は[ネイティブプレビュー](docs/NATIVE_PREVIEW.md)を参照。

## 技術構成

- Expo SDK 57
- React Native
- Expo Router
- TypeScript
