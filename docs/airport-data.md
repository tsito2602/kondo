# 空港候補データ

- 世界のOurAirportsデータからIATAコードが英字3文字の全レコードを収録する。空港の規模・国・定期便の有無で除外しない。都市全体を表すコード（TYOなど）は空港ではないため追加しない。
- `src/data/airports-world.json`に取得日、出典URL、元ファイルのSHA-256、件数を保存。アプリに同梱し、検索中の通信やAPIキーを不要にする。
- 英語・原語の空港名、都市名、キーワード、IATAコードで検索。既存の日本語21空港の名前と別名も維持。空港名の全世界日本語翻訳は含まない。
- 空港コードの完全一致を最優先し、同条件では定期便のある空港を先に表示。国名を添えて同名空港を区別する。
- タイムゾーンはmwgg/AirportsのIATAコードと緯度・経度が一致するレコードのみを使用（各座標差0.05度未満）。照合できない空港は未設定のままにし、飛行時間を推測しない。既存の21空港の設定を維持する。
- OurAirportsはコミュニティデータ。IATAの公式マスターの完全性・即時性を保証するものではない。更新時にはデータの差分を確認する。

## 更新

```sh
python scripts/update-airports.py
```

ローカルの取得済みスナップショットを使う場合:

```sh
python scripts/update-airports.py --airports /path/airports.csv --timezones /path/airports.json
```

通常ビルドでは外部データを取得しない。生成後に`npm run test:connections`、`npm run typecheck`、`npm run build:web`を実施する。

## 出典とライセンス

- OurAirports: https://ourairports.com/data/ — Public Domain
- データ定義: https://ourairports.com/help/data-dictionary.html
- mwgg/Airports: https://github.com/mwgg/Airports — MIT

### mwgg/Airports license

The MIT License (MIT)

Copyright (c) 2014 mwgg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
