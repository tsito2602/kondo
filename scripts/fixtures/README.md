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

2026-09-24の実機スクリーンショットでは、Aはライトで白背景・ダークで黒背景、Bは両方黒背景、Cは両方白背景。
AとBは180px、8-bit RGBA、同じ解像度メタデータで、完全透明画素のRGB値も同じ。PNG形式や透過の有無だけでは結果の差を説明できない。
絵柄に対するiOSの処理の違いは仮説であり、原因は未確定。
比較Dは白を#F5F5F5へ変更、比較Eは各色に微小な色差を追加し、純粋なグレースケールから外す。どちらもBと形・アルファを同一に保ち、通常のアプリアイコンにはまだ採用しない。

続く実機確認ではD・Eも改善せず。B・D・Eはいずれもライトで真っ黒、ダークで黒いグラデーションになる。微小な色変更では解決しなかった。

`tabi-touch-source.svg`はmainの`add0dc29d08eca23f8b96939dca36ba867d61418`にある`assets/brand/symbol.svg`の無変更コピー。
この原本を`render-touch-icon.mjs`で書き出すと、実機で成功したAのPNGにバイト単位で一致する。
SHA-256: `69316d0d43bd8b07f5f1a7dbed93cee9a2ac9a3c835ad291a1b2a28cc12c0bbd`。
比較Fは同じ処理・Aと同じ2色で現在のチケット形状を書き出したもの。GはFを中間グレーと淡いグレーへ変換したもの。
いずれも実機動作は未確認で、通常アイコンの白いチケットは変更しない。
