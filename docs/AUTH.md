# Google OAuth

## 方針

`tabi`はExpo AuthSessionでGoogle OpenID Connectを開始し、iOS・Android・Webでそれぞれ専用のOAuth Client IDを使う。

Googleから受け取ったID tokenはCloudflare Workerへ送り、次をすべて検証する。

1. Google JWKSによる署名
2. issuerが`https://accounts.google.com`または`accounts.google.com`
3. audienceが許可したClient ID
4. expiryが現在時刻より後
5. emailが検証済み

アプリ内の利用者IDには変更されにくいGoogleの`sub`を使い、メールアドレスは表示と招待照合にだけ使う。

検証成功後はWorkerが256 bitのランダムなアプリ用セッションを発行し、D1にはSHA-256 hashだけを保存する。iOS・AndroidではSecureStore、Webではブラウザを閉じるまでのsessionStorageへ保存する。Google Client Secretやrefresh tokenをアプリbundleへ含めない。

## 招待

招待URLを開いた利用者はGoogleログイン後にtokenを引き継ぐ。Workerは招待tokenを一度だけ消費し、認証済みのGoogle `sub`を旅行メンバーへ追加する。

認証と認可を分け、ログイン済みでも旅行メンバーでない利用者にはデータを返さない。

## Google Cloudで用意するもの

- iOS OAuth client: bundle ID `com.tsito2602.tabi`
- Android OAuth client: package `com.tsito2602.tabi` と署名証明書SHA-1
- Web OAuth client: Cloudflareの本番・staging URL

## Gmail予約取込

通常ログインのOpenID Connect権限とGmail権限は分離する。予約画面で利用者が明示的に開始した場合だけ、
`https://www.googleapis.com/auth/gmail.readonly`を要求する。

Google CloudでGmail APIを有効化し、OAuth同意画面へGmail read-only scopeを追加する。Web application型の
OAuth clientに、環境ごとのWorker callbackをAuthorized redirect URIとして登録する。

- staging: `https://tabi-staging.tsito-apps.workers.dev/v1/integrations/gmail/callback`
- production: 本番originの`/v1/integrations/gmail/callback`

Worker variables:

- `GOOGLE_GMAIL_CLIENT_ID`
- `GOOGLE_GMAIL_REDIRECT_URI`

Worker secrets:

- `GOOGLE_GMAIL_CLIENT_SECRET`
- `GMAIL_TOKEN_ENCRYPTION_KEY`（32 byteをbase64url化した値）

暗号鍵は`openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`などで生成し、リポジトリやGitHub Variablesには置かない。
refresh tokenはAES-GCMで暗号化してD1へ保存する。短命なaccess tokenとメール本文は永続化しない。
