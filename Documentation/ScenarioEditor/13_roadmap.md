# 13. ロードマップ

## 方針 (確定)

- **当面はツールとしての完成度を最優先**。SaaS 化は需要が見えてから着手する選択肢として温める (Phase X として棚上げ; `17_saas.md` は将来資産として維持)
- **AI プロバイダは特定ベンダーに固定しない**。Claude API / Claude Code / Codex / OpenAI / Gemini / ローカル LLM (Ollama) などを抽象越しに切替可能
- ライター 1 人がドッグフードできる最小サイズを **MVP**、小規模チーム運用が **β**、ゲーム会社運用が **1.0**、その後の **5+** で深掘りを継続

```
Phase 0: 設計・PoC                  ← 今ここ
Phase 1: MVP (Browser standalone)
Phase 2: Unity 連携 (Bridge + Asset)
Phase 3: β (Tauri + 機能拡張)
Phase 4: 1.0 (本番投入品質)
Phase 5+: 深掘り / 機能拡張 (継続)
─────────────────────────────────
Phase X: SaaS 化  [棚上げ]  需要確認・意思決定後に着手
```

## 開発順序の根拠

1. **Web (Browser) を最初** — UX を最速で検証、誰でも触れる、Unity 不要
2. **Unity を 2 番目** — Web の MVP が安定したら、Unity の **キラー価値** (Asset 流用 + 開発側 AI) を載せる
3. **Tauri は 3 番目** — Web/Unity が固まれば、Tauri は同じバンドルを wrap するだけ
4. **β/1.0 でドッグフードと品質固め** — 内部+少数顧客で本番投入耐性を作る
5. **Phase 5+ で深掘り** — 機能の隅々まで磨く。AI/業界フォーマット完全対応/縦書き/プラグイン機構など、ツールとして「他に並ぶものがない」状態を狙う
6. **SaaS は Phase X として棚上げ** — Phase 4 1.0 達成後、市場/顧客需要を確認してから着手の判断

→ Unity が後回しに見えるが Phase 2 で本格対応する。Unity 価値を完成形に見せるため、Web の安定性が前提。

---

## Phase 0: 設計・PoC (1 ヶ月)

### ゴール
- 設計書セット (本ドキュメント) を確定
- 実現性を PoC で潰す
- 採用ライブラリの最終選定
- モノレポ初期化

### タスク
- [x] 設計ドキュメント全体
- [x] クロスプラットフォーム戦略 (`15_cross-platform.md`)
- [x] セキュリティ設計 (`16_security.md`)
- [x] Unity 統合方針 (`18_unity-integration.md`)
- [x] SaaS 方針 (`17_saas.md`、棚上げ扱い)
- [x] **PoC-A: Vite + SolidJS + Dockview** — 3 パネル分割/フロート/タブ。`packages/frontend` に最小実装 (Graph / Inspector / Outline)。Solid と Dockview の橋渡しは自前 `SolidPanelView` adapter (公式は React/Vue のみ)
- [ ] **PoC-B: 大規模グラフ描画** — SolidFlow → Sigma.js 比較ベンチ
- [x] **PoC-C: 3 ターゲット FS Adapter** — Browser/Tauri/Unity + Node 共通インターフェイス。`@scenario-studio/core` に `FileSystemAdapter` interface + path-traversal guard + 自前 glob を配置。Node 実装は完成 (vitest で contract test)、Browser は FS Access API + OPFS fallback を実装、Tauri は PoC-G で Rust コマンド接続予定の skeleton、Unity は HTTP/SSE クライアントを完成 (Bridge サーバ実体は Phase 2)
- [x] **PoC-D: CodeMirror 6 で脚本エディタ** — サムネ/感情タグの inline widget。`packages/frontend` に `createScriptEditor()` + `scriptInlineWidgets` ViewPlugin を実装。`who: <slug>` をハッシュ色付き丸ピル、`emotion: <tag>` を色付きバッジに置換 (text は保持、widget は side: -1 で前置)。Smart 入力モード / 文字数バッジ / 改訂モードは Phase 1 で追加
- [ ] **PoC-E: Era Variant 解決**
- [ ] **PoC-F: マルチ AI プロバイダ抽象** — Claude API / Codex / Ollama を 1 抽象で切替
- [ ] **PoC-G: Tauri ビルドと配布フロー** — code sign、auto update
- [ ] **PoC-H: Yjs CRDT** (棚上げ Phase X への布石、ローカルでも有用な Undo/Redo として活用)
- [x] **PoC-I: モノレポ構成** — TS 側 (本リポジトリ) を pnpm workspace で立ち上げ。Unity 側は別リポジトリ (`com.actoratect.editor-tools`) と 2-repo 分離 (詳細: `12_architecture.md` §2)

