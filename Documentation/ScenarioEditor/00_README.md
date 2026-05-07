# Scenario Editor 設計ドキュメント

ブラウザ・デスクトップ・Unity Editor の **3 ターゲットで動く** 大規模シナリオエディタの設計集。
本職のシナリオライター/ゲーム企業の企画・シナリオ部署が日常的に使う機能を踏まえ、AI コーディング前提で設計。
特に開発者は、ローカル環境に Codex / Claude Code / Cursor / Aider / IDE などのコーディングAIを入れ、リポジトリ内の YAML / Markdown / C# / TS を直接読み書きしながら制作を回す想定。

> **当面の方針 (確定)**: SaaS 化は **棚上げ (Phase X)**。Phase 0〜4 (約 1.5 年) は **ツールとしての完成度** を最優先で作り込む。
> **AI プロバイダは特定ベンダーに固定しない**。Claude API / Claude Code / Codex / OpenAI / Gemini / Ollama 等を抽象越しに切替。

## 目次

| #   | ドキュメント                                            | 概要                                                           |
| --- | ------------------------------------------------------- | -------------------------------------------------------------- |
| 01  | [コンセプトと業界調査](./01_concept.md)                   | ビジョン、競合・参考ツール、本職が使う機能の調査                |
| 02  | [追加提案機能](./02_proposals.md)                         | ご要望に加えて提案したい現場機能 + Phase 5+ 深掘り候補          |
| 03  | [データモデル](./03_data-model.md)                        | ノード、テンプレート、Variant、将来 SaaS 化用の予約フィールド   |
| 04  | [グラフエディタ](./04_graph-editor.md)                    | 相関図エディタ、レンズ、フィルタ、グラフ内編集                  |
| 05  | [時間軸・年表](./05_timeline.md)                          | エポック、年表、Variant 切替、複数カレンダー                    |
| 06  | [シナリオ階層](./06_scenario-layers.md)                   | あらすじ・プロット・脚本の3層、ビート、サムネ付きセリフ         |
| 07  | [ウィンドウシステム](./07_window-system.md)               | Browser/Desktop/Unity 共通のドッキング、グリッド配置            |
| 08  | [ファイル形式](./08_file-format.md)                       | YAML/CSV、メディア、AIフレンドリーなレイアウト                  |
| 09  | [ローカライズ](./09_localization.md)                      | キー設計、翻訳メモリ、エクスポート/インポート                   |
| 10  | [ゲームエクスポート](./10_export.md)                      | ScriptableObject/JSON/Yarn 等、ランタイム連携                   |
| 11  | [AI 協調ワークフロー](./11_ai-workflow.md)                | LlmProvider + IAgentRunner の 2 抽象、マルチベンダー対応        |
| 12  | [アーキテクチャ](./12_architecture.md)                    | TS モノレポ、Adapter 抽象                                       |
| 13  | [ロードマップ](./13_roadmap.md)                           | Phase 0〜5+ の段階、Phase X (SaaS) は棚上げ                     |
| 14  | [リスクとオープンクエスチョン](./14_open-questions.md)    | 設計上の判断保留事項、確定事項                                  |
| 15  | [クロスプラットフォーム戦略](./15_cross-platform.md)      | Browser / Desktop (Tauri) / Unity 3 ターゲットの全体方針        |
| 16  | [セキュリティ設計](./16_security.md)                      | ブラウザ/Desktop/Unity 各層のセキュリティ。SaaS 章は棚上げ      |
| 17  | [SaaS 設計 (棚上げ)](./17_saas.md)                        | 将来の参照用スナップショット。**現時点では着手しない**           |
| 18  | [Unity 統合](./18_unity-integration.md)                   | Asset 自動生成、開発側 AI 連携、Inspector/Find Usages           |
| 19  | [Phase 0 振り返り](./19_phase0_retrospective.md)           | 9 PoC の結果サマリ、tech stack 確定、open questions の更新       |
| 20  | [Phase 1 実装計画](./20_phase1_implementation_plan.md)     | MVP の done 定義、8 milestone、依存グラフ、リスク台帳            |
| 21  | [残タスクリスト](./21_remaining_tasks.md)                  | post-MVP 後の残タスク、保留中の UX / 大型機能                   |
| 22  | [UX / 機能改善レビュー](./22_ux_feature_review.md)          | post-MVP の使い勝手改善、チーム理解、AI + 個人制作向けの次候補   |
| 23  | [Scenario Studio Mini](./23_scenario_studio_mini.md)        | スマホ版 (Pro と同データ / 機能サブセット / 並走 track)。`13` の Phase Y |

> **読む順番のおすすめ**: 全体像 → `01` → `02` → `15` (プラットフォーム方針) → `18` (Unity 価値) → `11` (AI 抽象) → `16` (セキュリティ) → `03`〜`12` (個別設計) → `13`〜`14`

## 設計の指針 (TL;DR)

