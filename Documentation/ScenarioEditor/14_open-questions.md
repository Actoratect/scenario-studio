# 14. リスクとオープンクエスチョン

設計を進める前に、判断保留中・要検討の論点をリスト化。
**「なぜそう決めたか」が後で読み返せるよう、選択肢と現時点の暫定方針を記す。**

## 0z. 確定事項 (User decision log)

ユーザの意思決定により、以下を **確定** とする (2026-05 時点):

| 項目 | 決定 | 関連 |
|---|---|---|
| **言語選定** | TypeScript で 1 本化 (Web/Unity 両方の編集性が損なわれないことが条件) | Q-0A |
| **開発順序** | 設計者 (本ドキュメント執筆側) に一任。`13_roadmap.md` で確定 | Q-J* |
| **モノレポ化** | 2 リポジトリ分離 (`com.actoratect.editor-tools` + `scenario-studio`) で進める。当初の 1 repo モノレポ案から PoC-I で変更 | Q-J1, Q-J2 |
| **Browser ホスティング** | セキュリティを十分に詰めることを条件に方針一任 → `16_security.md` で詳細化 | Q-0G, Q-J3 |
| **SaaS 化** | **棚上げ (Phase X)**。Phase 0〜4 はツールとしての完成度を優先。需要確認後に着手判断。`17_saas.md` は将来資産として保持 | Q-J4 |
| **AI プロバイダ** | **特定ベンダーに固定しない**。Claude API / Claude Code (CLI) / Codex / OpenAI / Gemini / ローカル LLM (Ollama) などをプラグイン式に切替可能。抽象 (`LlmProvider` + `IAgentRunner`) で統一 | Q-F* |

> Unity の存在価値は **「画像/テキスト等のデータをゲーム実装にそのまま流用」** と **「開発側 AI エージェントがリポジトリ内テキストを読み書き」** にあると確認。これを最大化する設計を `18_unity-integration.md` に集約。
>
> 当面は **「ツールとして抜きん出る」** ことが目的。SaaS は Phase 4 1.0 完成後の選択肢として温存。

## 0. クロスプラットフォーム最大論点 (15_cross-platform.md と連動)

### Q-0A. UI 言語は TypeScript で 1 本化 (vs C# 共有)?

