# 12. アーキテクチャ

> **このドキュメントは `15_cross-platform.md` の方針を前提にした技術詳細です。**
> 全体方針 (なぜ Web ファーストか、3 つのターゲット) はそちらを参照してください。

## 設計の核

- **TypeScript 1 本** で UI と Core を実装。3 ターゲット (Browser / Desktop Tauri / Unity) に同一バンドル
- **Core は純粋 TS** (DOM / Node / Tauri / Unity API 非依存)。CLI/CI でも動く
- **Adapter で I/O・OS 機能を隔離**。各プラットフォーム差を吸収
- **データフローは状態 (Signal/Store) ベース** — リアクティブに UI 同期
- **Unity は C# の薄い消費レイヤ**。シナリオ実行と Asset 生成のみ

## 1. レイヤ構造

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend  (SolidJS + UI Kit)                                  │
│  - Panels: Graph, Timeline, Script, Inspector, Localization … │
│  - Dockview based docking                                      │
│  - Routes: /project, /scene/:id, /node/:id, /loc, /settings    │
└──────────┬────────────────────────────────────────────────────┘
           │ commands / queries / signals
┌──────────▼────────────────────────────────────────────────────┐
│ Application Layer  (TS, framework agnostic)                   │
│  - Services: ProjectService, AiService, LinterService,        │
│              ExportService, ImportService, SyncService        │
│  - Use cases: command handlers, queries                        │
└──────────┬────────────────────────────────────────────────────┘
           │
┌──────────▼────────────────────────────────────────────────────┐
│ Domain Layer  (Pure TS, no DOM/Node)                          │
│  - Models: Node, Relation, Era, Scene, Variant, Variable …    │
│  - Repositories (interfaces)                                   │
│  - Lint Rules, Migration Rules                                │
│  - Selection model                                             │
└──────────┬────────────────────────────────────────────────────┘
           │
