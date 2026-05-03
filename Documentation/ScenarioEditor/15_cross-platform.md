# 15. クロスプラットフォーム戦略 (Browser / Desktop / Unity)

> **本ドキュメントは 12_architecture.md より優先する全体方針です。**
> 既存の Unity-only 前提を **Web ファースト + マルチターゲット** に転換します。
> Unity 価値の極大化は `18_unity-integration.md`、セキュリティ詳細は `16_security.md` に集約。
> SaaS 化 (`17_saas.md`) は **棚上げ (Phase X)**。本ドキュメントが想定する 3 ターゲットは Browser / Desktop (Tauri) / Unity Editor のローカル運用です。

## なぜブラウザ対応か

- **配布が一瞬** — URL を共有するだけ。インストール不要、Unity ライセンス不要
- **コラボに強い** — レビュア/翻訳者/監督が「読むだけ」ですぐ参加
- **執筆環境を選ばない** — iPad、Chromebook、出先のサブPC でも開ける
- **WebView/PWA で OS ネイティブの体感** — オフライン動作、ウィンドウ化、ファイル直アクセスが可能
- **AI との親和性が高い** — 翻訳ベンダー連携や LLM 直叩き、Git 連携を Web で完結
- **Unity 内でも同じ UI が使える** — Unity Editor 上で WebView 経由 or 既定ブラウザ起動でホスト
- **将来 SaaS 化する場合の前提条件** — 着手時に Web ベースの資産がそのまま流用できる

Unity を捨てるのではなく、**Unity も「同じエディタを動かせる場所のひとつ」** に位置付ける。
Unity の真価 (Asset 流用、開発側 AI 連携) は `18_unity-integration.md` で深掘り。

## 設計の核

1. **データは YAML ファイル群**。ブラウザ/デスクトップ/Unity すべて同じファイルを直接読み書きする
2. **UI コードは TypeScript で 1 本**。React (or SolidJS) + Vite
3. **ターゲット 3 つ** に同一バンドルを配る:
   - **ブラウザ** (Chrome / Edge / Safari) — File System Access API で local FS にアクセス
   - **デスクトップ** (Tauri 2) — 軽量ネイティブ。Rust backend
   - **Unity Editor** — UI Document に WebView を埋め込み or 既定ブラウザを起動
4. **Unity 連携は別レイヤ**。C# 側は **データ消費者** に徹する (ScriptableObject 生成、ランタイム連携、Editor menu)
5. **オフラインファースト** — クラウド非依存で動く。クラウド同期は後付けの拡張

## 全体構成図

```
┌──────────────────────────────────────────────────────────┐
│  Frontend  (TypeScript + React/Solid + Vite)             │
│  - Panels, Graph, Timeline, Script Editor, Inspector …    │
│  - Same bundle in all targets                             │
└─────────┬────────────────────────────────────────────────┘
          │ Platform Adapter API (TS interface)
┌─────────▼────────────────────────────────────────────────┐
│  Core  (TypeScript, framework-agnostic)                  │
│  - Domain models, YAML/CSV parsers, Lint, Export, AI client│
│  - Also runs in Node.js (CLI) and Deno (CI)              │
└─────────┬────────────────────────────────────────────────┘
          │
┌─────────▼────────────────────────────────────────────────┐
│  Platform Adapters                                        │
│  ┌─ Browser ──────────────────────────────────────────┐ │
│  │  File System Access API + OPFS + IndexedDB         │ │
│  │  Web Workers, Service Worker (PWA / offline)       │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌─ Desktop (Tauri 2) ────────────────────────────────┐ │
│  │  Rust backend: native FS, OS keychain, file watch  │ │
│  │  Window mgmt, file dialogs, deep links             │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌─ Unity Editor ─────────────────────────────────────┐ │
│  │  Unity Editor Window with WebView 또는              │ │
│  │  External browser launcher                          │ │
│  │  IPC bridge: HTTP/WebSocket via local server       │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
          │
┌─────────▼────────────────────────────────────────────────┐
│  Unity Package (C#) — Consumer side                       │
│  - Reads YAML in Assets/Scenarios/                        │
│  - Generates ScriptableObject for runtime                 │
│  - Adds menu item: Window > Actoratect > Scenario Editor  │
│  - Optionally hosts the web editor in an EditorWindow     │
└──────────────────────────────────────────────────────────┘
          │
┌─────────▼────────────────────────────────────────────────┐
│  Optional Cloud Backend (future)                          │
│  - Auth, multi-user collaboration (CRDT/Yjs)              │
│  - Cloud storage sync, share/preview links                │
│  - AI proxy (server-side API key)                         │
└──────────────────────────────────────────────────────────┘
```