### 成果
- 設計の妥当性レポート
- 技術選定の確定
- 「動く 3 ターゲット雛形」(リポジトリ初期化済)

---

## Phase 1: MVP (3〜4 ヶ月)

「ライター 1 人が Browser で新規プロジェクトを使える」最小機能。

### スコープ

#### コア
- [ ] プロジェクト作成 / 開く / 保存 (Browser FS Access)
- [ ] テンプレート (Character / Location / Item / Faction の 4 つ)
- [ ] ノード CRUD (Inspector パネル)
- [ ] サムネ画像登録
- [ ] 基本的なリレーション (型は固定 5 種)
- [ ] **GraphView (Relationship Lens のみ)** + ズーム/パン/選択/編集
- [ ] **シナリオ階層** (章/シーン)
- [ ] **脚本エディタ** (Smart 入力モード) — サムネ＋名前表示、感情タグ、選択肢
- [ ] **あらすじ Markdown エディタ**
- [ ] **基本ドッキング** (Dockview)
- [ ] **YAML 永続化** + 起動時ロード
- [ ] 用語集 (基本)
- [ ] Lint (参照整合性、孤児)
- [ ] PWA 対応 (Service Worker、オフライン起動)
- [ ] CSP / SRI / 入力サニタイズ (`16_security.md` §2)
- [ ] CLI モード (validate, export 雛形)

#### Browser
- [ ] FS Access API (Chrome/Edge)
- [ ] OPFS フォールバック (Safari/Firefox は ZIP インポート/エクスポート)
- [ ] URL ルーティング、状態復元
- [ ] PWA インストール

#### AI (マルチプロバイダ前提)
- [ ] AI 補完 (1 行続き提案)
- [ ] **`LlmProvider` 抽象** で Claude API / OpenAI / Ollama / Codex (CLI) を切替可能
- [ ] パスフレーズ暗号化 API キー保管
- [ ] 「Show prompt」可視化

#### Won't have (後で)
- Unity 連携 (Phase 2)
- Tauri 配布 (Phase 3)
- カンバン / 進捗ダッシュボード
- ビートシート (テンプレ提供だけ)
- Plot Flow Lens
- 改訂モード
- AI Linter
- マルチウィンドウ

### 完了条件
- ライター 1 人が「設定資料 50 ノード、シーン 30、脚本 5,000 行」のプロジェクトを 2 週間ドッグフードして問題なく動く
- Browser (Chrome/Edge) で快適動作
- 起動時間: PWA 既開時 2 秒、初回 5 秒
- セキュリティ基本セットが本番品質
- 自動保存安定

---

## Phase 2: Unity 連携 (2〜3 ヶ月)

「Unity プロジェクトに本ツールを組み込み、Asset 自動生成・開発側 AI と連携できる」

### スコープ

#### Unity Bridge
- [ ] HTTP Bridge Server (`InitializeOnLoad`)
- [ ] localhost 限定 + ランダムシークレット (`16_security.md` §4)
- [ ] SSE で外部変更通知
- [ ] Unity Editor menu (`Window > Actoratect > Scenario Editor`) で web 版を開く (L1)
- [ ] Bridge 経由のファイル CRUD