┌──────────▼────────────────────────────────────────────────────┐
│ Infrastructure (Adapter implementations)                      │
│  - YAML / CSV / JSON parsers (yaml, papaparse, native JSON)   │
│  - LLM provider (Anthropic / OpenAI / local)                  │
│  - File watch (browser FS observer / fs notify / Unity SSE)   │
│  - Git client (isomorphic-git on Web/Tauri, libgit2 on Tauri) │
└───────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Platform Adapters (one per target)                           │
│  - adapter-browser  : FS Access API, OPFS, IndexedDB         │
│  - adapter-tauri    : Tauri invoke, Rust FS, native dialogs   │
│  - adapter-unity    : HTTP bridge to Unity (SSE for changes)  │
│  - adapter-node     : Node.js fs, used by CLI                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Unity Package (C#)                                            │
│  - HTTP Bridge Server                                         │
│  - AssetPostprocessor → ScriptableObject 生成                 │
│  - Editor menu, Settings UI                                   │
│  - Runtime API for in-game playback                           │
└──────────────────────────────────────────────────────────────┘
```

## 2. モノレポ構成

> **Phase 0 PoC-I で確定**: 当初案の単一モノレポ (`unity-package/` + `web/`) ではなく、**2 リポジトリ分離** で進める。
> Unity 配布チャネル (Package Manager は git URL 単位) と Web 配布チャネル (npm registry / 静的ホスト) が別であること、CI マトリクスを分離できることが理由。
> 設計書群 (`Documentation/ScenarioEditor/`) は両 repo に重複配置せず、Unity 側 (`Documentation~/`) を一次ソースとして、TS 側にコピー配布する。

### 2.1 リポジトリ分割

| リポジトリ | 配布チャネル | 主担当 |
|---|---|---|
| `Actoratect/com.actoratect.editor-tools` | Unity Package Manager (git URL) | Unity Editor 拡張 (C#)、既存ツール (SceneLoader, RenameTool, …)、ScenarioEditor 関連の Editor/Runtime コード、設計書 (`Documentation~/`) の一次ソース |
| `Actoratect/scenario-studio` (本 repo) | npm registry (`@actoratect/scenario-cli`) / 静的ホスト (Browser) / GitHub Releases (Tauri) | TS 側のすべて (core, adapters, ui-kit, frontend, cli, tauri) |

### 2.2 Unity 側 repo (`com.actoratect.editor-tools`) の構造

```
.
├── Editor/
│   ├── (既存ツール: SceneLoader, RenameTool, …)
│   └── ScenarioEditor/
│       ├── BridgeServer/                  # HTTP/SSE サーバ
│       ├── AssetPipeline/                 # YAML → ScriptableObject
│       ├── EditorWindow/                  # Editor menu, WebView host
│       └── Settings/                      # ProjectSettings 連携
├── Runtime/
│   └── ScenarioRuntime/                   # ゲーム再生 API
├── Documentation~/                        # 設計書の一次ソース (本ファイル含む)
│   └── ScenarioEditor/
└── package.json
```

### 2.3 TS 側 repo (`scenario-studio`、本 repo) の構造

```
.
├── packages/
│   ├── core/                              # Domain / Application / Infra (pure TS)
│   │   ├── src/
│   │   │   ├── domain/                    # Models, Repos (pure) — Phase 1+
│   │   │   ├── application/               # Services, commands — Phase 1+
│   │   │   ├── infra/                     # YAML/CSV parsers, LLM — Phase 1+
│   │   │   └── platform.ts                # Adapter interfaces (PoC-I で stub 配置)
│   │   └── package.json
│   ├── adapter-browser/                   # FS Access / OPFS / IndexedDB
│   ├── adapter-tauri/                     # Tauri invoke / Rust FS
│   ├── adapter-unity/                     # Unity Bridge HTTP client
│   ├── adapter-node/                      # Node.js fs (CLI / CI)
│   ├── ui-kit/                            # 共通 UI コンポーネント (SolidJS)
│   ├── frontend/                          # SolidJS app
│   │   ├── src/                           # panels/, docking/, routes/, styles/ — PoC-A 以降
│   │   └── vite.config.ts                 # PoC-A で追加
│   ├── tauri/                             # Rust + Tauri 設定 (PoC-G で追加)
│   │   ├── src/
│   │   ├── tauri.conf.json
│   │   └── Cargo.toml
│   └── cli/                               # Node-based CLI
├── Documentation/                         # 設計書のコピー (Unity repo を一次ソースに同期)
│   └── ScenarioEditor/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json                          # 全 package へ project references
├── eslint.config.mjs                      # ESLint v9 flat config + typescript-eslint + solid
└── vitest.config.ts                       # `*.test.ts` を packages/*/src 配下から収集
```

asmdef の代わりに **TypeScript の package + tsconfig project references** で依存方向を強制。
Core は他のパッケージに依存しない。Adapter は Core にのみ依存。Frontend は Core / UI Kit / Adapter に依存。CLI は Core / adapter-node に依存。

## 3. 採用ライブラリ

### 3.1 TS / Web 側

| ライブラリ | 用途 | 補足 |
|---|---|---|
| **SolidJS** | UI フレームワーク | 大量レンダの再描画コスト低 |
| **Vite** | バンドラ/HMR | 開発体験◎ |
| **TypeScript** | 言語 | strict 設定 |
| **Dockview** | ドッキング | TS 製、SolidJS にも組込み可 |
| **CodeMirror 6** | 脚本エディタ | 拡張で inline サムネ追加 |
| **TipTap** | リッチテキスト (あらすじ) | ProseMirror ベース |
| **SolidFlow** (or ReactFlow) | グラフエディタ | MVP 用、〜500 ノード |
| **Sigma.js + Graphology** | 大規模グラフ | 1.0 で移行候補 |
| **PixiJS** | 年表/タイムライン高速描画 | optional |
| **TanStack Virtual** | リスト仮想化 | テーブル系で必須 |
| **yaml** (Eemeli) | YAML パース | コメント保持・往復可 |
| **papaparse** | CSV | ローカライズ等 |
| **isomorphic-git** | Git (Browser/Tauri) | Web で git diff 可能 |
| **Yjs** | CRDT (将来コラボ) | 1.0 以降 |
| **@anthropic-ai/sdk** | Claude API | ブラウザ・Node 両対応 |
| **i18next** | UI 自体の i18n | 翻訳キー管理 |
| **vitest** | 単体テスト | Vite 標準 |
| **playwright** | E2E テスト | クロスブラウザ |

### 3.2 Tauri / Rust 側

| クレート | 用途 |
|---|---|
| `tauri` 2.x | アプリフレーム |
| `notify` | ファイル監視 |
| `keyring` | OS キーチェーン (API キー) |
| `tokio` | 非同期 I/O |
| `tauri-plugin-dialog` | ファイル選択 |
| `tauri-plugin-deep-link` | URL スキーム (`actoratect://`) |
| `tauri-plugin-updater` | 自動更新 |

### 3.3 Unity 側 (C#)

| ライブラリ | 用途 |
|---|---|
| **YamlDotNet** | YAML パース (AssetPipeline 用) |
| **Newtonsoft.Json** | HTTP Bridge JSON |
| **HttpListener** (.NET 標準) | Bridge HTTP サーバ |
| **WebSocketSharp** or 自前 SSE | 変更通知 |

C# 側はもう「UI を作る側」ではなく **Asset 生成 + サーバ** に集中するため、ライブラリは最小化。

## 4. データフロー

### 4.1 起動シーケンス (ブラウザ版)

```
1. ユーザがブラウザで URL を開く
2. 「プロジェクトフォルダを選択」ボタンを押す
3. FS Access API で OS のファイルピッカー
4. ProjectHandle 取得 → adapter が登録
5. Loader が ProjectSettings.yaml をロード
6. Templates / Eras / Calendars を非同期ロード
7. IndexBuilder が Index/*.json を確認 (なければ再構築)
8. ProjectModel をメモリ展開 (本文は遅延)
9. Dockview のレイアウトを IndexedDB から復元
10. 各パネルが Service を購読
11. FileWatcher (FS Access の polling) 起動
```

### 4.2 起動シーケンス (Unity 版)

```
1. Unity Editor 起動 → BridgeServer が localhost:17321 で待機
2. ユーザがメニューから「Scenario Editor」を起動
3. Unity が default browser で http://localhost:17321/ を開く
   (or Tauri がインストールされていれば actoratect:// 経由)
4. 以下、ブラウザ版と同様。adapter-unity が HTTP API 経由で FS 操作
```

### 4.3 編集オペレーション

```
User UI 操作
   → Command を Service に発行
   → Domain でモデル更新 (immutable replace)
   → Signal が変更通知
   → 購読中のパネルが再レンダ (SolidJS の細粒度反応)
   → SaveScheduler がデバウンス書き出し (Adapter 経由)
   → Index を増分更新
```

### 4.4 外部編集の取り込み

```
Adapter が File change イベント
   → Loader がファイル再読込
   → Domain に反映 (origin: external)
   → Signal 通知
   → UI 更新、ユーザにトースト
```

## 5. データモデルの実装方針

### 5.1 不変データ + 構造的共有

```typescript
import { produce } from "immer";

export type CharacterNode = Readonly<{
  id: NodeId;
  slug: string;
  templateId: TemplateId;
  displayName: LocalizedString;
  fields: ReadonlyMap<string, FieldValue>;
  variants: readonly NodeVariant[];
  status: NodeStatus;
}>;

export function renameSlug(node: CharacterNode, slug: string): CharacterNode {
  return produce(node, draft => { draft.slug = slug; });
}
```

- 大きい構造には **Immer** で差分更新
- `Map` / `Set` は immutable 系ライブラリ (`immutable-js`) も検討対象
- 参照は ID 文字列 (循環回避)

### 5.2 ID と参照

```typescript
type NodeId = string & { readonly __brand: "NodeId" };
type EraId  = string & { readonly __brand: "EraId" };
// branded types でコンパイル時の型混同を防止
```

ULID 生成は `ulid` パッケージ。

### 5.3 Selection / Era

```typescript
import { createSignal } from "solid-js";

export const [selection,  setSelection]  = createSignal<NodeId[]>([]);
export const [currentEra, setCurrentEra] = createSignal<EraId>("era.modern");
```

全パネルが同じ Signal を購読 → グラフで選択 → Inspector に反映 → Timeline に Now 移動 が一貫。

## 6. UI ⇔ コア の連携

### 6.1 コマンドパターン

```typescript
export interface Command<TArgs, TResult> {
  readonly id: string;
  validate(args: TArgs, ctx: AppContext): ValidationResult;
  execute(args: TArgs, ctx: AppContext): Promise<TResult>;
  undo?(args: TArgs, prev: TResult, ctx: AppContext): Promise<void>;
}

export const RenameSlugCommand: Command<{ id: NodeId; newSlug: string }, void> = {
  id: "node.renameSlug",
  validate({ newSlug }) { return /^[a-z0-9_-]+$/.test(newSlug) ? "ok" : "invalid"; },
  async execute({ id, newSlug }, ctx) {
    const node = await ctx.repo.get(id);
    await ctx.repo.put({ ...node, slug: newSlug });
  },
  // …
};
```

- Undo/Redo は Command スタックで
- AI Agent からも同じ Command を呼べる (UI と Agent で共通)
- コマンドパレット (`Ctrl+Shift+P`) からも

### 6.2 リアクティブな購読

SolidJS の Signal/Store を Service が公開:

```typescript
export class ProjectService {
  readonly nodes = createStore<Map<NodeId, INode>>(new Map());
  readonly relations = createStore<Map<RelId, Relation>>(new Map());
  // …
}
```

UI 側は `nodes()` を使うだけで自動再計算。

## 7. Unity ⇔ Web のブリッジ

### 7.1 HTTP API (簡易仕様)

Unity 側 BridgeServer の REST:

```
GET    /api/project                  プロジェクト概要を返す
GET    /api/files?glob=Nodes/**.yaml ファイル一覧
GET    /api/file?path=...            ファイル取得 (text/plain)
PUT    /api/file?path=...            ファイル書き込み
DELETE /api/file?path=...            ファイル削除
POST   /api/refresh                  AssetDatabase.Refresh()
GET    /api/sse/changes              Server-Sent Events で外部変更を通知

POST   /api/asset/import             ScriptableObject 再生成
GET    /api/asset/preview?id=...     生成済み Asset のメタ情報
POST   /api/runtime/play             プレビューランナー起動
```

トークン認証はローカル限定の場合 random secret を起動時生成し、URL に埋める。

### 7.2 SSE での変更通知

```
// Unity 側
EditorApplication.projectChanged += () => server.BroadcastChange(...);

// Web 側
const es = new EventSource("/api/sse/changes");
es.onmessage = e => loader.reload(JSON.parse(e.data));
```

### 7.3 動作モード

- **Bridge 必須モード**: Unity 内のアセットを編集 (Asset/Scenario 配下)
- **スタンドアロンモード**: 任意フォルダで作業、Unity 経由しない (Browser/Tauri)
- 両方を 1 アプリで扱う (起動時に切替)

## 8. オフラインと PWA

### 8.1 Service Worker

- Vite Plugin PWA で生成
- 戦略: **Stale-While-Revalidate** (静的アセット)、**Cache-First** (アイコン)
- HTML/JS が更新されたら次回起動で適用、トーストで通知

### 8.2 IndexedDB スキーマ

```
DB: actoratect-scenario
  store: project_handles    { id, name, lastOpened, fsHandle }
  store: app_settings        { key, value }
  store: ai_history          { id, ts, request, response, cost }
  store: layout              { hostId, json }
```

ストアごとにバージョニング & マイグレーション関数。

## 9. 性能

### 9.1 大規模

| 指標 | 目標 | 担保 |
|---|---|---|
| 起動 (ブラウザ既開) | 2 秒以内 | コード分割、遅延ロード |
| 起動 (新規ロード) | 5 秒以内 | キャッシュ、PWA |
| 1 万ノードロード | 5 秒以内 | Index キャッシュ |
| グラフ 500 ノード操作 | 60 fps | SolidFlow + LOD |
| グラフ 5,000 ノード | 30 fps | Sigma.js (移行) |
| 脚本 10 万行 | スクロール 60 fps | CodeMirror 6 + 仮想化 |
| 自動保存遅延 | 500ms | デバウンス |

### 9.2 メモリ

- ブラウザは 1〜2 GB 上限
- 本文は遅延ロード、サムネは LRU、Index 圧縮
- WebWorker に重い処理 (lint, search index) を逃がす

### 9.3 ビルドサイズ

- 初期バンドル: 1MB 未満を目標 (gzip)
- グラフライブラリ等は遅延チャンク
- アイコン/ローカライズも遅延

## 10. テスト戦略

### 10.1 単体 (vitest)

- Domain: Variant 解決、リレーション inverse、年齢計算
- YAML 往復 (parse → serialize → parse)
- Linter ルール (各ルール別)
- マイグレーション

### 10.2 結合

- Loader → Index → Service → Export
- フィクスチャ: `tests/fixtures/sample_project/`

### 10.3 UI (playwright)

- Smoke テスト: 起動、プロジェクト開く、ノード作成
- スナップショット (主要画面)
- マルチブラウザ (Chrome, Firefox, Safari)

### 10.4 性能ベンチ

- 起動時間
- 1万ノードロード
- グラフ FPS

### 10.5 Unity 側

- Bridge HTTP のテスト (Unity Test Framework)
- AssetPostprocessor の Snapshot

## 11. CLI モード

`packages/cli/` に Node ベース。Deno 互換も意識。

```
scenario validate
scenario lint --strict
scenario export <id>
scenario migrate
scenario stats
scenario diff <commit-a> <commit-b>
```

CI で実行可。GitHub Actions サンプル用意。

## 12. ロギング/エラー処理

- ブラウザ: `console` + IndexedDB に構造化ログ
- Tauri: Rust 側 `tracing` + ファイル
- Unity: `Debug.Log` + Editor Console
- 共通: 重大エラーをユーザにトースト + Diagnostic Bundle 出力 (issue 報告用)

## 13. セキュリティ

ローカル/Tauri/Unity/SaaS の各環境を横断したセキュリティ詳細は **`16_security.md`** を参照。
本書では関連クラス/層を列挙するに留める:

| 項目 | 対策 (要約) | 詳細 |
|---|---|---|
| AI API キー (Browser) | IndexedDB + WebCrypto AES-GCM (パスフレーズ) | 16 §2.7 |
| AI API キー (Tauri) | OS キーチェーン (`keyring`) | 16 §3.1 |
| AI API キー (Unity) | OS キーチェーン経由 (Bridge HTTP で取得) | 16 §3.1 |
| Unity Bridge | localhost 限定 + ランダム HMAC token | 16 §4 |
| ローカルファイル書込み | Adapter で path traversal 検査 | 16 §4.3 |
| サードパーティ依存 | npm audit / cargo audit / Renovate | 16 §6 |
| CSP | strict CSP、`script-src 'self'` | 16 §2.1 |
| SaaS 認証 | OAuth + MFA + httpOnly Secure Cookie | 16 §5.1 |
| マルチテナント | DB row-level + R2 prefix 分離 | 16 §5.3 |
| 暗号化 | TLS 1.3 + at-rest SSE + 機密フィールドの追加暗号化 | 16 §5.4 |

## 14. 国際化 (UI 自体の i18n)

- 第一弾: 日本語、英語
- `i18next` でキー管理
- ライターの母語 ≠ 編集 UI 言語 はよくあるため、UI 言語切替は基本機能

## 15. 配布チャネル

| ターゲット | チャネル |
|---|---|
| Browser (Local-only) | Cloudflare Pages / GitHub Pages、独自ドメイン |
| Browser (SaaS)       | `scenario.actoratect.dev` (Cloudflare Workers) |
| Desktop              | GitHub Releases (msi/dmg/AppImage)、自動更新 |
| Unity                | Git URL (Package Manager) |
| CLI                  | npm registry (`@actoratect/scenario-cli`) |

## 16. SaaS バックエンド (Phase X / 棚上げ)

> Phase 0〜4 ではツールとしての完成度を最優先するため、SaaS 化は **棚上げ (Phase X)**。
> 本章は将来着手する際の接続イメージを残すスナップショット。詳細は **`17_saas.md`** (棚上げ扱い)。
> データモデル/Adapter は将来の SaaS 化に備えて拡張余地を残すが、Phase 4 までの実装には不要。

### 16.1 構成

```
Frontend (同じ TS バンドル)
   ↓ HTTPS
Cloudflare Workers (Hono) — Edge API
   ↓
Auth (Better Auth + WorkOS)
DB (Cloudflare D1)
Object Storage (R2)
Realtime (Durable Objects + Y-Sweet for Yjs)
Vector Search (Vectorize)
AI Proxy (server-side keys)
   ↓
External: Anthropic / OpenAI / Stripe / Resend / Sentry
```

### 16.2 Frontend からの接続

```typescript
// adapter-saas/  Phase 5+
export class SaaSAdapter implements FileSystemAdapter {
  constructor(private apiBase: string, private session: Session) {}
  async list(handle, glob) { return this.api(`/files?glob=${glob}`); }
  async read(handle, path) { return this.api(`/file?path=${path}`); }
  async write(handle, path, data) { return this.api(`/file?path=${path}`, { method: "PUT", body: data }); }
  // ...
}
```

`adapter-saas` を 5 番目の Adapter として追加。Browser/Tauri からも利用可能。

### 16.3 同期方式

- **Cloud-backed**: 通常 REST + SSE (バッチ同期)
- **Cloud-primary**: WebSocket + Yjs (リアルタイム共著)
- 詳細は 17 §3, §7

### 16.4 マルチテナント

- すべての DB アクセスに `tenant_id` を強制注入 (ORM ミドルウェア)
- R2 オブジェクトは `tenant/<id>/projects/<pid>/...`
- 詳細は 17 §5

### 16.5 AI Proxy

- ユーザの API キーをクライアントに返さない
- Server-side でリクエストを受け、Anthropic/OpenAI へ中継
- レスポンスをログに残しつつ、本文は秘匿
- 詳細は 16 §5.5, 17 §2.5

## 17. Unity 統合の極大化

Unity Editor との統合はクロスプラットフォーム前提を超えた **本ツール最大の差別化要因**。
詳細は **`18_unity-integration.md`**。アーキテクチャとの接続:

| 機能 | コンポーネント |
|---|---|
| Asset 自動生成 | `unity-package/Editor/ScenarioEditor/AssetPipeline/` |
| HTTP Bridge | `unity-package/Editor/ScenarioEditor/BridgeServer/` |
| Inspector / Search / Build | `unity-package/Editor/ScenarioEditor/{Inspector,Search,Build}/` |
| ランタイム | `unity-package/Runtime/ScenarioRuntime/` |
| AI 開発エージェント連携 | YAML 配布構造 + JSON Schema (08_file-format.md, 18 §6) |

## 18. 将来の道

- **モバイル閲覧** — PWA で iOS/Android 表示優先
- **DCC ツール連携** (Maya/Blender への素材リンク)
- **VSCode 拡張** (`.scn.yaml` 編集 + プレビュー)
- **マルチモーダル AI** (画像→キャラシート、音声→脚本) → 18 §14
- **ファインチューニング** (組織 IP 学習) → 17 Phase 7+
- **VR/AR 上の 3D 相関図** → 04_graph-editor.md §11