## 1. 技術スタックの選定理由

### 1.1 なぜ TypeScript か

- ブラウザの第一言語
- 巨大なエコシステム (グラフ、エディタ、リッチテキスト、UI)
- モノレポで Core/CLI/Frontend を共有可能
- Tauri / Electron / WebView との親和性
- Unity 統合は WebView 経由で十分機能する

### 1.2 なぜ React / SolidJS か

- React: 最大のエコシステム、エディタ系コンポーネントが豊富
- SolidJS: パフォーマンス・シンプルさで優位、大規模グラフ向き
- **暫定推奨: SolidJS** (大量ノード/行の再描画が肝のため)
- もしくは **React + Signals** (TanStack 等のリアクティブ)

### 1.3 なぜ Vite か

- 起動 1 秒台、HMR が圧倒的に速い
- TS/JSX 標準対応
- Tauri と公式統合

### 1.4 なぜ Tauri (Electron でなく)

- バンドルサイズ約 5MB (Electron は 100MB+)
- ネイティブ WebView 利用 (OS の WebView2/WebKit)
- メモリ消費が少ない、起動が速い
- Rust backend で堅牢な FS/OS 操作
- 自動更新、ノータライゼーション、コード署名のフロー完備

## 2. データレイヤ

### 2.1 共通: YAML ファイル群

3 ターゲット共通で同じ YAML を読み書きする。詳細は `08_file-format.md` に準拠。
データ自体に platform 依存は一切なし。

### 2.2 ブラウザ

| 用途 | ストレージ |
|---|---|
| プロジェクト本体 | **File System Access API** で local フォルダに直接アクセス |
| 非対応ブラウザ用フォールバック | ZIP インポート/エクスポート + OPFS でスクラッチ |
| エディタ設定/レイアウト | **IndexedDB** |
| サムネ/メディアキャッシュ | **OPFS** (Origin Private File System) |
| AI 履歴 | IndexedDB |

#### File System Access API のサポート

| ブラウザ | 状況 |
|---|---|
| Chrome / Edge / Opera | フル対応 |
| Brave | フル対応 |
| Firefox | OPFS のみ。FS Access は未対応 → ZIP モード |
| Safari (macOS/iOS) | OPFS のみ。FS Access は未対応 → ZIP モード |

→ Chrome/Edge を「first-class」、他は **ZIP インポート/エクスポート + OPFS** でフォールバック。
将来 Safari/Firefox の FS Access 標準化を待つ。

### 2.3 デスクトップ (Tauri)

- Rust の `std::fs` で完全な FS アクセス
- ファイル監視: `notify` クレート
- OS キーチェーン: `keyring` クレート
- ウィンドウ管理: Tauri Window API
- ディープリンク: `tauri-plugin-deep-link` (`actoratect://open?path=...`)

### 2.4 Unity Editor

3 段階のオプションを用意:

- **(L1) 既定ブラウザ起動** [既定/MVP]
  - メニューから `Window > Actoratect > Scenario Editor` で web 版を新タブで開く
  - URL に project path を渡す (`http://localhost:port/?project=Assets/Scenarios`)
  - Unity 側で軽量 HTTP サーバを起動 (`HttpListener` or Kestrel)
  - 利点: 実装が単純、安定
- **(L2) Tauri アプリ起動**
  - Tauri をインストール済みなら `actoratect://open?path=...` で起動
  - 利点: ネイティブ感
- **(L3) 埋め込み WebView** [将来]
  - Unity Editor Window 内に WebView をレンダ
  - 候補: Vuplex 3D WebView (有償) / .NET 用 WebView2 (Win) / WKWebView (Mac)
  - 利点: Unity と一体感
  - 欠点: 依存重い、プラットフォーム差大

