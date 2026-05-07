# 22. UX / 機能改善レビュー

> 2026-05-07 時点の検討メモ。  
> 目的は、Scenario Studio を「機能が多いシナリオ管理ツール」ではなく、**AI + 個人で大規模ゲーム制作を前に進める作業環境**、かつ **チームが脚本を短時間で理解できる可視化基盤**として磨くこと。

## 0. 現状認識

Phase 1 MVP 後の実装は、すでに以下の体験を持っている。

- ノード / シーン / 脚本を Browser で編集できる
- Graph / Inspector / Outline / Script / Plot Timeline / Stats / Glossary / Console / AI などの主要パネルがある
- Cmd+K コマンドパレット、全文検索、ID 一覧、AI 1 行補完、AI シーン要約がある
- シーン並べ替え、画像アップロード、Glossary ハイライト、自動保存競合検知、Dock layout 永続化など post-MVP の UX 改善も入っている

一方で、今後の改善は「機能追加」だけで進めると散らばりやすい。  
本ツールの強みは、**物語構造・脚本・実装・AI 文脈が同じデータから出る**ことなので、次の改善は「作業中の認知負荷をどこまで下げられるか」を軸にする。

## 1. プロダクトの勝ち筋

### 1.1 個人 + AI 向け

個人制作での一番の敵は、執筆量そのものよりも「全体像を忘れること」「実装に流す時に破綻に気づくこと」「AI に毎回文脈を説明すること」。  
Scenario Studio はここを以下で解決するべき。

- 何を書くべきかが常に見える
- 今書いている行が、キャラ・時系列・分岐・Unity 実装にどう影響するかが見える
- AI に渡る文脈と差分が人間に確認できる
- ゲーム実装へ出す前の不足がダッシュボード化される

前提として、開発者はローカル環境に Codex / Claude Code / Cursor / Aider / IDE を入れて本ツールを回す。Scenario Studio は「AI を内蔵した脚本ツール」だけではなく、**ローカルAIワークベンチの司令塔**になる。GUI は世界観・脚本・可視化・承認を担い、外部コーディングAIはリポジトリ内ファイルを直接編集する。

AI 連携は 2 軸で考える。

| 軸 | 対象 | 料金 / 認証 | UX |
|---|---|---|---|
| **Developer Local Agent** | Codex / Claude Code / Cursor / Aider / IDE / ローカルLLM | 各ツール側のログイン・契約・無料枠に委ねる | prompt package を渡す、CLI 起動、diff 取り込み |
| **General External API** | OpenAI / Gemini / Anthropic 等の API | アプリから API を呼ぶため原則 API 課金が必要 | 右クリックから3案生成、Show prompt、推定コスト、採用 |

ChatGPT / Gemini のログイン済みWeb UIを無料枠で使う場合は、Developer Local Agent 軸の「プロンプトをコピー / ChatGPTで開く / Geminiで開く / 生成物を drag & drop」として扱う。アプリがログイン済みWeb UIを裏で自動操作する設計にはしない。

### 1.2 チーム向け

チームでの価値は「共同編集」より先に、**理解の高速化**にある。  
レビュー担当・エンジニア・翻訳者・ディレクターが、脚本全文を読まなくても以下を把握できることが重要。

- この章で誰が何を知り、何が変わったか
- このシーンの目的、登場キャラ、必要アセット、分岐、未解決警告
- どの変更が翻訳 / 音声 / Unity Asset / 既存分岐に影響するか
- 伏線・因果・キャラアーク・緊張度の流れ

## 2. UX 原則

0. **タブを増やしすぎない**  
   機能ごとに独立タブを増やすと、制作中の視線移動と迷子感が増える。新機能はまず「既存パネル内の rail / drawer / overlay / 右クリックメニュー / Cmd+K action」として実装できないかを検討する。常時タブ化するのは、Script / Graph / Inspector のように長時間滞在する作業面だけに絞る。

1. **書く画面に文脈を寄せる**  
   ScriptPanel を孤立した本文エディタにせず、右または下に「このシーンの目的 / キャスト / 矛盾 / 必要アセット / AI 文脈」を常駐させる。

2. **可視化は見せ物ではなく操作面にする**  
   Graph / Plot Timeline / Stats は閲覧専用でなく、並べ替え・修正・警告解決・ジャンプの入口にする。

