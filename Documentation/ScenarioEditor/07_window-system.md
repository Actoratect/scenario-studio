# 07. ウィンドウシステム (ドッキング/レイアウト)

> プラットフォーム前提は `15_cross-platform.md` を参照。本ドキュメントは Browser / Desktop (Tauri) / Unity の **3 ターゲットで同等のドッキング体験** を作る方針です。

## 設計の核

- **すべての機能は「パネル」単位**。パネル = 単一機能の UI ユニット
- パネルは **タブとしてドッキング** / **独立フロート** / **複数同居** が可能
- **9 タブグリッド (3×3)** や縦長/横長など、Visual Studio / Rider / Photoshop 並みの自由配置
- ドッキング基盤は **Dockview** (TS 製ライブラリ) を採用し、3 ターゲットで同一動作
- マルチウィンドウは Tauri/Unity でフル対応、ブラウザは制限を許容

## 1. 用語

| 用語 | 意味 |
|---|---|
| **Panel** | 機能の最小UI単位 (例: GraphPanel, ScriptPanel) |
| **Tab** | パネルが描画される単位 (Dockview Panel) |
| **TabSet** (= Group) | 同一エリアに重ねたタブ群 |
| **Region** | 分割可能なレイアウト領域。中に TabSet を持つ |
| **DockHost** | ドッキング対応のトップレベルウィンドウ |
| **FloatingPanel** | 同一ウィンドウ内の浮遊パネル |
| **DetachedWindow** | 別 OS ウィンドウに切り離されたパネル群 (Tauri/Unity のみ) |
| **Layout** | パネル配置のスナップショット |

## 2. プラットフォーム別の対応マトリクス

| 機能 | Browser | Desktop (Tauri) | Unity Editor |
|---|---|---|---|
| ドッキング (タブ/分割) | ◎ Dockview | ◎ Dockview | ◎ Dockview (in WebView) |
| 同一ウィンドウ内フロート | ◎ Dockview Floating | ◎ | ◎ |
| **別 OS ウィンドウへ切離** | △ `window.open` (browser ポップアップ制約あり) | ◎ Tauri Multi-Window | △ Editor 仕様により制限 |
| マルチモニタ | △ Window Management API (実験的) | ◎ | ◎ |
| グリッド配置 (3×3 等) | ◎ | ◎ | ◎ |
| Snap (端寄せ) | ◎ Dockview | ◎ | ◎ |
| 中ボタンパン | ◎ | ◎ | ◎ |
| 全画面 | ◎ Fullscreen API | ◎ | △ Unity 制約 |
| ブラウザタブで複数開き | ◎ (各タブ独立 URL) | n/a | n/a |
| OS ウィンドウタイトルバー統合 | × | ◎ | × |

## 3. 基本構造

```
DockHost (Browser タブ / Tauri Window / Unity Editor Window)
└── Region (root, split: vertical)
    ├── Region (split: horizontal)
    │   ├── TabSet [Project Tree | Glossary]
    │   ├── TabSet [Graph]                          ← 中央エリア
    │   └── TabSet [Inspector | Variables]
    └── TabSet [Outline | Timeline | Console]

DetachedWindow (副ウィンドウ — Tauri/Unity のみ)
└── Region (split: horizontal)
    ├── TabSet [Script (Ch1)]
    └── TabSet [Script (Ch2)]
```

## 4. 操作 (UX)

### 4.1 タブのドラッグ

- タブをドラッグ → 全 Region と TabSet にドロップターゲット表示
- 中央ヒント (＋ 字に分かれた 4方向): どの辺で分割するか
- 中央: 既存 TabSet にタブとして合流
- 4辺: その方向に Region を分割して新規 TabSet 作成
- 外部 (ウィンドウ枠外) にドロップ:
  - **Browser**: 同タブ内 Floating Panel (内部ウィンドウ) になる。`window.open` で新ブラウザウィンドウへ送る選択もダイアログで提示
  - **Tauri**: 新 OS ウィンドウとして切離
  - **Unity**: Editor の制約により FloatingPanel に留まる (将来 WebView 多重化で対応検討)

### 4.2 グリッド整列モード

- メニュー → `Layout > Grid 3x3 / Grid 2x2 / Grid 1x3 / Grid 3x1`
- 任意の N×M グリッドを生成し、既存タブを左上から自動配置
- 9 パネル並列で全体俯瞰したい大規模制作向け
- ブラウザで未保存タブが多い場合は自動で「Floating」化

### 4.3 Snap (四隅・辺・中央)

- ドラッグ中、ホストウィンドウの 4 隅/4 辺/中央でスナップ強調
- スナップ位置にドロップで「半分/4分の1/中央配置」

