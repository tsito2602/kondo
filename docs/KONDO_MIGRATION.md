# kondoへのURL・データ保存先の移行

状態（2026-09-24）: **staging・本番ともURL・D1・R2移行完了。**
WorkのCloudflare接続から操作した。Wranglerのローカル認証は使用していない。

## 本番の移行記録

- 本番URL: `https://kondo.tsito-apps.workers.dev`。PR #183を承認後にmainへ統合（`cc619d5327fc179d01bf4ec06724e3ee495b2eb5`）。
- D1: `kondo` / `44ff39a5-26d1-420b-b2d8-15134db96935`。R2: `kondo-documents`。旧保存先に合わせてENAM・jurisdiction制約なし、R2 Standardで作成。
- 新しいWorkerの本番用Google Client ID・originを設定し、最初は`kondo-url`で旧本番データへ接続して公開。その後、旧・新両Workerのworkers.devとPreview URLsを停止してコピーした。
- D1はCloudflare API内で直接コピー。本番SQLをWorkへダウンロードする方法は自動承認レビューで拒否されたため使用せず、ローカルの本番SQLファイルは残していない。スキーマ作成後、外部キーの親テーブルから順にバインド変数で値を移した。カバー画像もSQL本文へ埋め込まず移行。
- 全24テーブル・124行の全列と34件のスキーマ定義を移行元と比較して一致。外部キー違反0件。旅行1件、メンバー2件、予約8件、持ち物17件、行きたい場所13件、予約添付参照8件を含む。
- R2はPDF8件・2,847,612バイトを同一キーでコピー。SHA-256・サイズ・HTTP/custom metadataを照合済み。一時的な認証付きコピーWorkerは削除した。
- `kondo`と`tabi`の両Workerを新D1・R2へ接続し、既存の全バインディング名・種類と各originを維持。両URLを再開し、HTML 200・未ログインAPI 401 JSON・Service Worker 200・manifest 200を確認。新manifestのアプリ名は`kondo`。
- 本番のWorkers Builds triggerは`2f444a66-9d85-4f9c-b34a-606a886be9f4`、branchは`main`、deploy commandは`node scripts/workers-build.mjs production`、`DEPLOYMENT_PROFILE=kondo`、D1 UUIDは上記。キャッシュ有効、ドキュメントのみの変更はビルド対象外。
- 新保存先へ切り替えた後の本番ビルド`61ebf2e3-2d25-4aa9-8dab-e999519b53c1`は成功。全チェックとデプロイ後のHTTP検証を通過。
- 旧`tabi`のGitビルド連携（trigger `05872bc3-90e9-4882-bfc8-e85f296bad22`）は解除。旧URLは現在のコード・PWAを維持し、新保存先へ同期できる。旧PWAの未同期データを捨てず、新URLへの移行確認後にホーム画面へ追加し直す。
- 旧D1 `99151a02-20ca-44cc-9f3d-1807b4e58de7`と旧R2 `tabi-documents`は削除せず保持。現在の更新先は新保存先なので、旧側へ単純に戻さない。

## stagingの移行記録

- D1: `kondo-staging` / `cd2e6056-9e7a-488a-8b1a-8a3964661cd6`。
- R2: `kondo-documents-staging`。新しい保存先はいずれもAPAC、旧保存先はWNAM。jurisdictionの制約は同じ。
- `kondo-staging`と`tabi-staging`の両Workerを同じ新D1・R2へ接続。旧URLから届く未同期操作も新保存先へ入る。
- `kondo-staging`のWorkers Buildsは`DEPLOYMENT_PROFILE=kondo`、`D1_DATABASE_ID`は上記UUID。以後も新保存先を使用する。
- 旧`tabi-staging`のGitビルド連携（trigger `0fb9b752-0593-4334-9098-714ea8ba7d18`）は解除。旧Workerは現在の配信を維持し、新旧の二重ビルドと旧保存先への巻き戻りを防ぐ。旧Workerを通常のlegacy設定で再配信しない。
- コピー中は両Workerのworkers.devとPreview URLsを無効化し、APIの404を確認してから移行。作業後に元の有効状態へ戻した。カスタムドメインはなし。
- D1: 全25テーブル・68行の全列を移行元と照合して一致、外部キー違反0件。旅行1件、予約7件、カバー画像1件、予約添付参照1件を含む。
- 通常のSQL importはカバー画像の長いINSERTがD1の文長上限に当たりロールバックされた。全テーブル定義を先に作成し、画像以外を外部キー検査延期付きの一括クエリで取り込み、`trip_covers`は値をSQLに埋め込まずバインド変数で挿入した。大きな画像を含む本番移行でも同じ制約に注意する。
- R2: 1件・84,397バイトを同一キーでコピー。HTTP/custom metadata・サイズ・SHA-256の一致を確認。一時的な認証付きコピーWorkerは作業後に削除。
- Worker設定のPATCHで`inherit`を使うと、既存バインディングが保持されなかった。新Workerは全バインディングを明示して復元。旧Workerは直前の配信バージョンから同じコードを再アップロードし、`keep_bindings: ["secret_text"]`と`keep_assets: true`で既存秘密情報・静的ファイルを維持して切り替えた。既存バインディングの名前と種類を再確認済み。
- 両URLでHTML 200、未ログインAPI 401 JSON、Service Worker 200 JavaScriptを確認。利用者のGoogleログイン・編集・添付表示の最終確認は別途行う。
- 旧D1 `d9bf66f2-23d7-4b9f-a0ac-64a5fce78cbd`と旧R2は削除せず保持。切替後の更新は新保存先に入るため、旧保存先へ単純に戻してはいけない。

## 変更先

| 環境 | Worker / URL | D1 | R2 |
| --- | --- | --- | --- |
| staging | `kondo-staging` / `https://kondo-staging.tsito-apps.workers.dev` | `kondo-staging` | `kondo-documents-staging` |
| production | `kondo` / `https://kondo.tsito-apps.workers.dev` | `kondo` | `kondo-documents` |

旧Worker/D1は`tabi-staging`・`tabi`、旧R2は`tabi-documents-staging`・`tabi-documents`。
本番とstagingのデータを混ぜない。GitHubリポジトリは`tsito2602/kondo`へ改名済み（同じリポジトリIDであることを確認）。Git連携・remoteには新しい名前を使う。

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

## 初回ビルドのブランチを間違えた場合

`Refusing staging deployment from main; expected staging` は配信前の停止で、DBやWorkerへの変更は行われていない。
`kondo-staging`のSettings → BuildsでProduction branchを`staging`に保存し、その後の`staging`へのコード更新をpushして初回ビルドを起動する。
失敗した`main`の履歴をRetryしても、対象コミット・ブランチが`staging`へ変わるとは扱わない。
新しい履歴のBranchが`staging`であることを確認する。以後、その`staging`ビルドの失敗を設定修正後に再試行する場合は同じ履歴からRetryできる。

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
