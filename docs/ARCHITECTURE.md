# UI Architecture

`tabi` の UI は Root からなる単一の階層構造として扱う。

```text
Root
└─ App / Mediator state machine
   └─ RootView
      ├─ Auth / global presentation
      └─ Travel
         └─ Router
            └─ Screen:<pathname>
               └─ View / Sheet / Control
```

## MVP / Passive View

画面・Sheet・Control は MVP の Passive View とする。View が直接操作してよい状態は、入力中の文字列、開閉、選択中タブ、スクロール位置、アニメーション値、busy/error の表示など、描画だけに閉じた一時的な render state に限る。

`src/ui/passive/*`、`useUiNavigation()`、`useUiPlatform()` は Presenter / ViewModel facade として扱う。既存コンポーネントの API 互換性を保つため hook 名は維持するが、View が受け取るのは render data と command emitter だけとする。

永続データの mutation、同期、認証、設定保存、Toast、navigation、OS/browser API、PWA lifecycle など、View の外へ影響する動作は直接実行しない。View は Presenter facade へ command event を渡し、結果を描画へ反映する。

## Chain of Responsibility

`UiBoundary` はコンポーネント階層に対応したイベントチェーンを作る。イベントは発生元から親へ順にバブリングし、各 Boundary は必要な handler/effect を付与できる。handler がないイベントは上位へそのまま渡す。

イベントには `source` と `path` を付与し、どの階層から発生した操作かを Root まで保持する。子 Boundary で決まった発生元 `path` は親 Boundary で上書きしない。

## Mediator state machine

最上位の `UiMediatorProvider` がすべての UI command を裁定し、以下の状態を持つ。

- `idle`: 処理中イベントなし
- `handling`: 1件以上のイベントを処理中
- `error`: 直近のイベント処理が失敗

`begin -> resolve | reject` の遷移を必ず Root で行い、同期・非同期の effect を同じ経路で扱う。Travel Boundary がドメイン effect を選択した場合も、effect 自体の実行と state transition は Root Mediator が行う。nested command も `active` count で同一 state machine に含める。

## Service boundary

`AuthProvider`、`TravelProvider`、theme storage、Toast provider などは View ではなく service/infrastructure として扱う。既存の永続化・offline queue・API 通信は service 内に残し、View から service の mutation API を直接参照しない。

View から使う入口は次のとおり。

- `@/auth/auth-provider` -> passive auth Presenter facade
- `@/data/travel-provider` -> passive travel Presenter facade
- `@/theme/theme-provider` -> passive theme Presenter facade
- `@/components/toast` -> passive toast Presenter facade
- `@/utils/confirm-deletion` -> mediated confirmation bridge
- `useUiNavigation()` -> navigation command event
- `useUiPlatform()` -> OS/browser/PWA command event

service / mediator 実装から raw provider を使う場合は、`src/ui` からの相対 import に限定する。

## Guardrail

`scripts/test-ui-architecture.mjs` が adapter alias、Root 階層、event/effect の対応、event provenance、Router-owned navigation、直接 platform API などの bypass を検査する。新しい外部動作を追加するときは View から API を直接呼ばず、Presenter facade の event と Mediator effect を追加する。
