# CLAUDE.md

このファイルは Claude Code (および互換ツール: Cursor, Cline, Continue, Aider, Codex 等) に向けた、本リポジトリで作業するときの指針です。

## まず読むこと

`Documentation/ScenarioEditor/` 配下に全体設計があります。タスクに着手する前に最低でも以下を読んでください:

1. `00_README.md` — 全体像
2. `13_roadmap.md` — フェーズと現在地、PoC タスク一覧
3. `12_architecture.md` — 技術アーキテクチャ
4. タスク関連章 (例: グラフ → `04`、AI → `11`、Unity → `18`)
5. `14_open-questions.md` の 0z 章 (確定事項)

## 現在地

**Phase 0: 設計・PoC** 進行中。

優先順 (詳細は `13_roadmap.md`):

1. **PoC-I**: モノレポ構成 (この repo の最低限ひな形は配置済。残: 各 package 雛形、ESLint/Prettier、CI 完成)
2. **PoC-A**: Vite + SolidJS + Dockview (3 パネル分割/フロート)
3. **PoC-C**: 3 ターゲット FS Adapter (Browser / Tauri / Unity / Node)
4. **PoC-D**: CodeMirror 6 で脚本エディタ (サムネ + 感情タグの inline widget)
5. **PoC-F**: AI プロバイダ抽象 (`LlmProvider` + `IAgentRunner`)
6. **PoC-B**: 大規模グラフ描画ベンチ (SolidFlow → 必要なら Sigma.js)
7. **PoC-G**: Tauri 2 ビルド + 配布
8. **PoC-E**: Era Variant 解決
9. **PoC-H**: Yjs CRDT (Phase X への布石、ローカル Undo にも有用)

## 規約

### 言語
- **ドキュメント・コメント**: 日本語
- **コード識別子**: 英語
- **コミットメッセージ**: 日本語可。本文は **why** を書く

### コード
- TypeScript strict、`any` 禁止
- ESLint + Prettier (PoC-I で設定)
- vitest で各機能にテスト
- Frontend は SolidJS + Vite
- 大きい依存追加は理由をコミットメッセージに

### 設計の扱い
- 設計から外れる判断が必要なら、対応する `Documentation/ScenarioEditor/*.md` を **同じコミットで更新**
- 章番号は変更しない (相互リンクが壊れる)
- 大きな設計変更は人間に確認

### AI ベンダー固定の禁止
- Claude / OpenAI / Gemini / Ollama / Codex / Claude Code / Aider / etc. は `LlmProvider` または `IAgentRunner` 抽象越しに切替可能に保つ
- 直接 SDK を import するのは Provider 実装ファイルだけ
- 詳細は `Documentation/ScenarioEditor/11_ai-workflow.md`

### コミット
- 1 コミット 1 論点
- 件名 50 文字以内
- 本文に why を書く (what は diff に出る)
- destructive な操作 (force push, reset --hard 等) はしない

## 機能優先度

- **MVP (Phase 1)** で必要 → 即実装可
- **β (Phase 3)** で必要 → 設計のみ準備
- **1.0 (Phase 4)** で必要 → 同上
- **Phase 5+** = 継続深掘り。先取り実装しない
- **Phase X (SaaS)** = **棚上げ**。現時点で着手しない

## やってはいけないこと

- 章番号を変える
- 設計と実装の不整合を放置 (どちらかを直す)
- AI ベンダー固定
- SaaS バックエンドへの実装着手 (Phase X 棚上げ)
- 機能の先取り実装 (該当 Phase まで保留)
- `Documentation/ScenarioEditor/` のファイルを削除する (廃止する場合も非推奨章として残す)

## 役立つコマンド

```bash
pnpm install                # 依存インストール
pnpm typecheck              # 全 package の型チェック
pnpm test                   # vitest
pnpm -F frontend dev        # Frontend dev server (PoC-A 完了後)
pnpm -F core build          # Core ビルド
```

## 関連

- 設計確定事項: `Documentation/ScenarioEditor/14_open-questions.md` 0z 章
- 残課題: 同 L 章
- セキュリティ: `Documentation/ScenarioEditor/16_security.md`
- Unity 統合: `Documentation/ScenarioEditor/18_unity-integration.md`
