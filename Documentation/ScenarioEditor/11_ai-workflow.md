# 11. AI 協調ワークフロー

## 設計の核

- **データ自体を AI フレンドリーに設計** (08_file-format.md 参照): 短い YAML、明確なキー、参照は ID 文字列
- **AI 操作は補助** であって自動化ではない。常に人間の確認を挟む
- **3 層の AI 接点**:
  1. **Inline (執筆時)**: 続きの提案、語感校正
  2. **Batch (チェック時)**: 全体整合性検査、未訳一括翻訳
  3. **Agent (タスク委任)**: 「この章のキャラ口調を整えて」のような複合作業
- **AI プロバイダは特定ベンダーに固定しない** — Claude API / Claude Code / Codex / OpenAI / Gemini / Ollama 等を抽象越しに切替
- **2 系統の抽象**:
  - **In-app LLM** (補完/Linter/翻訳など): `LlmProvider` 抽象でモデル直叩き
  - **Agent Runner** (タスク委任): `IAgentRunner` 抽象で外部エージェント (Claude Code CLI / Codex CLI / Aider 等) を起動
- **3 ターゲット (Browser/Tauri/Unity) でキー管理戦略が異なる** — 詳細は §6

## 1. AI プロバイダ抽象 (2 系統)

### 1.1 LLM 直叩き系 (`LlmProvider`)

API ベースのモデル呼出し。Inline 補完や Linter で使用。レイテンシ重視。

```typescript
export interface LlmProvider {
  readonly id: string;        // "anthropic" | "openai" | "google" | "ollama" | "lmstudio" | ...
  readonly displayName: string;
  readonly capabilities: { streaming: boolean; tools: boolean; structuredOutput: boolean; visionInput: boolean };
  complete(req: LlmRequest, signal?: AbortSignal): Promise<string>;
  stream(req: LlmRequest, signal?: AbortSignal): AsyncIterable<string>;
  structured<T>(req: LlmRequest, schema: JsonSchema, signal?: AbortSignal): Promise<T>;
}

export interface LlmRequest {
  systemPrompt: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  model: LlmModel;            // 文字列 ID (provider 依存)
  cache?: CacheStrategy;      // Anthropic prompt caching 等
  maxTokens?: number;
}
```

実装される provider:
- **Anthropic** (`@anthropic-ai/sdk`)、Claude 4.x
- **OpenAI** (`openai` SDK)、GPT-4 系
- **Google** (`@google/generative-ai`)、Gemini
- **Ollama** (`ollama` JS client)、ローカル LLM (Llama 3 / Qwen / etc.)
- **LM Studio**、ローカル
- **OpenAI 互換 API** (Mistral、DeepInfra、Together、Groq 等)
- 任意のカスタムエンドポイント (URL + 認証ヘッダ)

### 1.2 エージェント駆動系 (`IAgentRunner`)

CLI/プロセスとして動くエージェントを「タスク委任」として呼び出す。
ユーザの強調ポイント: **Claude Code / Codex などをそのまま使える** ように。

```typescript
export interface AgentRunner {
  readonly id: string;        // "claude-code" | "codex" | "cursor-cli" | "aider" | "custom"
  readonly displayName: string;
  readonly capabilities: { writesFiles: boolean; runsCommands: boolean; createsBranch: boolean; createsPullRequest: boolean };
  run(task: AgentTask, signal?: AbortSignal): Promise<AgentRunResult>;
  stream?(task: AgentTask, signal?: AbortSignal): AsyncIterable<AgentEvent>;
}

export interface AgentTask {
  prompt: string;
  workingDirectory: string;        // プロジェクトディレクトリ
  scope: { include: string[]; exclude: string[] };  // ファイルスコープ制限
  branch?: string;                 // 新規ブランチに作業
  dryRun: boolean;                 // 実ファイル変更なし、パッチのみ
  envOverrides?: Record<string, string>;
}

export interface AgentRunResult {
  patches: GitPatch[];             // 実ファイル変更内容
  branchCreated?: string;
  prUrl?: string;
  log: string;
  exitCode: number;
}
```

実装される runner (代表例):
- **Claude Code** (`claude` CLI 起動)
- **Codex** (OpenAI Codex CLI / GitHub Copilot CLI)
- **Cursor / Cursor CLI**
- **Aider** (`aider` CLI)
- **Continue.dev** (OSS)
- **任意の CLI Runner** (コマンドライン+ ENV を user が登録)

### 1.3 設定 UI

```yaml
# ProjectSettings.yaml の ai セクション (例)
ai:
  llm:
    default: anthropic
    providers:
      - id: anthropic
        model: claude-opus-4-7
      - id: openai
        model: gpt-4
      - id: ollama
        endpoint: http://localhost:11434
        model: llama3:70b
      - id: gemini
        model: gemini-1.5-pro
  agent:
    default: claude-code
    runners:
      - id: claude-code
        command: claude
        args: ["--print"]
      - id: codex
        command: codex
        args: []
      - id: aider
        command: aider
        args: ["--no-auto-commits"]
```

