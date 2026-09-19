# tabi 開発ルール
- ChatGPT Workのクラウドで作業し、ローカルPCの設定や外部設定の適用を仮定しない。
- 最新mainから原則1 Issue・1ブランチ・1 PRで進め、通常は検証・push・PR作成まで行う。mainへ直接pushしない。
- staging反映・mainマージ・本番反映は各々の明示指示時のみ。未指示なら確認を求めず「staging未反映」と報告する。
- stagingは対象変更をまとめて1回のnon-force push。配信はWorkers Buildsを使い、必要時だけ`docs/DEPLOYMENT.md`を参照する。
- 関係するファイルだけ読み、検証を重複させない。サブエージェント・手動Actions・タグ・Releaseは明示依頼時のみ。
- コード・依存・ビルド設定の変更は最終差分で`npm run check`。文書だけなら差分・参照確認のみで、Buildは起動しない。
- バージョンは1リリース1回、修正PATCH／互換機能追加MINOR／非互換MAJORの最大区分。配信挙動が変わらなければ据え置く。
- `package.json`・`package-lock.json`・`app.json`の`expo.version`を同期し、秘密情報をコミットせず、stagingとproductionのD1/R2を分離する。
- 完了報告は変更・検証・PR・反映状況・未完了事項を簡潔に伝え、未実施の検証や配信を成功扱いしない。
