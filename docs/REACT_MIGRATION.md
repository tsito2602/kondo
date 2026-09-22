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

画面は実DOM、CSSレスポンシブレイアウト、native dialog・日付/時刻入力を使用。ObsidianUIのソースを今後取り込める構成だが、今回の移行にObsidianUI由来のコンポーネントは含まない。
