# tabi

夫婦で旅行の予定、持ち物、予約情報をまとめて管理するiOS・Androidアプリ。

## 現在の機能

- 次の旅行と当日の予定を確認するホーム
- 日ごとの旅程
- 追加・完了操作ができる持ち物リスト
- フライト、宿泊、レンタカー、飲食店の予約一覧

## 開発

```bash
npm install
npx expo start
```

Google設定なしで試す場合は`npm run preview`を実行し、QRコードをExpo Goで読み取る。「サンプルの旅行で試す」から主要操作を確認できる。

APK・iPhone・Simulatorでの起動手順は[ネイティブプレビュー](docs/NATIVE_PREVIEW.md)を参照。

## 技術構成

- Expo SDK 57
- React Native
- Expo Router
- TypeScript