3. **AI は自動生成より、文脈保持と差分提示を優先する**  
   長文生成より先に、シーン要約、矛盾候補、修正案 diff、用語統一、翻訳文脈パックを強くする。

4. **大規模化しても「今日やること」が見える**  
   1 万ノード対応より先に、30 シーン規模で迷子にならない Project Health / Next Action が必要。

5. **Unity 連携は成果物チェックとして見せる**  
   Export ボタンだけでは弱い。Unity に流す時に足りない画像・音声・変数・翻訳・参照切れが一覧化されるべき。

6. **AI はフィールドの右クリックから呼べるようにする**  
   画像欄・テキスト欄のように「いま直したい対象」が明確な場所では、AI 専用タブに移動させず、右クリックメニューから生成 / 提案を呼ぶ。生成結果は 1 つを即採用ではなく、3 案から選ぶ。

## 3. 優先改善テーマ

### A. Project Health / Next Action ダッシュボード

**狙い**: 起動直後に「今日は何を直せば前進するか」を見せる。

表示するもの:

- 最近編集したシーン / ノード
- Lint error / warning の上位
- 未要約シーン、未設定 POV、未設定 Era、未設定 cast
- 未回収伏線、未翻訳、未収録、画像未設定などの production 欠落
- AI コスト / 補完利用状況
- 章ごとの進捗、セリフ密度、緊張度の偏り

実装候補:

- `StatsPanel` / `ConsolePanel` / Welcome 画面を統合し、既定タブを増やさずに「Home」的に見せる
- 新規 `ProjectHealthPanel` を作る場合も、初期 layout に常駐させず Cmd+K / Welcome / header badge から開く
- `ConsolePanel` の Issue と `StatsPanel` の集計を統合
- Cmd+K から `health: fix next issue` を実行できるようにする

受け入れ基準:

- プロジェクトを開いて 10 秒以内に、次に直すべき項目へジャンプできる
- issue をクリックすると該当ノード / シーン / 行に移動する
- 既定 layout のタブ数を増やさない

### B. Script Context Rail

**狙い**: 脚本を書きながら、別パネルに移動せずシーン文脈を把握できるようにする。

ScriptPanel の横に薄い rail を置く。

- Scene purpose / beat / tension / status
- POV、Era、Location、Cast
- 登場キャラのサムネ、口調メモ、直近登場シーン
- 用語集ヒット、未定義参照、文字数超過
- 選択中行の export key / voice cue / localization status
- AI に送る文脈プレビュー

実装候補:

- `ScriptVisualEditor.tsx` に scene meta summary を追加
- `SceneSelection` と `ProjectService` から cast / node summary を取る
- まずは read-only でよい。編集は Inspector へのジャンプで対応

受け入れ基準:

- ライターが ScriptPanel だけを最大化しても、シーンの目的・キャラ・警告が分かる
- キャラ名クリックで Inspector / Graph の該当ノードへ飛べる

### C. Plot Flow Lens

**狙い**: チーム理解に効く「脚本の流れ」を一枚で見せる。

Relationship Graph とは別に、シーン間の流れを可視化する。

- 章 / シーンをノードにする
- choice / goto / include / condition をエッジにする
- 到達不能シーン、終端なし分岐、循環を警告する
- シーンカードに title / beat / tension / status / cast を表示

実装候補:

- `core/src/graph/plot-flow-lens.ts`
- `GraphPanel` の Lens 切替を最小実装
- 既存 `PlotTimelinePanel` と同じ scene summary parser を共通化

受け入れ基準:

- 30 シーンの分岐構造が 1 画面で分かる
- choice の then 先をクリックで ScriptPanel に開ける

### D. Review Package / Reader Mode

**狙い**: チームが「読める」状態を Git / Unity / アプリ操作なしで渡せるようにする。

出力するもの:

- 静的 HTML または Markdown Book
- 章 / シーン一覧、脚本本文、登場キャラ、用語集、相関図画像
- Lint / TODO / 未翻訳 / 未収録の一覧
- コメント欄は Phase 3 以降。まずは read-only でよい

実装候補:

- 既存 ExportDialog に `review_html` を追加
- `10_export.md` の Markdown Book を Phase 2 手前に小さく先取り

受け入れ基準:

- 非開発者が ZIP / HTML を開くだけで 1 章をレビューできる
- レビュー用出力に「どこを読めばよいか」の章サマリが付く

### E. AI Patch Queue

**狙い**: AI を「補完」から「安全な修正提案」へ進める。