- **選択肢**:
  - (a) **TypeScript で 1 本** (現在の方針) — Browser/Tauri ネイティブ、Unity は WebView
  - (b) C# + Blazor で 1 本 — Unity と言語共通、ブラウザは WASM
  - (c) C# + Avalonia — Unity と言語共通、ブラウザサポートが新しめ
  - (d) UI を 2 系統 (TS Web + C# Unity UIToolkit) — 重複だが各環境で最適
- **暫定方針**: (a) TypeScript
- **理由**: ブラウザの第一級言語、エディタ系コンポーネントが圧倒的、Tauri との親和性
- **懸念**: Unity と言語が違うため、開発者の文脈切替コスト

### Q-0B. ブラウザ単独でどこまで動かす?

- **選択肢**:
  - (a) **完全ローカル実行** (現在の方針) — FS Access API + IndexedDB、サーバ不要
  - (b) 軽量バックエンド必須 (Cloudflare Workers 等)
  - (c) フル SaaS (認証 + クラウド DB)
- **暫定方針**: (a) ローカルで完結 (1.0 まで)、(b)(c) は Phase 4+
- **懸念**: Safari/Firefox は FS Access 未対応 → ZIP モードで吸収

### Q-0C. デスクトップは Tauri で確定?

- **選択肢**:
  - (a) **Tauri 2** — 軽量、Rust backend、最新
  - (b) Electron — 安定、エコシステム大、重い
  - (c) Wails (Go) — 軽量だが Rust より小さい
  - (d) Web のみ (デスクトップ版作らない、PWA でカバー)
- **暫定方針**: (a) Tauri 2
- **懸念**: Tauri 2 はまだ若い (2024/2025 で 2.0 stable)、コード署名フローの整備

### Q-0D. Unity との統合レベル

- **選択肢 (L1〜L3 の組み合わせ)**:
  - L1: 既定ブラウザ起動 (最小)
  - L2: Tauri アプリ起動 (Deep link)
  - L3: Editor 内 WebView 埋め込み
- **暫定方針**: MVP=L1、β=L2 追加、1.0=L3
- **懸念**: L3 は Vuplex 等の有償依存。社内ライセンス検討必要

### Q-0E. Unity Bridge HTTP はどこまで作り込む?

- **選択肢**:
  - (a) **シンプルな REST + SSE** (現在の方針) — ファイル CRUD と変更通知
  - (b) WebSocket フル双方向 — リアルタイム編集
  - (c) gRPC — 型安全だが重い
- **暫定方針**: (a)
- **懸念**: localhost ポート競合、Unity が落ちた時の挙動

### Q-0F. ブラウザの File System Access API、Safari/Firefox はいつ対応する?

- **背景**: 主要ブラウザのうち Safari と Firefox が長期未対応
- **対応**:
  - 現在: ZIP インポート/エクスポート + OPFS (スクラッチ) で凌ぐ
  - 中期: Chrome/Edge を「first-class」に位置づけ、ドキュメントで明示
  - 長期: 標準化を待つ
- **要監視**: WICG フォロー

### Q-0G. AI API キーのブラウザでの扱い

- **選択肢**:
  - (a) **ユーザ自身のキーを IndexedDB に**(現在) — シンプルだが漏洩リスクあり
  - (b) パスフレーズ暗号化 — 一段強化
  - (c) 軽量 backend で proxy — 一番安全だが SaaS 化必要
- **暫定方針**: MVP=(a) 警告あり、β=(b)、Phase 4=(c)

## A. 技術選定 (Web/Tauri/Unity 共通)

### Q-A1. ドッキングライブラリは Dockview で確定?

- **選択肢**:
  - (a) **Dockview** (現在の方針) — TS 製、active メンテ、Floating/Detach 標準
  - (b) Golden Layout — 歴戦、安定、TS バインディング
  - (c) rc-dock — React 専用 (SolidJS では使えない)
  - (d) 自前実装 — 完全制御だが工数大
- **暫定方針**: (a) Dockview
- **要検証**: PoC-A で SolidJS との組合せ感触

### Q-A2. グラフ描画ライブラリの選定

- **選択肢**:
  - (a) **SolidFlow / ReactFlow** (MVP) — 直感、〜500 ノード
  - (b) **Sigma.js + Graphology** (β/1.0) — 大規模、WebGL
  - (c) PixiJS 自前 — 超大規模、自由度最大、実装重い
  - (d) D3 + Canvas — 中庸
- **暫定方針**: MVP=(a)、性能限界を見て (b) へ移行計画
- **要検証**: PoC-B で 1,000 ノード fps 計測

### Q-A3. YAML パーサ — `yaml` (Eemeli) で十分?

- 候補: `yaml` / `js-yaml` / 自前
- **暫定方針**: `yaml` (Eemeli) — コメント保持と AST が必要なため
- **懸念**: 大量ファイルロード時の性能 → Worker 化で吸収

### Q-A4. Git 操作はどう実装?

- **選択肢**:
  - (a) **isomorphic-git** (Browser/Tauri/Unity すべて) — JS 実装、軽量
  - (b) Tauri は Rust の `git2`、Browser は ZIP のみ、Unity は CLI
  - (c) Git は使わずスナップショット機能を内包
- **暫定方針**: (a) isomorphic-git
- **要検証**: 大規模 Git 操作の性能

### Q-A5. UI フレームワーク — SolidJS か React か

- **選択肢**:
  - (a) **SolidJS** (現在の方針) — 細粒度反応、大量レンダに強い、エコシステム小
  - (b) React + Signals — エコシステム圧倒的、TanStack 等
  - (c) Svelte 5 — Runes (signal) 導入、安定
  - (d) Vue 3 — Composition API、幅広い
- **暫定方針**: (a) SolidJS
- **懸念**: 採用後 1 年経って人材が見つけにくい場合あり
- **代替案**: 最終決定は PoC-A 後

## B. データモデル

### Q-B1. 1 ノード=1 ファイル原則は妥当か?

- **賛**: Git 衝突最小化、AI に渡しやすい
- **反**: ファイル数膨大 (10,000 ファイル超)、OS のファイルシステム性能、ロード時間
- **代案**: バンドル単位 (templateId 別 1 ファイルにまとめ)
- **暫定方針**: 個別ファイル + Index で高速化。1万まで耐える計測を行う
- **要検証**: ストレージ性能

### Q-B2. Variant の上書きセマンティクスは?

- 「定義したフィールドのみ上書き」「null で継承」のどちらか
- 配列の継承は「全置換」「マージ」「キーマージ」のどれ?
- **暫定方針**: スカラーは上書き、配列は全置換、マップは shallow merge
- **懸念**: 「100年前は装備品が3つ → 現代は装備品なし」の表現

### Q-B3. リレーションは双方向か単方向か?

- (a) 単方向 + inverse 自動推論
- (b) 双方向、両端に存在
- **暫定方針**: (a)。inverse の関係型定義で対称化
- **懸念**: 「A は B を愛していたが B は A を恨んでいた」のような非対称

### Q-B4. 削除と"非アクティブ"の境界

- 「物理削除」「論理削除 (status=archived)」「Era で消える」をどう区別?
- **暫定方針**: 物理削除 + アーカイブステータス (両方提供)。Era 上の生死は変数で

## C. シナリオ階層

### Q-C1. plot.yaml は冗長?

- シーンメタを `_scene_index.yaml` だけにし、`plot.yaml` を消す案
- **暫定方針**: `plot.yaml` 廃止、`_scene_index.yaml` に集約
- **懸念**: アウトライナでだけ見たいケースの取り回し

### Q-C2. 脚本の DSL を独自に作る?

- (a) YAML ベース (本設計の暫定)
- (b) Fountain / Yarn / Ink 互換テキスト DSL
- (c) Markdown 拡張
- **暫定方針**: (a)。理由: スキーマが厳密で AI 生成しやすい
- **懸念**: 慣れたライターの抵抗。Fountain 風入力モード追加で吸収

### Q-C3. 分岐合流の表現

- ノベルゲーは「分岐 → 合流」が頻出
- グラフのフロー Lens で十分か、専用エディタが要るか
- **要検討**: articy:draft Flow と Yarn の両者を比較

## D. ウィンドウシステム

### Q-D1. Unity 標準のドッキングと干渉しないか

- ScenarioEditor のドッキングを Unity 内に置くと、ユーザは "Unity のドッキング" と "本ツールのドッキング" の二重を扱う
- **暫定方針**: 本ツールは Unity Editor Window 内で独立した世界。MVP は外部ブラウザ起動を主、L3 (WebView 埋め込み) で Unity 内一体化
- ナビゲーションが分かりやすければOK

### Q-D2. マルチモニタの取扱い

- Browser: Window Management API (Chrome のみ実験的)、`window.open` でも対応
- Tauri: ネイティブ複数ウィンドウ、各 OS 安定
- Unity: 単一プロセス、フローティング EditorWindow は OS 上で兄弟関係
- **暫定方針**: Tauri 主、Unity は L3 でカバー、Browser はベストエフォート

### Q-D3. ブラウザの `Ctrl+W` 等の予約キーとの衝突

- ブラウザがタブを閉じるショートカットと衝突
- **対応**: 本アプリ内では `Ctrl+F4` 等の代替既定、設定でカスタム可
- **要検討**: macOS の `Cmd+W` も同様、慣習をどうするか

## E. ローカライズ

### Q-E1. キーは ID 派生か手書きか

- (a) 自動 ID 派生 (本設計暫定): 行番号などから生成
- (b) ライターが命名 (`scenario.encounter.greeting`)
- **暫定方針**: (a) を既定、(b) を任意で
- **懸念**: (a) は再生成時の再キー化、(b) は重複/衝突

### Q-E2. 翻訳メモリの粒度

- 文単位 / 行単位 / 段落単位
- **暫定方針**: 行単位を基本、文単位はオプション
- 大規模 TM の検索性能

### Q-E3. Unity Localization 依存度

- 全機能を Unity Localization 上に作るか、独立した実装にするか
- **暫定方針**: 独立。Unity Localization へは export のみ

## F. AI

### Q-F1. AI 出力の権利

- AI 生成テキストの利用規約 (API プロバイダ別)
- 商用ゲームに搭載できるか
- **要対応**: ProjectSettings に「AI 利用ポリシー」項目、出力にメタ付与

### Q-F2. 機密情報の扱い

- 未公開シナリオを外部 API に送ることへの抵抗
- **対応**: ローカル LLM オプション、ノード単位の "AI 送信禁止" フラグ

### Q-F3. AI のコスト管理

- AI Linter を毎保存実行するとコスト爆発
- **対応**: デバウンス、変更ノードのみ、ローカル LLM フォールバック

### Q-F4. AI 提案の品質基準

- 「採用率」を継続計測してプロンプトを改善する仕組み
- 各機能ごとに目標採用率を設定する?

## G. パフォーマンス

### Q-G1. メモリ予算 500MB の現実性

- 1 万ノード + サムネ + 全シナリオ in-memory が乗るか
- **対応**: 本文は遅延ロード、サムネは LRU キャッシュ
- **要検証**: 実プロジェクトで計測

### Q-G2. グラフ描画 fps 目標

- 60 fps を目指すか 30 fps で妥協するか
- **暫定**: 操作中 30 fps、静止時 0 fps (再描画 trigger ベース)

## H. 連携・互換

### Q-H1. articy 移行パス

- 既存 articy ユーザの取り込み
- **対応**: articy XML インポータを Phase 3 で

### Q-H2. Scrivener 移行

- `.scriv` フォーマットインポート
- **対応**: Phase 3+ 検討

### Q-H3. Yarn / Ink からの逆インポート

- 既存 Yarn プロジェクトを取り込んで本ツールで管理
- **対応**: Phase 2 で簡易版

## I. UX

### Q-I1. キーバインド衝突

- Browser/Tauri/Unity それぞれの環境に予約キーがある
- 例: ブラウザ `Ctrl+W`/`Ctrl+T`/`F5`、Unity `Ctrl+S`、macOS `Cmd+Q` 等
- **対応**: パネルにフォーカスがあるときは独自ショートカット優先、設定でカスタム可
- **要検討**: 3 環境共通の既定セットを作る

### Q-I2. 縦書きの優先度

- 日本語小説/ライトノベル系では縦書き要望あり
- **暫定**: 1.0 以後

### Q-I3. オフライン・低スペック動作

- ノートPCでの開発でも動かしたい
- **対応**: AI なしで全機能動く設計を死守

## J. プロジェクト体制

### Q-J1. 既存パッケージとの関係

- `com.actoratect.editor-tools` 直下に組み込むか別パッケージか
- **暫定**: モノレポ化。`unity-package/` (現状の Unity 部) + `web/` (新規 TS)
- **判断材料**: 配布チャネルが分かれるためリポジトリ内で隣接が便利

### Q-J2. リポジトリのモノレポ化

- 現状: 単一 Unity パッケージリポジトリ
- 当初提案: `unity-package/` + `web/` の 2 ディレクトリ構成 (1 repo モノレポ)
- **確定 (Phase 0 PoC-I)**: **2 リポジトリ分離** に変更。Unity 側 = `com.actoratect.editor-tools` / TS 側 = `scenario-studio`。理由は配布チャネル分離 (UPM git URL vs npm/静的ホスト/GitHub Releases) と CI マトリクス分離。詳細は `12_architecture.md` §2

### Q-J3. オープンソース化?

- 公開でコミュニティに育ててもらう案
- **暫定**: 内製優先、Phase 3 後に検討
- **追加考慮**: Web 版は配布 URL を出すだけで多くの人が触れるので OSS 適性が高い

### Q-J4. 商用化?

- 有料パッケージ販売 / アセットストア / SaaS
- **暫定**: 当面なし、自社プロジェクトで使う
- **将来**: Phase 4+ でクラウドコラボの SaaS 化を検討する余地

## K. 既知のリスク

| リスク | 影響 | 対策 |
|---|---|---|
| Dockview の 3 ターゲット安定性 | 大 | PoC-A で早期検証、Golden Layout フォールバック |
| グラフ描画ライブラリが 10k で破綻 | 大 | MVP 後に Sigma.js 移行可能な抽象化、PoC-B |
| File System Access API のブラウザ非対応 | 中 | ZIP モード + Tauri 推奨で吸収、Chrome/Edge 主軸 |
| Tauri 2.x の OS 別 WebView 差異 | 中 | 各 OS で QA、AppImage/dmg/msi の自動更新検証 |
| Unity Bridge HTTP の安定性 | 中 | localhost ポート競合、ヘルスチェック、再接続 |
| YAML 大量ファイルがファイルシステム性能を圧迫 | 中 | Index 最適化、必要ならバンドル化 |
| Anthropic API 仕様変更 | 中 | Provider 抽象、SDK バージョン固定 |
| AI API キー漏洩 (ブラウザ) | 中 | 警告 + パスフレーズ暗号化 + Phase 4 で proxy |
| AI コストの非予期的肥大 | 中 | 予算上限、警告、ローカルフォールバック |
| ライターの学習コスト | 大 | チュートリアル、レイアウトプリセット |
| マルチモニタ対応の OS 差 | 中 | プラットフォーム別 QA |
| 翻訳ベンダーの対応形式 (XLIFF 方言) | 小 | フィードバック取り込みで漸進改善 |
| プロジェクト規模拡大時のパフォーマンス | 大 | Phase ごとに性能ベンチ |
| TS で書いたものを Unity ランタイムで動かしたくなった時の重複コスト | 中 | C# 側はあくまで消費レイヤに限定、Spec を YAML に書く |

## L. 解決済 / 残課題

### 解決済 (0z 章で確定)
- ✅ クロスプラットフォーム方針 (TypeScript で 1 本化)
- ✅ 開発順序 (設計者一任 → 13 章で確定)
- ✅ モノレポ化 (`unity-package/` + `web/`)
- ✅ ブラウザのセキュリティを十分詰めた上で公開 → 16_security.md
- ✅ SaaS 化は **棚上げ (Phase X)** → 17_saas.md は将来資産
- ✅ AI プロバイダは固定しない、抽象越しに何でも切替可能 (Claude / Claude Code / Codex / OpenAI / Gemini / Ollama)

### 残る次の意思決定ポイント (Phase 0 PoC 進行中に決定で間に合う)

1. **Unity Localization 連携の優先度** — 必須? 任意?
2. **ファイル分割粒度** — 1 ノード=1 ファイル原則を採用? バンドル形式オプションも併用?
3. **業界フォーマット互換** — Yarn / Ink / Fountain のうちどれを Phase 2 で優先?
4. **OSS 化の範囲** — Phase 4 までは完全 OSS で OK か? 将来 SaaS 着手時に Open Core への切替を許容するか?
5. **Unity 内 WebView 提供方針** — 有償 (Vuplex 等) を採用? 無償の WebView2 (Win 限定) で凌ぐ? L1 の外部ブラウザに留める?
6. **対象 Locale** — UI の i18n 第一弾は日英のみ? 中韓も?
7. **デフォルト AI モデル / 推奨設定** — 「初回起動時にどのモデルを推奨するか」のデフォルト

> SaaS 関連の意思決定 (価格戦略、ホスト国、OSS/プロプラ境界の最終形) は **Phase X 着手時に改めて決定**。今は不要。
