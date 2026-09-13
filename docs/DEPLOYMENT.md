# デプロイ構成

Cloudflareは共有バックエンドとWeb/PWA版を担当し、iOS・Androidアプリ本体はExpo/EASで別途ビルドする。

| 環境 | ブランチ | Worker | D1 | R2 |
| --- | --- | --- | --- | --- |
| staging | `staging` | `tabi-staging` | `tabi-staging` | `tabi-documents-staging` |
| production | `main` | `tabi` | `tabi` | `tabi-documents` |

## GitHub Actionsの設定

リポジトリのSettings → Secrets and variables → Actionsへ登録する。

| 種類 | 名前 | 用途 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | 両環境で共用するCloudflareアカウントID |
| Secret | `CLOUDFLARE_API_TOKEN` | stagingのデプロイ用トークン |
| Secret | `CLOUDFLARE_API_TOKEN_PRODUCTION` | productionのデプロイ用トークン |
| Variable | `GOOGLE_WEB_CLIENT_ID` | stagingのWeb OAuth Client ID |
| Variable | `GOOGLE_CLIENT_IDS` | stagingで検証を許可するClient IDのカンマ区切りリスト |
| Variable | `GOOGLE_WEB_CLIENT_ID_PRODUCTION` | productionのWeb OAuth Client ID |
| Variable | `GOOGLE_CLIENT_IDS_PRODUCTION` | productionで検証を許可するClient IDのカンマ区切りリスト |

Web/PWAのみ公開する段階では、productionの2つのGoogle変数に同じWeb Client IDを設定する。
`CLOUDFLARE_ACCOUNT_ID_PRODUCTION`は不要。本番ワークフローはstagingのOAuth Client IDを参照しない。
既存の`GOOGLE_IOS_CLIENT_ID`・`GOOGLE_ANDROID_CLIENT_ID`はstaging/ネイティブ用であり、本番Webビルドでは使用しない。

Cloudflareトークンには対象アカウントのWorkers Scripts・D1・Workers R2 StorageのEdit権限を付ける。
Account IDを共用してもD1とR2は環境ごとに別リソースとなる。トークン権限自体は対象アカウント単位。

## Google OAuth

本番のJavaScript生成元は`https://tabi.tsito-apps.workers.dev`、リダイレクトURIは`https://tabi.tsito-apps.workers.dev/oauth`。
使用するスコープは`openid`・`email`・`profile`。現在の実装にGoogle Client Secret、Gmail用token、セッション署名鍵の登録は不要。
R2はWorker bindingを使うためS3 Access Key/Secret Keyも不要。

## 本番公開

ユーザーの本番反映指示を受けて、確認済みstagingの内容をmain向けPRへまとめる。
`npm run check`とstagingのCI/デプロイ成功を確認してからPRをmainへマージする。
`main`へのpushで`Deploy production`が起動する。手動実行もmainに限定する。

本番ワークフローは設定を検証し、`npm run check`、本番D1/R2の解決・未作成時の作成、スキーマ適用、Worker配信を行う。
`GOOGLE_CLIENT_IDS`・`ALLOWED_ORIGINS`は生成したWrangler設定から反映し、API URLと公開Client IDはWebビルドへ埋め込む。
D1のIDはデプロイ時に取得するため、テンプレートへ実IDを書き込む必要はない。
`/v1/*`はWorkerを先に実行してAPIへ振り分ける。

配信後はホーム、未認証APIの401 JSON応答、Service Workerの配信を自動確認する。
Googleログイン、旅行の作成・招待・同期・添付ファイルの操作は別途確認する。
stagingの旅行・添付ファイル・セッションは本番へ自動移行しない。
