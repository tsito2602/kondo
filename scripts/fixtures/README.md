# iPhoneホーム画面アイコンの比較用画像

`konogoro-touch.png`は同じユーザーが所有するkonogoroから2026-09-13に取得した比較用画像。
取得元: https://konogoro.tsito-apps.workers.dev/icons/apple-touch-icon.png

再エンコードせず比較Aへ複製し、実際に配信されていた画像を対照にする。
通常のtabiアイコンとして使用せず、開発・stagingの比較ページだけに出力する。

`tabi-touch-white.png`は比較Bで切り替わらなかった白背景の原本。
通常のiPhone用アイコンを比較Cの透明背景に更新した後も、対照画像として保持する。

`tabi-touch-transparent.png`は2026-09-24に本番から取得した青い透過アイコン。
取得元: https://tabi.tsito-apps.workers.dev/icons/apple-touch-icon-transparent.png
以前ライト／ダーク切替が確認された絵柄を、再エンコードせず比較Aへ複製する。
比較Bは現在の透過版、比較Cは現在の白背景版。各ページの独立したIDで既存インストールの影響を避ける。
