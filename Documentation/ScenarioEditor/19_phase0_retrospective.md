# 19. Phase 0 振り返り (PoC 完了レポート)

> 期間: 2026-05-03 (1 セッション集中) — 当初見積 1 ヶ月を圧縮
> ブランチ運用: 全 9 PoC を feature branch + PR + ruleset CI gate で運用 (PR #1〜#9)
> 設計上の Phase 0 ゴール `13_roadmap.md` は **すべて達成**

このドキュメントは Phase 1 着手前の **判断履歴の保全** が目的。各 PoC で
「何を作り、何を検証し、何を Phase 1 以降に積み残したか」を 1 箇所に集約する。

---

## 0. サマリ

### 達成

- 9/9 PoC マージ済 — `13_roadmap.md` Phase 0 タスクリスト完了
- TS 84 件 + Rust 4 件 = **テスト 88 件** が 3 OS マトリクスで pass
- frontend bundle: **gzip 194 KB** (目標 1 MB の 19% — 余裕あり)
- 設計書 4 章を実装結果で更新 (`00`/`04`/`12`/`13`/`14`)
- 2 リポジトリ分離・branch protection (ruleset)・auto-merge 運用が安定
- Rust toolchain (cargo + MSVC + WebView2) + Tauri 2 が手元 + CI 双方で動く

### 主要指標

| 指標 | 値 |
|---|---|
| PR 数 | 9 (#1 PoC-I 〜 #9 PoC-G) |
| マージ後 main commits | 17 |
| 全 PoC 累積コード追加行 | ~17,000 (内 Cargo.lock 4,612) |
| TS パッケージ数 | 8 (core / adapter ×4 / ui-kit / frontend / cli) |
| Rust crate 数 | 1 (`packages/tauri/`) |
| TS テスト件数 | 84 |
| Rust テスト件数 | 4 |
| frontend bundle size | 676 KB / **gzip 194 KB** |
| CI 必須 check | 3 (3 OS の typecheck+lint+test) |
| CI 任意 check | 3 (3 OS の cargo check+test) |

### 主要意思決定 (Phase 0 中に確定したもの)

1. **2 リポジトリ分離** — `com.actoratect.editor-tools` (Unity) + `scenario-studio` (TS) に分離。配布チャネルが UPM と npm/static/Releases で完全に異なるため。`12_architecture.md §2`
2. **glob ライブラリは入れない** — 自前 `compileGlob()` で `*` `**` `?` だけサポート。`Nodes/**/*.yaml` 程度の用途で picomatch を入れる価値が薄いため。`core/src/platform.ts`
3. **Provider 実装は SDK 不使用、fetch 直叩き** — Anthropic/OpenAI/Ollama の bundle サイズを抑え、ベンダーロックを物理的に防ぐ。`core/src/ai/providers/`
4. **Yjs を「ローカル Undo/Redo の中核」として早期採用** — Command スタックではなく Yjs UndoManager を主軸に。Phase X (SaaS) 展開時にそのまま WebSocket 同期できる構造。`core/src/history/`
5. **Tauri 2 は scaffold + Rust FS commands のみ** — production bundle (icon / signing / auto update) は Phase 3 に明確分離。
6. **Provider 抽象は 2 系統に分離** — `LlmProvider` (in-app API 直叩き) と `AgentRunner` (CLI 子プロセス委任) を別 interface に。Claude API と Claude Code CLI を同列に扱える。

---

## 1. PoC ごとの結果

### PoC-I: モノレポ構成 (PR #1)

**スコープ**: TS workspace 立ち上げ + 各パッケージ雛形 + ESLint + vitest + CI。

**作ったもの**:
- 7 パッケージ追加 (adapter ×4 / ui-kit / frontend / cli)
- `tsconfig` project references で依存方向を強制 (Core ← Adapter ← Frontend / CLI)
- ESLint v9 flat config + typescript-eslint + eslint-plugin-solid
- vitest + 1 件の smoke test
- `.github/workflows/ci.yml` (typecheck → lint → test → format:check)

**検証できたこと**:
- pnpm workspace + tsc -b + ESLint flat + vitest が 1 リポジトリで噛み合う
- `eslint-plugin-solid` が JSX 使用ファイルを scope してくれる

**設計逸脱 (同 PR で反映)**: 当初の 1-repo モノレポ案 → **2 リポジトリ分離** に変更。`12_architecture.md §2` / `00_README.md` / `14_open-questions.md` Q-J2 / `13_roadmap.md` を更新。

**Phase 1 持ち越し**: なし (基盤完了)。

---

### PoC-A: Vite + SolidJS + Dockview (PR #2)

**スコープ**: 3 パネル分割 / フロート / タブを持つ最小 SolidJS アプリ。

**作ったもの**:
- `packages/frontend` に Vite + SolidJS + dockview-core
- 初期レイアウト: Graph (中央) / Inspector (右) / Outline (下)
- 自前 `SolidPanelView` (Dockview の `IContentRenderer` を Solid `render()` でラップ — 公式 Solid binding が無いため)
- CI に `pnpm -F frontend build` 追加

**検証できたこと**:
- Dockview の split / float / タブ移動 が Solid アプリ内で動く
- `vite-plugin-solid` の transform、Solid JSX の lint
- `verbatimModuleSyntax: true` + `moduleResolution: Bundler` で extensionless TSX import が成立

**Phase 1 持ち越し**:
- 9 タブグリッド / Floating の固定プリセット (07_window-system.md §4.2)
- マルチモニタ (Window Management API) は Phase 3 (Tauri)

---

### PoC-C: 4 ターゲット FS Adapter (PR #3)

**スコープ**: Browser / Tauri / Unity / Node 共通の `FileSystemAdapter` interface + 各実装。

**作ったもの**:
- `core/platform.ts`: `FileSystemAdapter` interface (read / write / readBytes / writeBytes / list / exists / delete / watch) + `assertSafePath()` + 自前 `compileGlob()`
- adapter-node: `NodeFileSystemAdapter` 完全実装 + 10 件の contract test (tmpdir ベース)
- adapter-browser: `BrowserFileSystemAdapter` (FS Access API) + `createOpfsAdapter()` factory (Safari/Firefox 用)
- adapter-tauri: skeleton (invoke コマンド契約のみ) — PoC-G で Rust 実装
- adapter-unity: HTTP/SSE クライアント完全実装 — Bridge サーバ実体は Phase 2

**検証できたこと**:
- 4 ターゲットを 1 interface で抽象できる shape (read/write/glob/watch)
- Path traversal を「入口で拒否」する設計が TS と Rust の両方で同等に書ける
- Browser の `FileSystemDirectoryHandle.entries()` が lib.dom 未反映 → 自前 minimal type で補完

**Phase 1 持ち越し**:
- Browser adapter の watch を polling から FS Observer API へ切替判定
- Yjs と watch event の統合

---

### PoC-D: CodeMirror 6 脚本エディタ (PR #4)

**スコープ**: CodeMirror 6 + サムネ / 感情タグの inline widget。

**作ったもの**:
- `packages/frontend` に codemirror / @codemirror/state, view, commands, lang-yaml
- `createScriptEditor()` 関数 (lineNumbers + history + yaml + lineWrapping)
- `scriptInlineWidgets` ViewPlugin:
  - `who: <slug>` の前に CharacterThumbnailWidget (slug ハッシュ → HSL 色 → 同じキャラ常に同色)
  - `emotion: <tag>` の前に EmotionTagWidget (5 emotion カラー + 未知 emotion はグレー fallback)
  - `side: -1` で text を消さず前置 — YAML はそのまま編集可能
- App.tsx に 4 タブ目として ScriptPanel 登録 (Outline と同 TabSet)

**検証できたこと**:
- CodeMirror 6 を Solid panel 内に mount/destroy できる
- ViewPlugin + Decoration.widget で軽量に inline UI を載せられる
- bundle 484 KB (gzip 145 KB) — CodeMirror 一式で +315 KB / gzip +104 KB

**Phase 1 持ち越し** (実装本体):
- Smart / Fountain-like / Block / Raw YAML の 4 入力モード切替
- 文字数バッジ + 制限超え赤色化
- 用語集自動リンク (固有名詞 hover)
- 改訂モード (青稿 / 赤稿差分) は Phase 3
- `choice` / `sfx` / `bgm` 等への inline widget 拡張

---

### PoC-F: AI Provider 抽象 (PR #5)

**スコープ**: `LlmProvider` + `AgentRunner` の 2 系統抽象、3 Provider 実装、CLI runner。

**作ったもの**:
- `core/ai/types.ts`: `LlmProvider` / `AgentRunner` interface + `LlmProviderRegistry` / `AgentRunnerRegistry` (用途別 default 切替対応)
- 3 Provider 実装 (SDK 不使用、fetch 直叩き):
  - **AnthropicProvider** — Messages API + SSE streaming 完全実装
  - **OpenAiProvider** — Chat Completions、baseUrl 差し替えで OpenAI 互換 (Mistral/Groq/vLLM) も対応
  - **OllamaProvider** — `/api/chat`、オフライン LLM 完結
- `adapter-node` に `CliAgentRunner` (claude/codex/aider 互換)
  - `buildArgs` で各 CLI ごとの引数組立を差し替え可能
  - shell オプション (Windows .cmd shim 用、デフォルト false で安全)
- vitest 20 件 (registry 9 + Anthropic 5 + Ollama 3 + CliAgentRunner 3)

**検証できたこと**:
- 1 つの interface で 3 ベンダー API を抽象できる
- SSE streaming は fetch + ReadableStream で SDK 不要に書ける
- Symbol-based origin 比較で「local 操作 vs remote applyUpdate」を区別可能
- CLI runner で実子プロセスを起動・stdout/stderr 収集・exitCode 取得が Node 標準で十分

**Phase 1 持ち越し**:
- Anthropic tool_use / OpenAI function calling / Ollama format=json による structured output
- OpenAI / Ollama の streaming (SSE / NDJSON)
- AgentRunner の patches 抽出 / branch 作成 / PR 連動
- AI 設定 UI (`ProjectSettings.yaml` の `ai` セクション)
- プロンプトキャッシュ (Anthropic `cache_control`)
- コスト管理ダッシュボード

---

### PoC-B: 大規模グラフベンチ (PR #6)

**スコープ**: SolidFlow vs Sigma.js を同一合成グラフで mount 時間 + idle FPS 比較する harness。

**作ったもの**:
- `bench/generateGraph.ts`: 決定論的 PRNG (Mulberry32) で N ノード + 約 2N エッジを sqrt(N) クラスタに分布
- `bench/measureFps.ts`: rAF ベースで avg / max / p99 frame time を測定
- `SolidFlowRenderer.tsx` (`solid-flow@1.0.4` community 版)
- `SigmaRenderer.tsx` (`sigma@3` + `graphology@0.26`、labelDensity 絞り)
- `BenchmarkPanel.tsx` を 5 タブ目に登録

**検証できたこと**:
- 2 ライブラリを差し替え可能な panel 構造で比較できる
- bundle 676 KB / gzip 194 KB (CodeMirror + Solid + Dockview + Sigma + Graphology + solid-flow)

**Phase 1 持ち越し**:
- マルチプロジェクト想定の実データでの再ベンチ (10k ノード等)
- 動的 import 分割 (BenchmarkPanel 含む) で初期 bundle を絞る (Vite が 500KB 警告を出し始めたため)
- Lens 切替 / Force-directed layout (graphology-layout-forceatlas2 を入れただけで未配線)
- マウス/キーボード操作中の FPS 計測 (現状は idle のみ)

**懸念**: `@xyflow/solid` (公式 SolidJS バインディング) は npm 未公開で `solid-flow` (community) を採用。Phase 1 で SolidFlow 公式版が出れば差し替え検討。

---

### PoC-E: Era Variant 解決 (PR #7)

**スコープ**: ノードの時代差分 (NodeVariant) を Era 階層に従って解決するロジック。

**作ったもの**:
- `core/domain/era.ts`: `EraId` / `NodeId` branded types、`buildEraIndex()` で `ancestorsOf(id)` を高速化、循環検知 (`CircularEraHierarchyError`)
- `core/domain/node.ts`: `ScenarioNode` + `NodeVariant` + 型付き `FieldValue`
- `core/domain/variant.ts`: `resolveNode(node, targetEraId, eraIndex)`
  - 祖先列を root → target で並べ、該当 variant を順に重ね適用
  - `thumbnail` / `isAlive` は最も specific な non-null 値が勝つ
  - `fields` は per-key で `mergeField()`: **配列 全置換 / レコード shallow merge / スカラー 上書き**
  - `isAlive: null` で「親 Era から継承」を表現
- vitest 23 件 (era 7 + variant 16)

**確定した方針** (`14_open-questions.md` Q-B2 → 設計書反映):
- 14 Q-B2 の暫定方針 (スカラー上書き / 配列全置換 / マップ shallow merge) を **正式採用**
- 親 Era の variant は子 Era から継承される
- 異 era 系統 (`era.young` vs `era.elder` のような兄弟) の variant は干渉しない

**Phase 1 持ち越し**:
- YAML ↔ ScenarioNode parser/serializer (Eemeli yaml で AST 保持)
- Era スライダ UI (グローバルツールバー)
- ProjectModel への組込み + Variant 切替が UI 全体に伝播する Signal/Store
- A/B 比較モード (2 Era 同時 resolve)
- Variant Linter (未参照 variant、親 Era 不在)

---

### PoC-H: Yjs CRDT (PR #8)

**スコープ**: Yjs を「ローカル Undo/Redo の中核」として実証。Phase X SaaS への布石。

**作ったもの**:
- `core/history/NodeFieldStore`: Y.Doc + Y.Map + UndoManager の最小ラッパ
  - `set` / `delete` / `batch` / `undo` / `redo`
  - `markUndoBoundary()` — UI 側で明示的な undo step 境界を打てる (captureTimeout 既定 500ms の grouping を制御)
  - `observe(callback)` — local / remote の origin を区別して通知
  - `applyUpdate` / `encodeState` — 将来の SaaS 同期 / マルチタブ Y.Update 受け渡し
  - **初期 fields は seedOrigin で投入** → 起動直後の Ctrl+Z で空マップに戻る事故を防止
- vitest 12 件

**検証できたこと**:
- 「タイピング中は 1 step、フォーカス変更で boundary」が `markUndoBoundary()` で実現できる
- remote 由来の applyUpdate は origin で区別でき、誤って undo されない
- 初期 seed を undo 対象から外す seedOrigin パターンが機能する

**Phase 1 持ち越し**:
- ProjectModel との配線 (現状はノード単位の独立 store)
- Phase 3 で Tauri マルチウィンドウ間の同期 (BroadcastChannel + Y.Update)
- Phase X (SaaS) で Y-Sweet / WebSocket 同期
- IndexedDB 永続化 (`y-indexeddb` プラグイン)

**learning**: 初版は `b = new NodeFieldStore({ x: 1 })` で両 store を seed していたため、Y.Doc の client ID 差で conflict resolution が非決定 (Win では a 勝ち、Ubuntu では b 勝ち) → CI failure。SaaS 同期のリアル想定通り、b は空 store にして a から sync させる構成が正しいテスト。**Y.Doc のマージは「seed → applyUpdate で sync」の片方向で組むのが原則**、と Phase 1 設計に持ち越し。

---

### PoC-G: Tauri 2 scaffold + Rust FS commands (PR #9)

**スコープ**: Tauri 2 の Rust 側 scaffold、adapter-tauri (TS) が呼ぶコマンド完全実装、CI に Rust ジョブ追加。

**作ったもの**:
- `packages/tauri/`:
  - `Cargo.toml`: tauri 2 / tauri-build / serde / glob; release profile = LTO + opt-level "s" + strip
  - `tauri.conf.json`: beforeDevCommand / devUrl / 厳格 CSP / icon list
  - `capabilities/default.json`: core / window / webview の最小 capability
  - `src/main.rs + src/lib.rs` (Windows GUI バイナリ、コンソール非表示)
  - `src/fs_commands.rs`: `ss_fs_register / list / read / read_bytes / write / write_bytes / delete / exists` Rust 実装
    - `assertSafePath()` の Rust 版 (TS 側と同等の防御)
    - `FsHandles<Mutex<HashMap<String, PathBuf>>>` で handle.id → 絶対パスを管理
    - cargo test 4 件 (path traversal / 絶対 / drive / バックスラッシュ / null byte)
- `tauri-cli icon` で desktop 用 PNG / ICO / ICNS を生成 (placeholder の cyan "S")
- `.github/workflows/ci.yml` に `tauri rust check + test` ジョブ (3 OS マトリクス) を追加
  - Linux は WebKitGTK + ayatana-appindicator 等の system lib を apt install
  - `dtolnay/rust-toolchain@stable` + `Swatinem/rust-cache@v2` で warm cache

**検証できたこと**:
- Rust toolchain (cargo + MSVC linker) が手元 + 3 OS CI で揃う
- TS 側 `assertSafePath()` と同じセマンティクスを Rust で再現できる
- `tauri-cli icon` で 1 source PNG から全プラットフォーム icon が出る

**Phase 3 持ち越し** (PoC-G の本来の「配布フロー」部分):
- 実機 `cargo tauri build` (msi / dmg / AppImage 生成)
- Code signing (Win Authenticode / macOS notarization / Linux 署名)
- Auto update (`tauri-plugin-updater` + Ed25519 署名 + GitHub Releases endpoint)
- `tauri-plugin-dialog` (フォルダピッカー)
- `tauri-plugin-shell` (CliAgentRunner の Tauri 版バインディング)
- 正式 brand icon

---

## 2. 横断的な findings

### 2.1 Bundle size の trajectory

| PoC | bundle (gzip) | 増分 | 主因 |
|---|---|---|---|
| PoC-A | 41 KB | +41 | SolidJS + Dockview |
| PoC-D | 145 KB | +104 | CodeMirror 6 + lang-yaml |
| PoC-B | 194 KB | +49 | sigma + graphology + solid-flow |
| 目標 (12 §9.3) | 1024 KB | — | 1 MB 未満 |

→ Phase 1 着手時点で **目標の 19%** に収まっており余裕。Vite の 500 KB 警告が出始めたので、Phase 1 中に **動的 import 分割** で BenchmarkPanel / ScriptPanel をルート分離する判断は早めに入れる。

### 2.2 CI / Branch protection / Auto-merge

- 当初 ruleset は **enforcement=disabled + target branches=空** で作成され、CI gate が効いていなかった (PR #2 / #3 / #4 が即マージされた)
- 修正後 (`enforcement=active` + `~DEFAULT_BRANCH` + 3 OS 必須 check + repo 設定で `Allow auto-merge`) で **PR #5 以降は CI 完了待ち + 自動マージ + branch 削除** が完全動作
- Rust CI ジョブ (PR #9 で追加) は今は ruleset の required checks に未追加。Phase 1 中に required に格上げ判断

### 2.3 Auth 運用

- OAuth (`gh auth login --web`) は所属全 org への full repo アクセスを与え、自動化用には過剰権限
- **Fine-grained PAT を `Actoratect/scenario-studio` 1 リポジトリに scope** + Contents/PR/Workflows: write + Metadata: read で運用に切替済
- トークンを transcript に貼ると消すしかなくなる → `gh auth login` の対話で「Paste an authentication token」を選ぶフローが安全

### 2.4 設計と実装の差分管理

`CLAUDE.md` ルール「設計から外れる判断は同コミットで設計書を更新」を全 PoC で実行。具体的に更新したのは:

- `00_README.md` — 2 リポジトリ分離
- `04_graph-editor.md` — PoC-B harness の運用方針
- `12_architecture.md` — 2 リポジトリ構成、Adapter interface 確定状態
- `13_roadmap.md` — 全 PoC を `[x]` + 各 PoC で実装した範囲・残課題
- `14_open-questions.md` — Q-B2 / Q-J2 を確定事項に格上げ

---

## 3. Tech stack: 設計候補 → 確定状態

| レイヤ | 設計候補 | 採用 | PoC で実装 | Phase 1 で本格化 |
|---|---|---|---|---|
| UI フレームワーク | SolidJS / React+Signals / Svelte / Vue | **SolidJS** | A, D, B | 全 panel |
| バンドラ | Vite | **Vite 5** | A | dev/build pipeline |
| ドッキング | Dockview / Golden Layout / 自前 | **dockview-core 4** + 自前 SolidPanelView | A | フロート / 9 タブグリッド |
| 脚本エディタ | CodeMirror 6 | **CM6 + @codemirror/lang-yaml** | D | Smart 入力モード |
| グラフ (MVP) | SolidFlow / ReactFlow | **solid-flow 1.0.4 (community)** | B | Relationship Lens |
| グラフ (β/1.0) | Sigma.js + Graphology | **sigma 3 + graphology 0.26** | B | 5,000 ノード移行 |
| YAML | yaml (Eemeli) | (未着手 — Phase 1 採用予定) | — | parser/serializer |
| Git | isomorphic-git | (未着手 — Phase 3) | — | コラボ準備 |
| CRDT | Yjs | **yjs 13** (UndoManager + Y.Map) | H | ProjectModel 統合 |
| LLM (Anthropic) | @anthropic-ai/sdk | **fetch 直叩き** (SDK 入れず) | F | tool_use / cache_control |
| LLM (OpenAI) | openai sdk | **fetch 直叩き** | F | streaming / function calling |
| LLM (Ollama) | ollama JS client | **fetch 直叩き** | F | NDJSON streaming |
| Agent CLI | claude / codex / aider | **CliAgentRunner** (汎用) | F | patches 抽出 |
| FS (Browser) | FS Access API + OPFS | **両対応** | C | watch 戦略再評価 |
| FS (Node) | fs/promises | **NodeFileSystemAdapter** | C | CLI 利用 |
| FS (Tauri) | invoke + Rust | **`ss_fs_*` 8 commands** | G | dialog plugin |
| FS (Unity) | HTTP/SSE Bridge | **TS クライアント完了** | C | C# サーバ (Phase 2) |
| Desktop | Tauri 2 | **scaffold + Rust commands** | G | build + signing + updater |
| テスト | vitest | **vitest 2** + cargo test | 全 PoC | jsdom 追加判断 |
| Linter | ESLint flat | **ESLint 9 + typescript-eslint + solid plugin** | I | 強化 |
| Formatter | Prettier | **Prettier 3** | I | — |

### Phase 1 で **新規** に入る予定のもの

- `yaml` (Eemeli) — AST 保持で comment 往復可能性を持つ parse/serialize
- `immer` — immutable update のため (12 §5.1)
- `ulid` — NodeId 生成 (12 §5.2)
- `i18next` — UI 自体の i18n
- `papaparse` — CSV (Localization)
- `vite-plugin-pwa` — PWA / Service Worker
- `@solidjs/router` — URL ルーティング

### 入れない方針 (確定)

- React (Solid を採用済)
- Webpack (Vite で十分)
- 任意の AI SDK (fetch で代替、Provider 実装ファイルだけが SDK を持てるルール)
- グローバル picomatch (`compileGlob()` 自前)

---

## 4. Open questions の更新

### 解決済 (Phase 0 内で確定)

- ✅ Q-A1 ドッキング: Dockview で確定 (PoC-A)
- ✅ Q-A2 グラフ: MVP=solid-flow / β=sigma — harness 完成 (PoC-B)
- ✅ Q-A5 UI フレームワーク: SolidJS で確定 (PoC-A 体感良好)
- ✅ Q-B2 Variant マージ: スカラー上書き / 配列全置換 / レコード shallow merge (PoC-E で実装)
- ✅ Q-J2 モノレポ: 2 リポジトリ分離 (PoC-I)
- ✅ Q-F* AI プロバイダ: 抽象越しに切替可能 (PoC-F で実装)

### 残る次の意思決定 (Phase 1 着手中に決定で間に合う)

`14_open-questions.md` L 章の未決事項のうち、Phase 1 で当面影響が大きいもの:

1. **ファイル分割粒度** (L-2): 1 ノード = 1 ファイル原則を採用? バンドル形式オプションも併用?
2. **対象 Locale** (L-6): UI の i18n 第一弾は日英のみ? 中韓も?
3. **デフォルト AI モデル** (L-7): 「初回起動時にどのモデルを推奨するか」のデフォルト
4. **Browser watch 戦略** (PoC-C で発生): polling のままで Phase 1 リリース? FS Observer API が来たら切替?

### Phase 1 中に判断不要 (Phase 2+)

- L-3 業界フォーマット互換 (Yarn / Ink / Fountain) — Phase 2 で 1 つ選定
- L-4 OSS 化範囲 — Phase 4 完了時に判断
- L-5 Unity 内 WebView 提供方針 — Phase 4 で L3 評価時に

---

## 5. Phase 1 着手前のチェックリスト

- [x] Phase 0 全 PoC マージ済
- [x] CI gate (3 OS × 2 ジョブ) 動作
- [x] Auth 運用 (fine-grained PAT) 確立
- [x] 設計書と実装の不整合なし (PoC ごとに同コミット更新)
- [ ] Phase 1 実装計画書 → `20_phase1_implementation_plan.md` で詳細化
- [ ] Phase 1 着手用 milestone branch 命名規則決定 (例: `phase1/m1-project-shell`)
- [ ] CI 必須 check に `tauri rust check + test (3 OS)` を追加するか判断
- [ ] L-2 / L-6 / L-7 / Browser watch 戦略の意思決定

---

> Phase 1 の詳細実装計画は `20_phase1_implementation_plan.md`。
