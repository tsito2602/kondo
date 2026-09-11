# デプロイ構成

Cloudflareは共有バックエンドとWeb版を担当し、iOS・Androidアプリ本体はExpo/EASでビルドする。

| 環境 | ブランチ | Worker | D1 | R2 |
| --- | --- | --- | --- | --- |
| staging | `staging` | `tabi-staging` | `tabi-staging` | `tabi-documents-staging` |
| production | `main` | `tabi` | `tabi` | `tabi-documents` |

GitHub Actions secretsには`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`を登録する。Google OAuthの公開Client IDはGitHub Variables、秘密情報はCloudflare Workers secretsへ登録する。

本番は`main`へのマージ時だけデプロイする。