#### Asset Pipeline
- [ ] AssetPostprocessor → ScriptableObject 生成 (4 テンプレ分)
- [ ] MediaImporter (PNG → Sprite, WAV → AudioClip 自動設定)
- [ ] StringTable 生成 (Unity Localization 連携)
- [ ] Hot Reload (Play 中の差替え)

#### Inspector / Search
- [ ] CharacterAsset / SceneAsset の Inspector 拡張
- [ ] 「Open in Scenario Editor」ボタン
- [ ] Find Usages (キャラ → 出演シーン)
- [ ] Unity Search Provider 登録

#### ランタイム
- [ ] ScenarioPlayer (Coroutine ベース最小実装)
- [ ] Variable / Choice / Branch
- [ ] サンプル ADV 1 本 (Samples~)

#### Build
- [ ] BuildValidator (シナリオ Lint をビルド前実行)

#### 開発側 AI 統合 (キラー機能)
- [ ] 全 YAML を Claude Code / Cursor / Codex / Aider などが直接読み書きできる構造に最適化
- [ ] JSON Schema 配布 (`*.schema.json`)
- [ ] AI Agent 用 CLI (`scenario-cli ai-context`)
- [ ] Unity スクリプトとの相互参照 (どの C# が character.tarou を参照しているか)

### 完了条件
- 既存 Unity プロジェクトに Package Manager 経由で導入し、5 分で動き始める
- ライター/エンジニアが分業して 1 章を完成させる
- Hot Reload が安定動作
- Claude Code / Cursor / Codex のいずれでも YAML を編集すれば Unity Asset が更新される

---

## Phase 3: β (4〜5 ヶ月)

「小チーム (2〜5 人) が分担して Browser/Tauri/Unity を使える」状態。

### 追加機能

#### Tauri Desktop
- [ ] Tauri 2 ベース、Win/macOS/Linux
- [ ] OS キーチェーン連携 (AI キー、`16_security.md` §3)
- [ ] ファイル監視 (notify)
- [ ] Deep link (`actoratect://`)
- [ ] 自動更新 (Ed25519 署名)
- [ ] 配布: GitHub Releases

#### コラボレーション (Local + Git)
- [ ] Git 衝突回避を意識した分割粒度の最適化
- [ ] 「外部編集の検知」と再ロード
- [ ] スナップショット (1 ファイル単位の履歴)
- [ ] コメント / メンション (ローカルファイル内)
- [ ] レビュー用「読み取り専用エクスポート」(ZIP + 静的 HTML)

#### 編集機能拡張
- [ ] 残りのテンプレート (Event / Concept / Species / Vehicle / Language)
- [ ] **複数ノード同時編集**
- [ ] **コルクボード** (Plot Board) + ドラッグ並べ替え
- [ ] **アウトライナ** (章/シーン階層表示)
- [ ] **改訂モード** (色分け差分)
- [ ] **集中モード**
- [ ] コマンドパレット (Ctrl+Shift+P)

#### グラフ拡張
- [ ] Lens 切替 (Relationship/Faction/Location/Plot Flow の 4)
- [ ] フィルタ DSL
- [ ] レイアウト保存
- [ ] Mini-map 安定化
- [ ] 必要に応じて Sigma.js 移行

#### 時間軸拡張
- [ ] 階層 Era / 並行 Era
- [ ] **A/B 比較モード** (2 Era 並列)
- [ ] 独自カレンダー (1 種)
- [ ] 年表ビュー (ガント)

#### ローカライズ
- [ ] 翻訳テーブル (n 言語)
- [ ] 翻訳メモリ
- [ ] AI 一括翻訳 (任意プロバイダ)

#### AI
- [ ] AI Linter (整合性チェック)
- [ ] 続きの提案 + 言い換え
- [ ] 用語誤用検出
- [ ] **Claude Code / Codex CLI 統合** — エディタ内から `claude code` / `codex` などのエージェントを起動して PR ベース修正

#### エクスポート
- [ ] Yarn / Ink エクスポータ (1 つ選定)
- [ ] CSV 収録台本
- [ ] PDF 脚本
- [ ] 設定資料集 Markdown / 静的 HTML

#### Unity 連携深化
- [ ] L2 動作: Tauri 自動検出して `actoratect://` で起動
- [ ] AssetPostprocessor で ScriptableObject 全テンプレ対応
- [ ] Bridge HTTP のセキュリティ強化 (token、CORS)
- [ ] Find Usages 全対応
- [ ] Cinemachine/Animator/Visual Scripting 連携 (1 種類試作)

#### マルチウィンドウ (限定的)
- [ ] Tauri マルチウィンドウ (副ウィンドウへパネル切離)
- [ ] BroadcastChannel ベースのウィンドウ間同期 (Browser)

#### 履歴 (Yjs ローカル活用)
- [ ] Yjs ベースのローカル変更履歴 (リアルタイム共著の準備としても機能)
- [ ] Offline-only でも Y.Doc 永続化

### 完了条件
- ゲーム会社の 3 人チームが 1 ヶ月ドッグフード
- ノード 500、シーン 200 規模で快適 (3 ターゲットすべて)
- 並行作業による Git 衝突体感ゼロ

---

## Phase 4: 1.0 (4〜5 ヶ月)

「中〜大規模ゲーム会社の本番投入に耐える」品質。

### 追加機能

#### 安定/性能
- [ ] **大規模対応** (10,000 ノード)
- [ ] グラフ描画最適化 (LOD/カリング、Sigma.js 確定)
- [ ] インクリメンタル Index
- [ ] 起動 5 秒以内 (大規模でも、3 ターゲット)
- [ ] メモリ 500MB 以内 (Browser/Tauri)

#### 制作管理
- [ ] **進捗ダッシュボード**
- [ ] **カンバンビュー**
- [ ] **Tagger** (アセット要件抽出)
- [ ] ステータス管理 (Draft/Review/Approved/Recorded)

#### 機能完成
- [ ] **ビートシート** (Save the Cat 等) + 達成度可視化
- [ ] **盛り上がりカーブ**
- [ ] **伏線トラッカー**
- [ ] 関係性マトリクス (N×N)
- [ ] キャラ口調シート + AI 一貫性チェック
- [ ] **プレビューランナー** (擬似 ADV)
- [ ] CLI 安定化、CI 統合

#### ローカライズ完成
- [ ] XLIFF サポート
- [ ] 翻訳 LQA ワークフロー
- [ ] 文字数/ピクセル幅制約
- [ ] フォント連携

#### AI 拡張
- [ ] Agent モード (タスク委任、PR ベース)
- [ ] パッチ承認 UI
- [ ] コスト管理ダッシュボード
- [ ] ローカル LLM 対応 (Ollama, LM Studio)
- [ ] 開発側 AI 向け CLI (`scenario-cli ai-context`)
- [ ] **AI ベンダー切替** が **設定 1 行** で済む状態

#### Unity L3 / Asset Store 化
- [ ] Unity Editor Window 内 WebView 埋め込み (オプション機能)
- [ ] Unity Inspector との双方向同期
- [ ] Addressables 自動 entry 登録
- [ ] Build pipeline 完成 (validation、strip、locale)
- [ ] Sample 3 本完成

#### ドキュメント
- [ ] チュートリアル動画
- [ ] サンプルプロジェクト 2〜3
- [ ] ユーザマニュアル (オフライン)
- [ ] API リファレンス

#### セキュリティ
- [ ] 外部 pen test 1 回
- [ ] Bug bounty 検討
- [ ] SBOM 配布

### 完了条件
- 中規模スタジオ (10〜30 人) がプロダクションに採用可能
- 1 年間のドッグフードで critical bug ゼロ
- 全 3 ターゲットで feature parity

---

## Phase 5+: 深掘り (継続的なリリース)

「他のシナリオツールにはない」深さを継続的に積み上げる。
1 機能ずつ minor リリース。優先順は需要を見て調整。

### A. AI 深掘り

- [ ] **Agent オーケストレーション** — 章単位/プロジェクト単位の複合タスク
- [ ] **マルチモーダル入力** — 画像→キャラシート、音声→脚本、動画→演出案
- [ ] **長文整合性チェック** (10万行)
- [ ] **キャラ口調モデル** — 口調シートを LoRA 風に学習し、当該キャラ専用の補完
- [ ] **シナリオ要約 / ピッチ作成 AI**
- [ ] **AI による自動 Linter ルール提案** (組織横断のクセを学習)

### B. 業界フォーマット完全対応

- [ ] articy:draft XML 双方向 (取込 + 書出)
- [ ] Final Draft FDX
- [ ] Fountain 完全準拠
- [ ] Yarn Spinner / Ink / Twee の双方向
- [ ] Trados / MemoQ XLIFF サブセット
- [ ] Movie Magic Screenwriter
- [ ] PDF 脚本テンプレート集 (映画/連ドラ/アニメ別)

### C. 専門機能

- [ ] **縦書きモード** 完成 (小説/ライトノベル系)
- [ ] **吹き出しレイアウトプレビュー** (漫画/ノベルゲー想定)
- [ ] **声優キャスティング** (キャラと音声 ID の紐付け)
- [ ] **動的差分 (Branch Diff)** — 「主人公が女性なら」など条件分岐の比較
- [ ] **シミュレーション再生** (フラグ操作 + 自動 walkthrough)

### D. プラグイン機構

- [ ] **公式プラグイン API** (TypeScript)
  - 独自 Lens、独自 Linter、独自 Exporter、独自テンプレ
- [ ] サンプルプラグイン: ループもの分岐管理、TRPG ルール対応
- [ ] プラグインマーケットプレイス (Phase X SaaS と連動可)

### E. Unity 統合の深さ

- [ ] **Cinemachine** — シーン POV から自動カメラ設定
- [ ] **Animator BlendTree** — 感情タグから表情自動切替
- [ ] **Live2D / VRoid** — 立ち絵差分自動切替
- [ ] **VFX Graph** — 演出タグから VFX 起動
- [ ] **Timeline** — シナリオを Timeline トラック化
- [ ] **Visual Scripting / Bolt** — 完全統合
- [ ] **Asset Store 公開** (単体パッケージ)

### F. アクセシビリティ完成

- [ ] WCAG 2.2 AA 準拠
- [ ] スクリーンリーダ完全対応
- [ ] 高コントラスト/色覚多様性配慮 4 テーマ
- [ ] フォントカスタマイズ (UD フォント、ディスレクシア向け)
- [ ] キーボードのみで全操作

### G. ドキュメント / 教育

- [ ] 章別チュートリアル動画
- [ ] 業界別ベストプラクティス集 (RPG/ノベルゲー/アドベンチャー/ソーシャル)
- [ ] サンプルプロジェクト 10 本
- [ ] 学習者向けカリキュラム (専門学校向け)

### H. パフォーマンス追求

- [ ] グラフ 50,000 ノード対応
- [ ] 脚本 100 万行スクロール
- [ ] WebWorker 並列化
- [ ] 起動時間 1 秒 (PWA 既開時)

→ Phase 5 以降は **明確な区切りを持たない継続改善**。3〜4 ヶ月ごとに minor リリース、年 1 回 major。

---

## Phase X (棚上げ): SaaS 化

棚上げ理由:
- まずは **ローカルツールとして抜きん出る** ことを目指す
- SaaS は需要が確認できてから / Phase 4 1.0 達成後 / 経営判断で着手
- 設計資産は `17_saas.md` に保管。データモデル・アーキテクチャは将来の SaaS 化に備えて拡張可能性を残してある

判断トリガ (例):
- Phase 4 完了時、外部の継続利用ユーザが N 名以上
- 企業からの SaaS 提供問い合わせが M 件以上
- リアルタイム共著の要望が多数
- 投資/協業の機会

着手すれば 17 の Phase 5/6/7+ に相当する作業が走る。

---

## 工数見積 (粗い、SaaS 除外)

| Phase | 期間 | 累計 | エンジニア工数目安 |
|---|---|---|---|
| 0  | 1 ヶ月  | 1 ヶ月    | 0.5 人月 |
| 1  | 4 ヶ月  | 5 ヶ月    | 4 人月   |
| 2  | 3 ヶ月  | 8 ヶ月    | 3 人月   |
| 3  | 5 ヶ月  | 13 ヶ月   | 6 人月   |
| 4  | 5 ヶ月  | 18 ヶ月   | 8 人月   |
| 5+ | 継続    | -         | 年 6〜8 人月 |

→ MVP まで 5 ヶ月、Unity 統合 8 ヶ月、1.0 (本番投入) 1.5 年。1 名フルタイム想定。
AI 支援を最大限使えば短縮可。

## リリース戦略 (SaaS 除外)

| Phase | 配布 | チャネル |
|---|---|---|
| 1 (MVP) | internal alpha | Browser: 限定 URL |
| 2 (Unity) | internal alpha | + Unity Package Manager (Git URL) |
| 3 (β) | closed beta | + Tauri (GitHub Releases) |
| 4 (1.0) | 一般公開 (OSS Core 想定) | Browser: 独自ドメイン、Tauri/Unity 同 |
| 5+ | minor / major | 通常リリースサイクル |

公開後の名称案:
- 一般名: **Actoratect Scenario Editor** (仮)
- 略称: **ASE**
- Browser URL: `https://scenario.actoratect.dev` (仮、配信のみ)
- Unity package: `com.actoratect.editor-tools` (既存に統合)

## OSS / 商用の境界 (素案、SaaS 棚上げ時)

| レイヤ | ライセンス | 備考 |
|---|---|---|
| Frontend / Core / Adapters / CLI / Unity Package | Apache 2.0 or MIT | OSS で公開 |
| **(将来) SaaS Backend** | Proprietary | 棚上げ。Phase X 着手時に決定 |

→ Phase 4 までは **完全 OSS** (or 完全内製) で進められる。SaaS 化判断時に Open Core モデルへ。

## 撤退条件

- PoC で重大な技術的破綻があれば設計を見直す:
  - Dockview が 3 ターゲット安定しない → Golden Layout / 自前
  - SolidFlow + Sigma.js でも 10k に届かない → PixiJS 自前
  - Tauri WebView の OS 差が許容できない → Electron 検討
  - File System Access API が 1.0 までに Safari/Firefox に来ない → ZIP モードを正式扱い
  - Unity Bridge HTTP が安定しない → 直接ファイル参照のみ
- ライター 5 人にドッグフードしてもらい、3 人以下しか継続使用しない場合は機能の絞り込みを再検討

## マイルストーンの「区切りメッセージ」

- **MVP 完成 (Phase 1)**: 「自分のシナリオがブラウザで書ける」
- **Unity 完成 (Phase 2)**: 「Unity ゲームに 5 分で組み込める / Claude Code でも書ける」
- **β 完成 (Phase 3)**: 「チームメイトに薦められる」
- **1.0 完成 (Phase 4)**: 「会社のプロダクションに納品できる」
- **5+ 深掘り**: 「他のシナリオツールがない深さを 1 つずつ積む」
- **(将来) Phase X**: 「世界中のライターと共著できる」