ユーザは **複数登録 + 用途別に既定切替** が可能。
例: 「Inline 補完は Ollama (高速)、Agent タスクは Claude Code (高品質)、翻訳は Gemini (安価)」

## 2. プロンプトの組み立て

### 2.1 共通コンテキストパッケージ

タスクに必要な最小限を **常に同梱**:

```
--- WORLD ---
ProjectName: わが帝国の黄昏
Theme: 過去と贖罪、再生
Tone: ダーク 8 / 軽 2

--- CHARACTERS (relevant subset) ---
- tarou: 主人公。一人称「俺」、casual、口癖「面倒だが」
- gatekeeper: 城門の門番。formal、威圧的

--- GLOSSARY (relevant) ---
- アクトラテクト = 物語の中心となる組織
- 別表記禁止: アクトラ、Actra

--- CURRENT SCENE META ---
Scene: ch01.s01_opening
POV: tarou
Era: era.modern
Tension: 30
```

選択中のエンティティ/シーンから、必要なノードだけ抽出してプロンプトに注入 (1〜10 KB)。

### 2.2 プロンプトキャッシュ

- World/Characters/Glossary は **キャッシュ可能**
- セッション中変わらない部分は再利用 → コスト/レイテンシ削減
- Anthropic prompt caching の cache_control を活用

## 3. Inline AI (執筆時)

### 3.1 続きの提案

- カーソル位置で `Tab` → 1 行〜数行の続きを提案
- ストリーミング表示、`Tab` で確定 / `Esc` で破棄
- キャラ口調・現在のシーン文脈・直前 N 行を投入

### 3.2 言い換え/校正

- 行を選択して右クリック → 「もっと自然に」「もっと固く」「短く」「長く」
- 数候補を並列生成して選択

### 3.3 語感/口調チェック

- 入力中の行が**当該キャラの口調から逸脱**していると下線警告
- AI に「これはキャラ X の発話として自然か」を低レイテンシで問う
- ローカル LLM 推奨 (毎キーストロークではなく行確定時にバッチ)

### 3.4 用語誤用検出

- 用語集違反 (アクトラ → アクトラテクトに修正提案)
- 表記揺れ (太郎/タロウ)

## 4. Batch AI (チェック時)

### 4.1 整合性 Linter (AI 拡張)

ルールベース Linter で取りきれない問題を AI に委ねる:
- 「キャラ X が知らないはずの情報を口にしている」
- 「主人公の動機が中盤で曖昧になる」
- 「伏線設置が回収されていない」
- 「年齢計算上、矛盾する記述」

実行モード:
- ファイル保存時 (軽量チェックのみ)
- 明示実行 (Console から「Run AI Lint」)
- CI 実行 (PR 単位)

結果は重要度付きで Console パネル + インライン表示。

### 4.2 一括翻訳

- 未訳行を集約 → バッチで AI 翻訳
- TM ヒットを優先、AI フォールバック
- 1 回の API 呼び出しで複数行 (cost/latency 改善)
- レスポンスはストリーミング、進捗バー

### 4.3 要約生成

- シーン群から章あらすじを生成
- 章群から全体ログラインを生成
- ノードのフィールドから「短い紹介文」を生成
- いずれも下書き提示、人間が編集

## 5. Agent AI (タスク委任) — 2 つの実装

### 5.1 想定タスク

- 「ch03 全体のキャラ口調を整えて」
- 「未訳の en 翻訳を全部完了させて」
- 「アリスの新しい妹キャラを設計して、関連リレーションも追加」
- 「全シーンに `tension` 値を提案して」
- 「ビート割当が空のシーンに、最も合うビートを提案」

### 5.2 実装パス A: 内蔵 Function Calling

`LlmProvider` の Tool Use 機能を使って、ツール (read_node, update_node 等) を AI に提示。
- AI は **YAML ファイルへのパッチ提案** を作る
- パッチは Git diff としてプレビュー可能
- 人間が承認 → 適用
- 拒否 / 部分採用も簡単

ツール (Function Calling):

```yaml
- read_node(id)
- list_nodes(filter)
- update_node(id, patch)
- create_node(template, slug, fields)
- delete_node(id)
- read_scene(id)
- update_scene_steps(sceneId, steps)
- search(query)
- run_linter(scope)
- get_glossary(term)
- get_relations(nodeId, type?)
```

すべての `update_*` `create_*` `delete_*` は **dry-run** が既定。
人間の承認後に実ファイル変更。

### 5.3 実装パス B: 外部エージェント呼出し (Claude Code / Codex / Aider など)

`IAgentRunner` 越しに、ローカルにインストール済みの汎用コーディングエージェントを起動。

**Claude Code の例**:
```
$ claude --print --working-directory ./Assets/Scenarios/ch03 \
    "全シーンの太郎の口調を 'speech_style.tone: casual' に統一して"
```