まずは内蔵 Agent ではなく、以下の単位でよい。

- シーン要約の再生成
- 用語表記の修正
- キャラ口調の軽い修正
- tension / beat 値の提案
- cast / location の推定追加

UX:

- AI が変更候補を queue に積む
- 変更前 / 変更後の diff を表示
- 行単位で採用 / 却下
- 採用率を記録し、プロンプト改善に使う

実装候補:

- `AiSummaryOverlay` を一般化して `AiPatchOverlay`
- `.editor/.ai_patches/` への保存は後回しでもよい。まずは in-memory diff
- `ConsolePanel` に AI job と結果を表示

受け入れ基準:

- AI の提案が即保存されず、必ず人間承認を通る
- 採用した変更は通常の undo / redo に乗る

### E2. Local Agent Handoff

**狙い**: Codex / Claude Code / Cursor / Aider / IDE など、開発者ローカルのコーディングAIへ、Scenario Studio から文脈を渡して作業を委任する。

この機能は API 課金型の内蔵AIとは別枠。ユーザーがすでにログイン・契約・設定しているローカルAI環境をそのまま使う。

提供するもの:

- 選択中ノード / シーン / 章 / Graph Lens の context package
- 関連 YAML / Markdown / Schema / Glossary / Unity C# 参照のファイル一覧
- AI に渡す prompt の自動生成
- `codex` / `claude` / `aider` / `cursor` などの CLI 起動プリセット
- 実行後の Git diff 取り込み、Lint、承認 / 差し戻し

UI:

- 右クリックまたは Cmd+K から `Codex に依頼...`
- `作業スコープ`、`変更許可ファイル`、`dry-run / branch 作成` を選ぶ
- 実行ログは Console、差分は Patch Queue に表示

受け入れ基準:

- 選択中シーンから「このシーンの太郎の口調を整える」を Codex / Claude Code に投げられる
- スコープ外ファイルの変更は警告される
- 生成結果は必ず diff 確認を通る

### F. Unity Readiness Panel

**狙い**: Phase 2 Unity 連携の前に、ゲーム実装へ流す準備状況を見える化する。

表示するもの:

- ScriptableObject 出力対象数
- 画像・音声・BGM・SE の不足
- 変数未定義、到達不能シーン
- Localization key 未生成 / 未翻訳
- Unity 側で必要になる Addressables / StringTable / Voice cue の状態

実装候補:

- `ExportDialog` と `StatsPanel` の間に `ReadinessPanel` を追加
- Browser standalone でも使える「Unity export dry-run」として実装

受け入れ基準:

- Export 実行前に、ゲーム実装上の不足が一覧化される
- issue クリックで該当 scene / node / line にジャンプできる

### G. Field Context AI Actions

**狙い**: AI 機能を「AI タブで命令するもの」から「編集中のフィールドで直接使えるもの」にする。

#### G1. 画像欄の右クリック生成

画像フィールド、サムネイル欄、Synopsis 画像、キャラ立ち絵欄などで右クリックすると、AI 画像生成メニューを出す。

メニュー例:

- `ChatGPT 用プロンプトをコピー`
- `Gemini 用プロンプトをコピー`
- `ChatGPTで開く` / `Geminiで開く` (ログイン済みWeb UIで手動生成)
- `APIで画像を3案生成...` (課金あり)
- `この画像を元に差分生成...` (既存画像がある場合)
- `画像プロンプトをコピー`

生成モーダル:

- Provider は GPT 系 / Gemini 系 / Project default から選択できる
- プロンプトはノード名、外見メモ、Era Variant、シーン文脈、用途 (thumbnail / standing / background) から自動下書き
- 送信前に Show prompt を表示
- 生成結果は **3 案** のサムネイルとして並べる
- 1 つを選ぶと、対象フィールドに保存。残りは破棄または `Media/.ai-candidates/` に一時保存
- 採用時は `aiGenerated: true`、provider、prompt hash、生成日時をメタに残す

無料枠利用の扱い:

- ChatGPT / Gemini のログイン済みWeb UIで無料生成したい場合、Scenario Studio は prompt を作って clipboard に入れ、Web UI を開くところまで支援する
- 生成画像はユーザーがダウンロード / コピーして、画像欄へ drag & drop する
- これは API 連携ではないため、アプリ内 3案自動生成・自動保存はしない
- アプリ内で 3案を自動取得する場合は外部 API 軸であり、API 課金が必要