### 4.4 タブ操作

| 操作 | 動作 |
|---|---|
| ダブルクリック | 最大化 (他のタブを一時隠す) |
| 右クリック | コンテキスト (閉じる、固定、新規ウィンドウへ移動、URL コピー) |
| 中クリック | タブを閉じる |
| ドラッグ→外 | フロート化 (Browser) / 別ウィンドウ化 (Tauri/Unity) |
| `Ctrl/⌘+W` | 閉じる |
| `Ctrl/⌘+Shift+T` | 直前に閉じたタブを復元 |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | タブ循環 |
| `Ctrl/⌘+Shift+P` | パネル新規追加 (コマンドパレット) |
| `Alt+1..9` | パネル番号でフォーカス |

> **ブラウザ注意**: `Ctrl+W` はブラウザ自体のタブを閉じてしまうため、本アプリ内では `Ctrl+F4` または `Esc + W` をデフォルトに。設定でカスタム可。

### 4.5 スクロール/中ボタン操作

- パネル内スクロール: マウスホイール (標準)
- パン (グラフ/年表/プロットボード): **中ボタンドラッグ** または `Space + 左ドラッグ`
- Shift+ホイール: 横スクロール
- Ctrl/⌘+ホイール: ズーム (グラフ/年表/プレビュー)

> ブラウザ既定の Ctrl+ホイール (= ページズーム) は、対象パネル上で `event.preventDefault()` し、アプリ内ズームに転用。

## 5. パネル一覧 (初期搭載)

| パネル | 説明 | 主要技術 |
|---|---|---|
| **Project Tree** | ファイル/ノード階層 | TanStack Virtual |
| **Inspector** | 選択ノード/シーンの詳細編集 | SolidJS form |
| **Graph** | 相関図グラフ (Lens 切替) | SolidFlow / Sigma.js |
| **Timeline** | 年表 | PixiJS or Canvas2D |
| **Outline** | シナリオ章/シーンのアウトライナ | TanStack Virtual |
| **Plot Board** | コルクボード (シーンカード) | dnd-kit |
| **Script** | 脚本エディタ (シーン1個に1パネル) | CodeMirror 6 + 拡張 |
| **Synopsis** | あらすじ Markdown エディタ | TipTap or CM6 |
| **Glossary** | 用語集 | TanStack Table |
| **Variables** | フラグ/カウンタ | TanStack Table |
| **Localization** | 多言語テーブル | TanStack Table + Virtual |
| **Search / Find in All** | 全文検索 | MiniSearch / Lunr |
| **Console** | Lint / 警告 / AI ジョブログ | Virtual scroll |
| **Preview Runner** | 擬似 ADV 再生 | カスタム |
| **Stats Dashboard** | 進捗・統計 | Recharts / VisX |
| **Mini-map** (副) | グラフ用 mini map | グラフライブラリ標準 |

## 6. レイアウトプリセット

メニュー `Layout > ...` から呼び出し:

- **Writer** (執筆フォーカス): Outline + Script + Inspector
- **Designer** (世界観): Graph (Relationship Lens) + Inspector + Timeline
- **Director** (脚本演出): Script + Preview + Variables + Console
- **Localizer** (翻訳): Localization + Script + Glossary
- **Producer** (進捗管理): Plot Board + Stats Dashboard + Outline
- **Reader** (読み返し): Script を最大化 + Stats のみ
- **Mobile** (タブレット閲覧用): 単一カラム、メインのみ

ユーザによる Layout 保存/共有 (.json で書き出し可能、URL 共有も可)。

## 7. 独立ウィンドウ (DetachedWindow)

### 7.1 ブラウザ

- `window.open()` で新タブ/新ウィンドウ起動
- ポップアップブロック対策で「ボタン押下から直接呼ぶ」必要あり
- 元ウィンドウとは BroadcastChannel API で同期 (選択、Era、レイアウト変更通知)
- Selection / Era などは `localStorage` + `storage` イベント or BroadcastChannel
- 親子関係は OS が知らないので、親を閉じても子は残る (ユーザに警告)

### 7.2 Tauri

- `WebviewWindow` API で複数ウィンドウ
- IPC で `tauri::Manager` 経由のメッセージング
- 親子関係を持てる、親を閉じれば子も閉じる
- 全 OS でマルチモニタ対応

### 7.3 Unity Editor

- 単一 EditorWindow 内 WebView を基本に、副ウィンドウは追加 EditorWindow を起動
- マルチウィンドウは Editor v6 で改善されているが OS 依存
- 「常に最前面」「子ウィンドウ」扱いには制限あり

## 8. ブラウザ特有の事情と回避

