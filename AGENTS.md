# 開発ルール

- Expo SDK 57のコードを書く前に、必ず `https://docs.expo.dev/versions/v57.0.0/` の該当ページを確認する。
- 実装はGitHub Issueを起点にし、原則1 Issueにつき1ブランチ・1 PRとする。
- 作業ブランチは最新の`main`から作り、`<type>/issue-<番号>-<短い説明>`形式にする。
- `main`へ直接pushしない。ユーザーの明示的な指示があるまでPRをマージしない。
- PR作成・更新後は、PRを保持したまま`staging`へ統合し、stagingデプロイまで確認する。
- 変更後は`npm run check`を実行する。
- Google OAuthのClient Secret、Cloudflare API token、セッション秘密鍵をリポジトリへ保存しない。
- Google ID tokenはサーバーで署名、issuer、audience、有効期限を検証する。payloadをdecodeしただけで信用しない。
- stagingとproductionのD1・R2は完全に分離する。
- ユーザーから明示的に依頼された場合を除き、サブエージェントを使用しない。
