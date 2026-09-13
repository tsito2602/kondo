# ネイティブで試す

プレビューでは「サンプルの旅行で試す」から、旅行の作成、しおり、予約、書類、準備の操作を確認できる。サンプルの変更はこの端末だけに保存され、Googleログイン・共有サーバーへの通信は行わない。サンプルを終了してもデータは残る。

## iPhone / Android — Expo Go

SDK 57に対応するExpo GoとNode.js 24を使用する。

```bash
git clone https://github.com/tsito2602/tabi.git
cd tabi
git switch feat/issue-82-native-polish
npm ci
npm run preview
```

PCと端末を同じWi-Fiにつなぎ、表示されたQRコードをiPhoneのカメラ、またはAndroidのExpo Goで読み取る。日付・時刻はOSの標準ピッカーで入力する。Expo GoではGoogleログインを無効にしている。

## Android — 単独で動くAPK

[Native previewの実行一覧](https://github.com/tsito2602/tabi/actions/workflows/native-preview.yml)から成功した実行を開き、Artifactsの`tabi-preview-android-apk`をダウンロードして展開する。PixelにAPKを移して開き、必要に応じて使用中のファイルアプリの「不明なアプリのインストール」を許可する。

このAPKはARM64端末向けで、JavaScriptを同梱するためPC・Metroへの接続は不要。アプリ名は「tabi Preview」、IDは`com.tsito2602.tabi.preview`。開発用キーで署名しており、ストア提出用ではない。成果物の保存期限は14日。期限後は同ワークフローを再実行する。

## iOS — Simulator / 実機ビルド

同じ実行の`tabi-preview-ios-simulator`を展開し、内側のZIPも展開する。MacでSimulatorを起動し、`.app`をドラッグするか、次でインストールする。

```bash
xcrun simctl install booted '/path/to/tabiPreview.app'
xcrun simctl launch booted com.tsito2602.tabi.preview
```

Simulator用`.app`はiPhoneにはインストールできない。iPhoneで独立したアプリとして試すには、Xcode 26.4以降のMacとAppleの署名設定が必要。

```bash
npm run preview:ios
```

USBでつないだiPhoneを選び、署名チームを設定する。TestFlightやAd Hoc配布を使う場合はApple Developer ProgramとEASのアカウント設定が必要。`eas.json`に内部配布用`preview`とSimulator用`simulator`プロファイルを用意している。

```bash
npx eas-cli login
npx eas-cli build:configure
npm run build:preview:ios
```

プレビューのサンプル操作は認証・クラウド共有の実機検証を代替しない。実ユーザーでのネイティブログインには、iOS/AndroidごとのOAuthクライアント・リダイレクトとAPI接続設定を別途確認する。

## 検証

```bash
npm run check
npm run check:native
```

`check`は型、Lint、旅程の接続判定・同期回帰テスト、Web生成を実行する。`check:native`はiOS/AndroidのJSバンドルを検証する。インストール可能なネイティブ成果物の生成結果はNative previewワークフローで確認する。

Native previewの`ios-ui`ジョブはiPhone 13 Simulatorでサンプルの起動、予約の閲覧・編集、キーボード表示中の保存、持ち物の完了、再起動後の保存状態をMaestroで確認する。スクリーンショットと実行結果は`tabi-preview-ios-ui`に保存する。ローカルで再現する場合は、プレビューアプリをインストールしたSimulatorで`maestro test .maestro/native-preview.yml`を実行する。このテストはサンプル用アプリのデータを初期化する。

参考: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)、[ローカル開発](https://docs.expo.dev/guides/local-app-development/)、[内部配布](https://docs.expo.dev/build/internal-distribution/)。