保存先の考え方:

- キャラサムネ: `Media/characters/<slug>_<variant>.png`
- 場所背景: `Media/locations/<slug>_<variant>.png`
- Synopsis 内画像: `Scenarios/synopsis-images/<slug>.png`

受け入れ基準:

- 画像欄の右クリックから 30 秒以内に 3 案が見える
- 採用前に必ずプロンプトを確認できる
- 採用した画像は通常の画像アップロードと同じ保存経路に乗る

#### G2. テキスト欄の右クリック提案

テキスト入力、Markdown、脚本行、ノード説明、口調シートなどで右クリックすると、AI 提案メニューを出す。

メニュー例:

- `AI による提案...`
- `短くする`
- `キャラ口調に寄せる`
- `表記ゆれを直す`
- `翻訳用コンテキストを作る`

提案モーダル:

- 選択中テキスト、フィールド種別、関連ノード、Glossary、シーン文脈をプロンプトに入れる
- 結果は **3 案** をカードで表示
- 各案は `置換` / `末尾に追加` / `コピー` / `却下` を選べる
- 差分を表示し、即保存はしない
- 採用した案は undo / redo に乗る

3 案の既定プリセット:

| 対象 | 案 1 | 案 2 | 案 3 |
|---|---|---|---|
| 脚本のセリフ | 自然に | キャラ口調強め | 短く |
| ト書き | 映像的に | 簡潔に | 演出指示込み |
| キャラ説明 | 要約 | 魅力強調 | 矛盾候補込み |
| Synopsis | 1 行要約 | 章紹介風 | レビュー向け |

受け入れ基準:

- 任意の主要テキスト欄で右クリックから 3 案を出せる
- AI 提案は採用前に差分確認できる
- プロバイダを GPT 系 / Gemini 系 / Project default から選べる

#### G3. 実装方針

- `AiPanel` は設定と履歴に寄せ、生成操作の主役にはしない
- `AiService` に `generateImageCandidates()` と `suggestTextCandidates()` を追加
- Provider 抽象は `LlmProvider` とは別に `ImageGenerationProvider` を定義する
- 右クリックメニューは `ui-kit` の共通 `ContextMenu` として作る
- API key / Show prompt / 送信ログ / cost 表示は既存 AI UX と共通化する

#### G4. 実装フロー

既存コードに差し込む場合の流れ:

```
画像欄 / テキスト欄で右クリック
  → FieldAiContext を作る
  → ContextMenu を表示
  → AI action 選択
  → Show prompt + provider 選択
  → AiService が 3 candidates を生成
  → AiCandidateOverlay で比較
  → 採用した candidate だけ field に反映
  → SaveScheduler / ThumbnailService / Script serializer が通常保存
```

ここで重要なのは、AI だけ専用の保存経路を作らないこと。  
採用後は必ず既存の保存経路に戻す。

| 対象 | 起点 | 採用先 |
|---|---|---|
| Inspector サムネ / 画像欄 | `PortraitCropper` / `ThumbnailService` 周辺 | `ThumbnailService.uploadForNode()` |
| Inspector テキスト欄 | `TextInput` / `MultilineInput` / `MarkdownArea` | `FieldRow.onInput()` |
| Script Visual Editor の本文 | `ScriptVisualEditor` の各 `textarea` | `onChangeBlock()` |
| Synopsis Markdown | `SynopsisPanel` | Markdown editor の `onInput()` |

#### G5. 型のイメージ

```typescript
export interface FieldAiContext {
  target:
    | { kind: "node-field"; nodeId: NodeId; fieldId: string }
    | { kind: "script-block"; chapterSlug: string; sceneSlug: string; blockIndex: number; field: "text" | "prompt" }
    | { kind: "synopsis"; path: string };
  selectedText?: string;
  currentValue?: string;
  surroundingText?: string;
  projectContext: {
    nodeSlug?: string;
    displayName?: string;
    templateId?: string;
    eraId?: string;
    glossaryTerms: readonly string[];
    relatedNodes: readonly string[];
  };
}

export interface TextSuggestionCandidate {
  id: string;
  label: string;          // "自然に" / "短く" / "キャラ口調強め"
  text: string;
  rationale?: string;
}

export interface ImageGenerationCandidate {
  id: string;
  label: string;
  mimeType: "image/png" | "image/webp" | "image/jpeg";
  bytes: Uint8Array;
  prompt: string;
  providerId: "openai-image" | "gemini-image" | "project-default";
}

export interface ImageGenerationProvider {
  readonly id: string;
  readonly displayName: string;
  generate(req: {
    prompt: string;
    n: 3;
    size: "thumbnail" | "portrait" | "background";
    referenceImage?: Blob;
  }, signal?: AbortSignal): Promise<readonly ImageGenerationCandidate[]>;
}
```

