# kondoへのURL・データ保存先の移行

状態: コードの切替準備のみ。Cloudflare上のWorker・D1・R2はまだ変更していない。
2026-09-24にWork環境のWranglerは未認証と確認。接続後のCloudflareプラグインは有効だが、この会話にはアカウント操作ツールが公開されていない。

## 変更先

| 環境 | Worker / URL | D1 | R2 |
| --- | --- | --- | --- |
| staging | `kondo-staging` / `https://kondo-staging.tsito-apps.workers.dev` | `kondo-staging` | `kondo-documents-staging` |
| production | `kondo` / `https://kondo.tsito-apps.workers.dev` | `kondo` | `kondo-documents` |

旧Worker/D1は`tabi-staging`・`tabi`、旧R2は`tabi-documents-staging`・`tabi-documents`。
本番とstagingのデータを混ぜない。GitHubリポジトリ`tsito2602/tabi`の改名はこの作業に含めない。

## コード側の切替

Workers Buildsの変数`DEPLOYMENT_PROFILE`で、生成するWrangler設定とAPI URL・許可originをまとめて切り替える。
`wrangler.staging.jsonc`と`wrangler.production.jsonc`は従来名の検証用テンプレートを維持し、配信する`.wrangler.generated.jsonc`へ選択した名前を反映する。

| 値 | Worker / URL | D1・R2 |
| --- | --- | --- |
| 未設定 / `legacy` | tabi | 現在のtabiデータ |
| `kondo-url` | kondo | 現在のtabiデータをそのまま参照 |
| `kondo` | kondo | コピー・検証済みのkondoデータ |

既存のDeploy commandは`node scripts/workers-build.mjs staging` / `production`のまま。
`D1_DATABASE_ID`は選択した保存先のUUIDを設定する。APIでUUIDと期待するDB名を照合してから配信し、古いUUIDのまま`kondo`へ切り替えた場合は止まる。
未設定時は従来の配信先を維持する。通常のデプロイ処理でDBやバケットの作成・コピー・削除は行わない。

## 実施順序

1. **Google OAuthへ新URLを追加する。** 環境ごとのWebクライアントの「承認済みのJavaScript生成元」に上表のURLを追加。旧URLは移行中も残す。現在の実装はGIS popup方式で、新しいリダイレクトURIやClient Secretは不要。
2. **まずstagingの新URLを作る。** `kondo-staging` WorkerのGit連携・ビルド変数・token・必要な実行時設定を従来に合わせ、`DEPLOYMENT_PROFILE=kondo-url`、D1 UUIDは旧stagingのものにする。新Worker作成時に旧Workerの設定やsecretsが自動コピーされるとは扱わない。`EXPO_PUBLIC_API_URL` / `ALLOWED_ORIGINS`の古い固定値があれば削除するか新URLへ合わせる。コードが生成した値と矛盾すると配信は停止する。
3. **新URLで確認する。** Googleログイン、既存旅行、招待、予約の添付表示、変更の同期、オフライン表示を確認。新URLからも旧D1・R2へ接続するため、この段階ではデータコピーは不要。旧URLをいきなりリダイレクトせず、未同期操作を送信できる状態を保つ。
4. **kondo名のD1・R2を作成する。** 公式の公開更新APIにはDB/バケットの名前変更入力がないため、ここでは新規リソースへコピーする方式を採る。D1のリージョン・jurisdiction、R2のlocation・jurisdiction・storage class・必要な設定は元と照合する。作成後のD1 UUIDを記録する。
5. **書き込み停止中にデータを移す。** 対象環境の全利用者が旧URLで未同期操作を送り終えたことを確認し、旧・新URL双方からの書き込みを一時停止する。D1をSQL exportし、新DBへimportする。R2は同じオブジェクトキーでコピーし、Content-Type等のHTTP metadataとcustom metadataも維持する。コピー元は削除しない。バックアップや資格情報をGitへ追加しない。
6. **内容を比較する。** D1は各テーブルの行数・ID・関連データ・予約書類の参照キー、R2はキー一覧・件数・サイズ・必要なメタデータを照合。複数ファイルの取得も確認する。移行中に更新が入った場合はその差分を解消するまで接続先を替えない。
7. **保存先を切り替える。** `DEPLOYMENT_PROFILE=kondo`と新しい`D1_DATABASE_ID`を設定して1回配信。旧URLをしばらく動かす場合、そのWorkerも同じ新しい保存先へ接続するよう別途調整する。旧・新DBへ書き込みが分岐した状態で再開しない。新URLのログイン・旅行編集・添付追加/取得を確認して再開する。
8. **本番はstaging確認後に実施する。** 同じ手順を本番データで行う。本番コードへの反映も必要で、stagingへの反映だけを本番移行完了としない。

## PWAと戻し方

- URLのoriginが変わるため、旧URLのIndexedDB・ログイン状態・Service Workerは新URLへ自動では移らない。サーバーへ同期済みの旅行は新URLでログインして取得できる。未同期のローカル変更を残したまま移行しない。
- ホーム画面のPWAは新URLから追加し直す。旧アイコンは同期と新URLの動作を確認するまで残す。
- `tabi.session`等の保存キーは変えない。名前を変えても別originのローカルデータは引き継げず、同一originの既存データまで見えなくなるため。
- 新ストレージへ書き込みを始めた後は、旧UUIDへ戻すだけでは最新データが失われる。必要なら書き込みを停止し、新側の差分を退避・反映してから戻す。
- 旧Worker・D1・R2は、全利用者の移行とデータ確認が終わるまで削除しない。

## 参照資料

- Workers URL: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- D1更新API: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/edit/
- D1 import/export: https://developers.cloudflare.com/d1/best-practices/import-export-data/
- R2更新API: https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/edit/
- R2作成・一括コピーの案内: https://developers.cloudflare.com/r2/buckets/create-buckets/