→ **MVP は L1**、上達者向けに L2/L3 を順次。

## 3. アダプタ抽象 (TS インターフェイス)

```typescript
// packages/core/src/platform.ts
export interface FileSystemAdapter {
  pickProject(): Promise<ProjectHandle | null>;
  list(handle: ProjectHandle, glob: string): Promise<FileEntry[]>;
  read(handle: ProjectHandle, path: string): Promise<Uint8Array>;
  write(handle: ProjectHandle, path: string, data: Uint8Array): Promise<void>;
  watch(handle: ProjectHandle, on: (event: FsEvent) => void): Disposable;
  delete(handle: ProjectHandle, path: string): Promise<void>;
}

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface WindowSystem {
  openExternal(url: string): Promise<void>;
  spawnWindow(opts: WindowSpec): Promise<WindowHandle>;
  enterFullscreen(): Promise<void>;
}

export interface NetClient {
  fetch(req: Request): Promise<Response>;
  ws(url: string): WebSocket;
}
```

実装は 3 つ:

```
packages/
  core/                            # Pure TS, no DOM
  adapter-browser/                 # FS Access API + IndexedDB + OPFS
  adapter-tauri/                   # Tauri APIs (invoke, fs, dialog)
  adapter-unity/                   # Talks to Unity-side HTTP server
  frontend/                        # SolidJS app, picks adapter at runtime
  cli/                             # Node, uses adapter-node (own impl)
unity-package/                     # com.actoratect.editor-tools (C#)
```

## 4. Unity 側 (C# パッケージ) の役割

- **メニュー**: `Window > Actoratect > Scenario Editor` でローカル HTTP サーバを起動し、web 版を開く
- **AssetPostprocessor**: `Assets/Scenarios/**/*.yaml` を監視し、`ScriptableObject` を生成
- **ランタイム**: `ScenarioRuntime.LoadScene(sceneId)` などのシナリオ再生 API
- **Settings**: ProjectSettings へのスケジューラ統合 (defaultLocale 等)
- **Bridge HTTP**: 上記の web 版が Unity 内のアセットや実行中ゲームと連携するための API

```csharp
// Editor/ScenarioEditor/UnityBridge/ScenarioBridgeServer.cs
[InitializeOnLoad]
public static class ScenarioBridgeServer {
    static HttpListener listener;
    static int port = 17321;

    static ScenarioBridgeServer() {
        EditorApplication.delayCall += Start;
    }

    static void Start() {
        listener = new HttpListener();
        listener.Prefixes.Add($"http://localhost:{port}/");
        listener.Start();
        // GET  /project           プロジェクト概要
        // GET  /file?path=        ファイル取得
        // POST /file?path=        ファイル書込み
        // POST /reload            アセットリインポート
        // GET  /sse/changes       Server-Sent Events で外部変更通知
    }
}
```

ブラウザ版は同じ HTTP API に話しかけることで、Unity 内のアセットも編集対象にできる。

## 5. オフラインファースト

- **PWA** (Service Worker + Manifest) — 一度開けばオフラインで起動可能
- **更新は背景で取得**、次回起動時に適用 (Cache First, Network Update)
- AI 機能は `online: required` で個別フラグ
- 同期 (cloud) は **任意**: ローカル単独で全機能完結

## 6. 認証・コラボ (将来)

MVP/β は **シングルユーザ + ローカル**。1.0 以降に追加:

- **Auth**: GitHub OAuth (もっとも自然)、メール/パスワード補助
- **同期方式**:
  - (a) Git ベース (最低限) — push/pull、コミット履歴で管理
  - (b) **CRDT (Yjs)** によるリアルタイム — 共著しても衝突しない
- **ホスティング**: Cloudflare Workers + R2、または Tauri 単機 + GitHub backend
- **AI proxy**: API キーを背側で管理 (ブラウザ単独だと API キーが暴露するため)

## 7. AI のブラウザ事情

### 7.1 API キーの扱い