#### G6. Provider 構成

`AiService` は現在 `anthropic` / `openai` / `ollama` の `LlmProvider` を持っている。画像生成は LLM と能力が違うため、別 registry にする。

```
AiService
├── textProviders: LlmProviderRegistry
├── imageProviders: ImageGenerationProviderRegistry
├── keyVault: providerId ごとの暗号化 API key
├── requestTextSuggestions(context): Promise<3 candidates>
└── requestImageCandidates(context): Promise<3 candidates>
```

Provider 候補:

- `openai-image`: GPT / OpenAI 系画像生成
- `gemini-image`: Gemini 系画像生成
- `project-default`: ProjectSettings の既定に従う仮想 provider
- 将来: `local-image` / `comfyui` / `stable-diffusion-webui`

UI では provider の詳細を直接知らず、`capabilities.imageGeneration === true` の provider だけを出す。

Provider は 2 軸で分ける。

| 種別 | 例 | 自動化 | 課金表示 |
|---|---|---|---|
| Local handoff | ChatGPTで開く / Geminiで開く / Codexに依頼 | 半自動。prompt渡しとdiff取り込みまで | アプリでは推定しない。各サービス側に委ねる |
| External API | openai-image / gemini-image / anthropic text | 自動。候補生成から採用まで | 必須。生成前に推定コストを表示 |

この分離により、一般向けには「外部APIで生成する場合は課金が必要」と明示でき、開発者向けには「既に契約・ログイン済みのローカルAIをそのまま使う」導線を残せる。

#### G7. 右クリックメニューの実装単位

共通部品として `ui-kit` に以下を追加する。

- `ContextMenuRoot`
- `useContextMenu()`
- `AiFieldMenuItems`
- `AiCandidateOverlay`

各フィールド側は右クリック時に `FieldAiContext` を渡すだけにする。

```tsx
<textarea
  value={props.block.text}
  onContextMenu={(e) => {
    e.preventDefault();
    FieldAiActions.openTextMenu(e, {
      target: { kind: "script-block", chapterSlug, sceneSlug, blockIndex, field: "text" },
      currentValue: props.block.text,
      surroundingText,
    });
  }}
/>
```

採用時:

```typescript
candidateOverlay.onAccept((candidate) => {
  props.onChange({ ...props.block, text: candidate.text });
});
```

画像欄も同じ。

```tsx
<div
  class="panel-inspector-portrait-col"
  onContextMenu={(e) => {
    e.preventDefault();
    FieldAiActions.openImageMenu(e, {
      target: { kind: "node-field", nodeId: node.id, fieldId: "thumbnail" },
      projectContext: buildNodeImageContext(node),
    });
  }}
/>
```

採用時は `Blob` / `File` にして既存の `ThumbnailService.uploadForNode()` に渡す。

```typescript
const file = new File([candidate.bytes], `${node.slug}_ai.png`, { type: candidate.mimeType });
await ThumbnailService.uploadForNode(node, file, file.name);
```

#### G8. 3 案 UI

3 案は小さな modal / popover で出す。新規タブにはしない。

テキスト:

- 左に現在値、右に候補
- 変更差分を inline highlight
- `置換` / `追記` / `コピー`

画像:

- 3 枚のサムネイルを横並び
- prompt / seed / provider を折りたたみ表示
- `採用` / `保存だけ` / `破棄`

いずれも送信前に Show prompt を出す。  
画像や機密設定を外部 provider に送るため、プロジェクトの `ai.allow` / `ai.blockedFields` があればそこで止める。

#### G9. タブを増やさない実装ルール

この機能では追加タブを作らない。

- AI provider 設定: 既存 `AiPanel`
- 実行起点: 右クリックメニュー
- 生成中: overlay / toast
- 結果比較: `AiCandidateOverlay`
- 履歴: `ConsolePanel` または `AiPanel` の history セクション

将来、履歴が大きくなった場合だけ `AI Jobs` タブを検討するが、既定 layout には置かない。

## 4. 機能優先度