1. **3 ターゲット同居** — Browser ファースト、Desktop は Tauri、Unity は Editor 内 WebView/外部ブラウザで同じ web 版を起動
2. **データはテキスト主役** — YAML を一次ソース、CSV/JSON は派生。Git で diff/merge できる粒度に分割
3. **TypeScript で 1 本** — UI/Core を共通実装。Unity 側 C# は薄い消費レイヤ (Asset 生成 + ランタイム + Bridge)
4. **「ノード」を世界の最小単位に** — キャラ・舞台・アイテム・組織・イベント・テーマすべて同じ抽象。型はテンプレートで定義
5. **時間軸は一級概念** — ノードは Variant (時代差分) を持つ。グラフも年表も時代スライダで一斉に切り替わる
6. **Articy:draft / Scrivener / Aeon Timeline / Yarn の良いとこ取り** — 一品ずつ機能を理解した上で、ひとつのアプリで一気通貫
7. **ローカライズとエクスポートは前提** — キー、ID、翻訳メモリを最初から仕込む
8. **オフラインファースト** — クラウド非依存で動く
9. **Unity は「データを実装にそのまま流せる場所」** — Asset 自動生成、Inspector/Find Usages、開発側 AI (Claude Code 等) がリポジトリ内 YAML を読み書き
10. **ローカルAIワークベンチ前提** — 開発者の PC に Codex / Claude Code / Cursor / Aider / IDE が入っている状態を first-class とし、エディタ内AIだけに閉じない
11. **AI は何でも使える** — `LlmProvider` (API 直叩き) + `IAgentRunner` (CLI 起動) の 2 抽象で、Claude API / Claude Code / Codex / OpenAI / Gemini / Ollama / 任意エージェント を切替
12. **セキュリティは設計初期から** — ブラウザ公開を見据え、CSP/暗号化/最小権限を早期に
13. **SaaS 化は棚上げ** — まずローカルツールとして抜きん出る。Phase 4 完了後に判断

## 想定ユーザ

- 個人〜小規模チームのシナリオライター・企画
- ローカルに Codex / Claude Code / Cursor / Aider / IDE を入れて、AI と一緒にゲーム制作を回す開発者
- ゲーム会社のシナリオ/企画部署 (複数人協業)
- 同人ゲーム・ノベルゲーム制作者
- 設定資料集を作りたい世界観構築者
- レビュア/翻訳者/監督 (URL 1 つで参加可能)

## デプロイメントターゲット

| ターゲット | 形態 | 主な利点 | フェーズ |
|---|---|---|---|
| **Browser (Local)** | URL を開くだけ (PWA) | インストール不要、レビュア招待が一瞬 | Phase 1 |
| **Unity Editor** | `com.actoratect.editor-tools` パッケージ | Asset と密結合、ScriptableObject 生成、開発側 AI 連携 | Phase 2 |
| **Desktop** | Tauri アプリ (Win/macOS/Linux) | ネイティブ FS アクセス、高速、オフライン完全 | Phase 3 |
| ~~SaaS~~ | (棚上げ) | リアルタイム共著、組織管理 — 将来選択肢 | Phase X |

3 ターゲット (Local) は **同じ TypeScript コードベース** で、Adapter 層だけ差し替え。

## 開発順序 (確定)

```
Phase 0: 設計・PoC                  ← 今ここ (1 ヶ月)
Phase 1: MVP (Browser standalone)        (4 ヶ月)
Phase 2: Unity 連携 (Bridge + Asset)     (3 ヶ月)
Phase 3: β (Tauri + 機能拡張)            (5 ヶ月)
Phase 4: 1.0 (本番投入品質)               (5 ヶ月)
Phase 5+: 深掘り / 機能拡張 (継続)
─────────────────────────────────────
Phase X: SaaS 化  [棚上げ]  需要確認・意思決定後
```

各フェーズの詳細は `13_roadmap.md`。

## 本パッケージとの関係

Phase 0 PoC-I で **2 リポジトリ分離** を確定 (詳細: `12_architecture.md` §2):

- `Actoratect/com.actoratect.editor-tools` — Unity Package (既存 SceneLoader/RenameTool と同居、ScenarioEditor 関連の Editor/Runtime コード、設計書一次ソース)
- `Actoratect/scenario-studio` — TS モノレポ (core / adapters / ui-kit / frontend / cli / tauri)

当初案 (`unity-package/` + `web/` を 1 repo に同居) からの変更理由は、配布チャネル (Unity Package Manager は git URL 単位、Web は npm registry / 静的ホスト / GitHub Releases) が異なる点と、CI マトリクス分離。
既存の Scene Loader / Rename Tool 等は Unity 側 repo に残り、Unity Editor のメニュー (`Window > Actoratect > Scenario Editor`) から TS 側 (本 repo) のビルド成果物を起動可能にします (Phase 2)。

## 確定事項 / 未決事項

ユーザの意思決定により以下を確定 (詳細は `14_open-questions.md` 0z 章):

- ✅ TypeScript で 1 本化 (Web/Unity 編集性が損なわれないことが条件)
- ✅ 開発順序は本ドキュメント通り
- ✅ モノレポ化 (`unity-package/` + `web/`)
- ✅ ブラウザのセキュリティを十分詰めた上で公開 (`16_security.md`)
- ✅ **SaaS 化は棚上げ (Phase X)**。Phase 0〜4 はツール作り込みに集中
- ✅ **AI プロバイダは固定しない**。Claude API / Claude Code / Codex / OpenAI / Gemini / Ollama を抽象越しに切替

未決事項は `14_open-questions.md` L 章 (Yarn/Ink 優先順、Unity Localization 必須度、WebView 採用 等)。