- **ブラウザ単独**: ユーザ自身のキーを IndexedDB に保存。`localhost`/origin 制限のみ。漏洩リスク注意
- **Tauri**: OS キーチェーンに保存。安全
- **Unity 経由**: Unity 側 OS キーチェーン → ブリッジ HTTP 越しに使用

### 7.2 CORS 問題

Anthropic / OpenAI API はブラウザ直叩きを許可する CORS ヘッダを返す。
ただし `dangerouslyAllowBrowser` 等の明示が必要なケースあり。

→ **暫定**: ブラウザ直叩き ON (利用規約に注意喚起)、Tauri は Rust 側経由

### 7.3 SaaS 版の AI プロキシ (Phase 5+)

Cloud バックエンド (Cloudflare Workers) で:
- 認証付きエンドポイント
- レート制限・組織別 Quota
- コスト集計ダッシュボード
- プロジェクト共有時の API キー隠蔽
- プロンプトキャッシュの集中管理

詳細は **`17_saas.md`** §2.5 / **`16_security.md`** §5.5。

## 8. 性能とブラウザ事情

### 8.1 大規模グラフ

ブラウザ環境では Unity GraphView は使えない。代替:

| 候補 | 適性 |
|---|---|
| **ReactFlow / SolidFlow** | 直感的、〜500 ノード |
| **Cytoscape.js** | 物理シミュ強い、〜2,000 ノード |
| **Sigma.js + Graphology** | 大規模 (〜10,000 ノード) WebGL |
| **PixiJS 自前** | 超大規模、自由度最大、実装重め |
| **D3 + Canvas** | 中庸 |

→ MVP は **SolidFlow** (もしくは ReactFlow)、性能限界が見えたら **Sigma.js** 移行を計画

### 8.2 大量行の脚本エディタ

| 候補 | 用途 |
|---|---|
| **CodeMirror 6** | プロ向けコードエディタ。脚本 DSL に最適 |
| **Monaco Editor** | VSCode と同じ。重め |
| **TipTap (ProseMirror)** | リッチテキスト。サムネ等の組込みやすい |
| **Lexical (Meta)** | リアクティブで軽量、共同編集に強い |

→ **暫定**: 脚本本体は **CodeMirror 6** + カスタムレンダ (サムネ/感情タグの inline widget)。
あらすじ等の自由文は **TipTap** か Markdown プレーン。

### 8.3 仮想化リスト

- 1 万ノード一覧、10 万行ローカライズテーブル
- **TanStack Virtual** で row virtualization
- カラム仮想化も必要 (列が多いテーブル)

## 9. ウィンドウ・パネル管理

詳細は `07_window-system.md` 参照。クロスプラットフォームでの差:

| 機能 | Browser | Desktop | Unity |
|---|---|---|---|
| 1 ウィンドウ内のドッキング | ◎ (Goldenlayout / Dockview) | ◎ | ◎ |
| 複数ウィンドウ | △ `window.open` 制限あり | ◎ Tauri 複数 Window | △ Unity Editor の制約 |
| マルチモニタ | △ Window Management API (実験的) | ◎ | ◎ |
| 中ボタンパン | ◎ | ◎ | ◎ |
| 全画面 | ◎ Fullscreen API | ◎ | △ |

→ 中核ドッキングは **Dockview** (TS 製) を採用。複数ウィンドウは Tauri/Unity でフル対応、ブラウザは制約付き。

## 10. ビルド/配布

### 10.1 ブラウザ版

- Vite で静的ビルド
- 配信: Cloudflare Pages / GitHub Pages / 自社 CDN
- バージョニング: コミットハッシュをパスに含める
- PWA manifest + Service Worker

### 10.2 デスクトップ版

- Tauri ビルド: Win (msi/exe)、macOS (dmg)、Linux (AppImage/deb)
- 自動更新: Tauri Updater
- コード署名: Win Authenticode、macOS Notarization

### 10.3 Unity パッケージ版

- 既存 `com.actoratect.editor-tools` に追記
- `Editor/ScenarioEditor/` 配下
- web bundle はパッケージに同梱 (オフライン起動)
- メニュー一発でローカルサーバ起動 → ブラウザ表示

## 11. CLI モード (おまけ)

