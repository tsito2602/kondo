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
