# Hono / Reactへの移行

## 互換性

- `/v1`のURL・JSON・認証・権限・D1 schema・R2 object keyを維持。Honoはルーティングとmiddlewareを担当し、既存ハンドラーを使用する。
- React RouterのURLは既存の`/trips/:tripId/{itinerary,places,packing,bookings,notes,members}`、`/settings`、`/?invite=...`を維持。
- IndexedDB `tabi-offline`、`values` store、`tabi.travel-cache.v1.<userId>`、予約書類とサンプルの保存先を維持。
- 未送信キューは旧版と同じmethod/path/bodyを再送する。旧版と新版のAPI互換性を残し、DB移行は不要。
- Service WorkerのURL、manifest ID、更新待機メッセージを維持。新しいシェルは旧版の設定画面から更新できる。未同期編集を送信するまで更新を抑止する。
- Expo/React Nativeの依存・画面・ネイティブプレビューを削除。共有のTypeScriptデータ処理は継続使用。

## 配信

既存のWorkers Builds公開変数`EXPO_PUBLIC_API_URL`、`EXPO_PUBLIC_ENABLE_DEMO`、`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`をViteで読み替えるため、移行時の変数名変更は不要。Vite開発では`VITE_*`を使用できる。D1/R2を新設・リネームしない。

stagingでGoogleログイン、既存のPWAからの更新、iPhone/Androidのキーボード・safe area、オフライン書類の表示を確認してから本番へ進める。リポジトリ内の設定だけでCloudflareのGit連携や実機動作を確認済みと扱わない。

## 検証

`npm run check`には従来のAPI、フライト乗り継ぎ、オフライン同期、Service Workerテストに加え、React画面→実Hono→SQLiteの統合テストを含む。旧キーに保存したセッション・未送信予定が復元・同期され、各フォームのpayloadがAPIへ受理されることを確認する。

画面は実DOM、CSSレスポンシブレイアウト、native dialog・日付/時刻入力を使用。ObsidianUIの公式registryからButton / Card / Input / Textarea / Tabs / Badgeを取り込み、Tabiの配色とタッチサイズに調整。出典とMITライセンスは `THIRD_PARTY_NOTICES.md` に記載。

## 画面の再構成

- 旅行一覧は旅行と作成・参加操作を中心にし、キャッチコピーを削除。旅行・予約チケットはスマホでも本文と右側の半券が横に並ぶ。
- 主要5画面へのナビゲーションはスマホでは画面下、PCではヘッダー下。上部ヘッダー・日付ナビは不透明でブラーなし。
- しおりは日付ごとの時系列カード、場所は訪問状態で絞り込めるカード、準備はキーボード操作可能なTabsと担当者フィルター、メモは検索とピン留め。
- 追加操作は各ページの見出し横。しおりではスクロール中も使えるフローティングボタン。詳細・編集・設定は共通の余白・入力部品・フォーカス表示。
- ブラウザのモバイル幅確認は実機のsafe area・OSキーボードの検証を代替しない。

### iPhoneの上端表示

ホーム画面起動のiOS WebKitだけに24pxの無地領域を確保し、OS側で上端に重なる効果からヘッダー操作を離す。通常ページ・stickyヘッダー・日付ナビ・全画面dialogに同じ`--app-edge-clearance`を適用し、dialogは高さも縮めて下端を維持する。Safariタブ・Android・PCには追加余白を適用しない。OSのブラーを無効にするAPIではなく回避策であり、効果と必要な余白はiPhone実機で未確認。
