# tabi

旅行のしおり・予約・行きたい場所・準備・メモを共同編集するPWA。iPhone・Android・PCで使えます。

## 構成

- React / React Router / TypeScript / Vite / Tailwind CSS
- Hono API on Cloudflare Workers
- 既存Cloudflare D1（旅行・セッション）/ R2（予約書類）
- アカウント別IndexedDB、未送信操作キュー、Service Worker
- Google Identity ServicesのGoogleログイン

## 開発

ChatGPT Workのクラウド作業環境で実行します。

```bash
npm ci
npm run web
```

APIも試す場合は別プロセスでWranglerを起動し、Viteの`/v1`プロキシ（localhost:8787）を使います。対象はローカルのD1/R2です。

```bash
npx wrangler d1 execute DB --local --config wrangler.dev.jsonc --file worker/schema.sql
npx wrangler dev --config wrangler.dev.jsonc
```

Googleログインには`.env.local`の`VITE_GOOGLE_CLIENT_ID`と`.dev.vars`の`GOOGLE_CLIENT_IDS`に同じWeb Client IDを設定し、Google側のJavaScript生成元へ開発用URLを登録します。サンプルモードではGoogle設定不要です。

```bash
npm run check      # 型、API、同期、Reactフォーム連携、PWA、配信設定、ビルド
npm run build:web  # distの生成のみ
```

配信は既存のWorkers Buildsを利用します。[配信](docs/DEPLOYMENT.md)、[PWA](docs/PWA.md)、[認証](docs/AUTH.md)、[移行](docs/REACT_MIGRATION.md)を参照してください。