| 優先 | 機能 | 理由 |
|---|---|---|
| P0 | Project Health / Next Action | 毎日起動した時の迷いを減らす。個人制作に直撃 |
| P0 | Script Context Rail | 執筆画面だけで文脈を維持できる。使用頻度が最も高い |
| P0 | Field Context AI Actions | タブ移動なしで画像生成 / テキスト提案を使える。AI の体感価値が高い |
| P0 | Local Agent Handoff | ローカル Codex / コーディングAI / IDE を前提にした本ツールの主戦場 |
| P0 | Plot Flow Lens | チーム理解と分岐デバッグに効く。既存 Graph 資産を活かせる |
| P1 | Unity Readiness Panel | Phase 2 の価値を先に見せられる。Export の信頼性を上げる |
| P1 | Review Package / Reader Mode | チーム導入の摩擦を下げる。非開発者に渡しやすい |
| P1 | AI Patch Queue | AI の価値を「安全な変更」に進める |
| P2 | Voice / Localization Workbench | 本格制作時に強いが、Phase 2 後でもよい |
| P2 | Full Timeline / Life Span View | 作品ジャンルによって価値が大きい。Plot Flow の後に判断 |
| P2 | Theme / Dark mode / i18n UI | 品質として重要だが、制作フロー改善より後 |

## 5. 次の PR 候補

### UX-1: Project Health Panel

- Welcome / Stats / Console の統合ビューとして作り、既定タブ数は増やさない
- Lint / stats / incomplete scene meta を集約
- issue click でジャンプ

### UX-2: Script Context Rail

- ScriptPanel に read-only rail
- scene meta / cast / glossary / warnings を表示
- キャラクリックで Inspector へ

### UX-3: Plot Flow Lens v1

- scene graph parser
- Lens 切替 UI
- choice / goto edge 表示
- unreachable warning は Console に出す

### UX-4: Export Readiness Dry-run

- `scenario export --check` に近い UI
- Unity / review / localization の不足を grouped issue として出す

### UX-5: Review HTML Export

- 1 章単位の read-only HTML
- scene summary + script + cast + glossary + warnings

### UX-6: AI Patch Queue v1

- 用語表記修正または scene meta 推定だけに絞る
- diff preview + approve / reject

### UX-7: Field Context AI Actions v1

- 画像欄 right-click → ChatGPT / Gemini 用 prompt copy、または外部APIで3案生成 (課金あり)
- テキスト欄 right-click → AI による 3 案提案
- Show prompt + 差分確認 + 採用 / 却下

### UX-8: Local Agent Handoff v1

- 選択中ノード / シーンから `Codex に依頼...` を起動
- prompt package を生成して clipboard / `.editor/ai-context/` に保存
- 任意で `codex` / `claude` / `aider` CLI を起動
- 実行後の diff を Patch Queue に取り込む

## 6. ドッグフードで確認する質問

次のドッグフードでは、機能の有無より以下を観察する。

- 起動後 1 分以内に「今日やること」が分かるか
- ScriptPanel 最大化だけで 30 分書き続けられるか
- Graph / Timeline を開いた時に、眺めるだけでなく修正行動につながるか
- 新機能追加後も、既定 layout のタブ数が増えすぎていないか
- 画像欄 / テキスト欄の右クリック AI は、AI タブへ移動するより速く感じるか
- ローカル Codex / コーディングAI / IDE に文脈を渡すまでが 1 分以内に済むか
- 外部AIが編集したファイルを、Scenario Studio 側で安全に diff / lint / 承認できるか
- AI 補完は「便利」ではなく「プロジェクト文脈を覚えている」と感じるか
- レビュー担当に HTML / Markdown を渡して、説明なしで読めるか
- Unity に渡す前の不足が Export 失敗まで待たずに分かるか

## 7. まとめ

Scenario Studio の改善は、しばらく **制作フローの背骨** に集中するのがよい。

最初に磨くべきは、新しい巨大機能ではなく、

- Project Health
- Script Context Rail
- Field Context AI Actions
- Local Agent Handoff
- Plot Flow Lens
- Unity Readiness
- Review Package
- AI Patch Queue

の 6 つ。  
これらは既存の `ProjectService` / `SelectionContext` / `SceneSelection` / `LintService` / `StatsPanel` / `GraphPanel` を活かせるため、Phase 2 に入る前の改善として現実的で、かつ「個人でもチームでも理解が速くなる」という本ツールの価値に直結する。
