# tabi の開発ルール

- GitHub Issueを起点に、原則1 Issue・1ブランチ・1 PR。最新の`main`から`<type>/issue-<番号>-<短い説明>`を作る。
- 変更依頼は修正・検証・PR作成/更新・staging反映まで進める。[tabi-staging](.agents/skills/tabi-staging/SKILL.md)は反映時に読む。
- `main`へ直接pushしない。main向けPRのマージと本番反映はユーザーの明示的な指示がある場合に行う。
- 明示的な依頼がなければサブエージェントを使用しない。
- ExpoのAPI・設定・互換性を調べるときは[SDK 57の該当資料](https://docs.expo.dev/versions/v57.0.0/)を参照する。
- コード・依存・ビルド設定の変更はPR前に`npm run check`。文書のみは差分と参照の整合性を確認する。CIの必須チェックは維持する。
- Google OAuthのClient Secret、Cloudflare API token、セッション秘密鍵をリポジトリへ保存しない。
- Google ID tokenはサーバーで署名・issuer・audience・有効期限を検証する。decodeしたpayloadだけで信用しない。
- stagingとproductionのD1・R2は完全に分離する。
