# Googleログイン

Web/PWAはGoogle Identity Servicesの公式ボタンを表示し、popupのcallbackで受け取ったID tokenを`POST /v1/auth/google`へ送ります。既存のWeb OAuth Client IDとJavaScript生成元を利用できます。Expo AuthSessionとネイティブ用のOAuth起動処理は使用しません。

Workerは従来と同じGoogle JWKSによる署名・issuer・audience・有効期限・verified emailを確認します。Googleの`sub`をユーザーIDとし、D1へSHA-256ハッシュを保存する256 bitランダムセッションを発行します。Google Client Secret・refresh tokenは不要です。

ブラウザのセッション保存キー`tabi.session`を維持し、旧sessionStorageからlocalStorageへも引き継ぎます。期限付きの`tabi.offline-user`はオフライン閲覧のみに使い、サーバーは毎回認証・旅行ごとの権限を検証します。ネットワーク障害ではログアウトせず、401/403では認証を解除します。

Google CloudのWeb OAuthクライアントには本番・stagingそれぞれのJavaScript生成元を登録します。GISのpopup方式では旧`/oauth`リダイレクトページを使用しません。既存のリダイレクトURIを削除する必要はありません。

招待URLの`invite`パラメーターはログイン中も保持され、参加ボタンで明示的に受諾します。招待は1回限り、7日間有効です。