**Codex の例**:
```
$ codex run --branch ai/tone-fix \
    --files "Scenarios/ch03/**/*.scn.yaml" \
    --task "太郎の口調を統一"
```

エディタ側からは **同一 UI** でこれらを起動。違いはランナーの設定だけ。

利点:
- ユーザがすでに使っているエージェント (Claude Code / Cursor / Codex / Aider) をそのまま使える
- ライセンス/プラン/モデル選択がエージェント側に委ねられる
- エージェントが Git ブランチや PR まで作る場合も、同じワークフローで連動

注意:
- ローカルで動くため、セキュリティ境界が異なる (`16_security.md` §3 / §4)
- 実行ログ + 変更パッチをエディタが取り込んで Diff 表示
- スコープ外のファイルを変更したら警告

### 5.4 プレビューと差分

- パッチは `.editor/.ai_patches/<jobId>/` に一時格納 (パス A) / Git ブランチ commit (パス B)
- Diff ビューで承認画面 (Git diff と同等の UI)
- ロールバック容易 (パッチ revert / branch 破棄)

### 5.5 どちらを選ぶか

| 場面 | 推奨パス |
|---|---|
| エディタ単独で完結したい | A: 内蔵 Function Calling |
| すでに Claude Code / Codex を運用中 | B: 外部エージェント |
| 大規模タスク (1 章丸ごとリファクタ) | B: 自律性が高い |
| ブランチ/PR で分離したい | B: Git ネイティブ |
| すぐ確認したい (1 ファイル変更) | A: レイテンシ低 |

## 6. プライバシー/データ漏洩対策

- API 送信前に **送信内容を可視化**できる "Show prompt" ボタン
- プロジェクト設定で「AI 送信禁止のノード」マーク (`ai: { allow: false }`)
- 送信ログを `.editor/ai_logs/` に保存 (Git ignore)
- ローカル LLM オプション (機密案件向け)

### 6.1 ターゲット別 API キーの保管

詳細は **`16_security.md`** §2.7, §3.1, §5.5。要約のみ:

| ターゲット | キーの保管 | リスク |
|---|---|---|
| **Tauri (Desktop)** | OS キーチェーン (`keyring` クレート) | 低 |
| **Unity Editor** | OS キーチェーン (Bridge HTTP 経由でブラウザにロード) | 低 |
| **Browser (単独)** | IndexedDB + WebCrypto AES-GCM (パスフレーズ) | 中 (XSS 対策必須、CSP strict) |
| **Browser + AI Proxy (Phase 5+ SaaS)** | サーバ側で保管、組織共有 + Quota | 低 |

### 6.2 CORS と直叩きの注意

- Anthropic / OpenAI の Web SDK は CORS 対応 (`dangerouslyAllowBrowser: true` 等)
- Browser 単独では「ユーザ自身のキー」を使う方針。共有プロジェクトでは proxy 推奨
- Tauri は Rust backend 経由で叩けば CORS 不要

### 6.3 送信内容のスコープ制御

- 「シーン単体送信」「プロジェクト全体送信」の選択
- 送信前のサマリ画面 (どの YAML が含まれるか、推定トークン数、推定コスト)
- 機密プロジェクトはローカル LLM (Ollama) で完結

## 7. コスト管理

- API コール毎に推定コストを表示
- 月次/プロジェクト合計の見える化
- 大きいバッチは見積→確認→実行の 3 段階
- ブラウザ単独はユーザのキーで自身が支払い、Phase 4+ proxy 経由では運営側集計

## 8. オフラインモード

- AI 機能は全て optional 設計
- オフライン時はルールベース Linter のみ動作
- ローカル LLM 設定で Anthropic API 不要構成も可
- PWA キャッシュにより、Browser でもオフライン起動 + ルールベース Lint 利用可

## 9. AI 設定 (ProjectSettings 抜粋)

```yaml
ai:
  enabled: true
  provider: claude              # claude | openai | local | off
  model: claude-opus-4-7
  maxTokensPerRequest: 8000
  cacheStrategy: aggressive
  onSave:
    runLinter: light            # off | light | full
  onExport:
    runLinter: full
  inline:
    enabled: true
    debounceMs: 800
  budget:
    monthlyUsd: 50
    warnAtPercent: 80
```

## 10. 評価/フィードバック

- 提案を「採用/却下/編集して採用」と記録
- 統計: 採用率/編集率/却下率
- プロジェクトの「AI 受容度」をメンバー間で見えるように

## 11. 将来: マルチモーダル

- キャラのサムネ画像から外見メモ自動生成
- 場面のスケッチから舞台設定書き出し
- 立ち絵差分の感情ラベリング自動化
- 音声台本の感情マーキング

## 12. ライセンス/出力に関する注意

- AI 出力をプロジェクトに含める前提で、利用ライセンスを ProjectSettings に明記
- 出力に含める可能性のある「学習元の権利」を法務確認するためのチェックリストをドキュメント側に
- すべての AI 提案は人間の編集を経るワークフローに