| 事項 | 回避策 |
|---|---|
| Ctrl+W でブラウザタブが閉じる | アプリ内ショートカットを Ctrl+F4 等に変更可、設定で上書き |
| Cmd+Q (macOS) でアプリ終了 | アプリ内では「Cmd+Q を再定義しない、unload で確認」 |
| ページリロード (F5) で状態消失 | 自動保存と URL ルートで状態復元、`beforeunload` 警告 |
| Ctrl+ホイールでページズーム | 対象パネルで preventDefault、アプリ内ズームに転用 |
| 中ボタンクリックでタブ表示 | パネル領域で preventDefault |
| `window.open` ポップアップブロック | 必ず user-gesture ハンドラ内で呼ぶ |
| モニタ毎の解像度差 | CSS pixel と device pixel ratio を考慮、Window Management API で取得 (Chrome) |
| ブラウザの戻る/進む誤動作 | History API で適切な state を積む |

## 9. 状態同期と URL ルート

- 主要状態 (current scene、current era、selected node、active panel、layout name) を **URL クエリ** に反映
- 例: `/scene/s01_opening?era=era.modern&panel=script&layout=writer`
- リロードで状態復元、ブクマ可能、URL 共有でレビュア招待

## 10. 実装方針

### 10.1 採用ライブラリ

- **[Dockview](https://github.com/mathuo/dockview)** 採用
  - TS 製、React/Vue/Vanilla 対応 (SolidJS は Vanilla モードでラップ)
  - Group/Floating/Detach/JSON 永続化が標準
  - 軽量、active メンテ
- フォールバック候補: **Golden Layout** (歴戦), **rc-dock** (React 専用)

### 10.2 永続化

```yaml
# .editor/layout.yaml  (Git ignore)
version: 1
hosts:
  - id: main
    monitor: 0
    bounds: { x: 0, y: 0, w: 1920, h: 1080 }
    dockview:
      # Dockview のシリアライズ JSON をそのまま埋める
      grid:
        root:
          type: branch
          orientation: horizontal
          children:
            - { type: leaf, data: { views: [project_tree, glossary], activeView: project_tree } }
            - type: branch
              orientation: vertical
              children:
                - { type: leaf, data: { views: [graph, timeline], activeView: graph } }
                - { type: leaf, data: { views: [inspector, variables], activeView: inspector } }
      panels:
        project_tree: { id: project_tree, contentComponent: ProjectTreePanel }
        graph:        { id: graph,        contentComponent: GraphPanel }
        # ...
  - id: detached_1   # Tauri/Unity のみ
    monitor: 1
    bounds: { x: 1920, y: 0, w: 1920, h: 1080 }
    dockview: { ... }
```

### 10.3 Selection と Era の共有

- 同一ホスト内: SolidJS Signal を直接購読
- 別ウィンドウ (Tauri): IPC イベント
- 別ウィンドウ (Browser): BroadcastChannel または `localStorage` + `storage` イベント
- 別ウィンドウ (Unity): HTTP Bridge SSE

抽象 `IInterWindowBus` インターフェイスでアダプタを差し替え。

### 10.4 入力ハンドリング

- パネルにフォーカスがあると共通ショートカットを上書き可能
- `requestAnimationFrame` で再描画スロットリング
- 中ボタンパン: 各パネルが共通の `usePanZoom` フックを利用
- キーバインドは `tinykeys` 等の軽量ライブラリで一元管理

## 11. アクセシビリティ

- キーボードのみで全操作可能 (Tab 順序、矢印移動)
- パネル切替: `Alt+1..9`
- 「パネルを開く」コマンドパレット
- フォントサイズ調整 (パネル別)
- ARIA roles / labels (Dockview は対応済み)
- 高コントラストテーマ (CSS variables で切替)

## 12. テスト

- レイアウト保存→読み込みの往復テスト (vitest)
- ドラッグ&ドロップで分割/合流のシナリオ (playwright)
- マルチウィンドウ間同期 (playwright with multiple contexts)
- Tauri マルチウィンドウ (cargo test + e2e)
- Unity 内 WebView ホスト (Unity Test Framework)
- 1 万行スクリプトでスクロール性能
- 9 パネル同時開きで再描画コスト (60 fps target)

## 13. 将来拡張

- **タブ色付け** (パネル種別/プロジェクト別)
- **タブグループ折り畳み** (ピン留めグループだけ常時表示)
- **タブ履歴** (Ctrl+Shift+T 復元、過去レイアウト復元)
- **同期スクロール** (左右で別シーンを比較)
- **比較ビュー** (旧版 vs 新版を並べる)
- **共同編集モード** (将来、CRDT)
- **モバイルレイアウト** (シングルカラム + ボトムシート風パネル切替)