`packages/cli/` に Node.js ベースの CLI:

```
scenario validate
scenario export <id>
scenario lint --strict
scenario migrate
```

CI で動かす。Deno でも動くように書く (将来 Edge function での実行)。

## 12. プロジェクト構成 (モノレポ)

```
.
├── unity-package/               # 既存 com.actoratect.editor-tools
│   ├── Editor/
│   │   ├── (既存ツール)
│   │   └── ScenarioEditor/      # C# bridge + ScriptableObject
│   ├── Runtime/                 # ランタイム再生
│   └── package.json
├── web/                         # pnpm workspace
│   ├── packages/
│   │   ├── core/                # 純 TS。データモデル、Lint、Export
│   │   ├── adapter-browser/
│   │   ├── adapter-tauri/
│   │   ├── adapter-unity/       # Unity bridge HTTP に話しかける
│   │   ├── adapter-node/        # CLI 用
│   │   ├── ui-kit/              # 共有コンポーネント
│   │   ├── frontend/            # SolidJS アプリ
│   │   ├── tauri/               # Rust + Tauri 設定
│   │   └── cli/                 # CLI
│   ├── package.json
│   └── pnpm-workspace.yaml
└── Documentation~/
    └── ScenarioEditor/          # 本設計書
```

## 13. 言語選定の最終判断

代替案 (C# / Blazor / Avalonia / Uno) との比較:

| 候補 | Browser | Desktop | Unity 統合 | 学習資産 | 性能 | 結論 |
|---|---|---|---|---|---|---|
| **TypeScript + Tauri** | ◎ | ◎ Tauri | △ WebView | 大 | ◎ | **採用** |
| C# + Blazor WASM | ◎ (重) | ◎ MAUI | ◯ 同言語 | 中 | △ | 候補 |
| C# + Avalonia | ◎ (新) | ◎ | △ | 小 | ◎ | 不採用 |
| Flutter | ◎ | ◎ | △ | 中 | ◎ | 不採用 (言語) |

**TypeScript を採用**。理由は:
- ブラウザで一級市民、エコシステムが圧倒的
- Tauri で軽量デスクトップ、ネイティブ感
- Unity との連携は WebView/HTTP で十分機能する
- ライター/翻訳者向けの WYSIWYG/エディタ系コンポーネントが豊富

C# の保有資産は **Unity 側のブリッジコード** に集中させ、UI は TypeScript で 1 本化する。

## 14. 既存設計書との関係

| 既存ドキュメント | 影響 |
|---|---|
| 03 data-model | **影響なし** (YAML 中心、平台中立) |
| 04 graph-editor | **置換**: GraphView → SolidFlow/Sigma.js を採用 |
| 05 timeline | 概念は不変。実装は TS で |
| 06 scenario-layers | 概念は不変。エディタは CodeMirror 6 ベース |
| 07 window-system | **更新**: Dockview ベース、各 platform の制約反映 |
| 08 file-format | **影響なし** |
| 09 localization | **影響なし** (export/import 先がブラウザでも動くだけ) |
| 10 export | **更新**: Unity 専用 export は Unity 経由 (HTTP bridge) |
| 11 ai-workflow | **更新**: API キー保存先、CORS、プロキシ |
| 12 architecture | **大幅更新** → 本ドキュメントが上位 |
| 13 roadmap | **更新**: ブラウザ → Tauri → Unity の順 |

## 15. 移行ステップ

既存 Unity 専用設計から、本クロスプラットフォーム設計への切り替え順序:

1. **Phase 0 PoC**:
   - PoC-A: Vite + SolidJS で 3 パネル + Dockview
   - PoC-B: SolidFlow で 1,000 ノード描画
   - PoC-C: File System Access API + Tauri FS で同じ Adapter
   - PoC-D: Unity HTTP bridge と web から往復
2. **Phase 1 MVP**: Browser 版 + Tauri 版が同時リリース。Unity は L1 (外部ブラウザ起動)
3. **Phase 2 β**: Unity L2/L3 (Tauri 自動起動 / WebView 埋め込み)、Cloud sync 検討開始
4. **Phase 3 1.0**: 全形態安定、認証、コラボ前提機能
