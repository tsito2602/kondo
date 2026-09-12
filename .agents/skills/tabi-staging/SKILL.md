---
name: tabi-staging
description: tabiのPRをstagingへ反映し、Cloudflareのデプロイ結果を確認するときに使う。
---

# tabi のステージング反映

main向けPRを開いたまま、変更をstagingで確認できる状態にする。

- PRの変更を最新の`staging`へ統合する。他のPRの反映内容を保持し、依頼範囲内の競合解消・検証失敗の修正・再反映まで進める。
- `staging`へのpushで`Deploy staging`が起動する。設定や失敗原因を調べる場合だけ、staging側の`.github/workflows/deploy-staging.yml`と`docs/DEPLOYMENT.md`の該当箇所を読む。通常の反映で手動デプロイを重ねない。
- 完了の根拠は、対象commitの`CI`と`Deploy staging`の成功、および[staging](https://tabi-staging.tsito-apps.workers.dev)の応答。画面・動作を変えた場合は該当フローも確認する。文書だけの変更では画面全体を再検証しない。
- 失敗した場合はログで原因を絞って修正する。権限・認証・外部サービスの障害で進めない場合は、完了済みの作業と未確認事項を報告し、成功した扱いにしない。
- PRのURL・検証結果・staging反映状況を簡潔に伝える。本番反映は`AGENTS.md`の条件に従う。
