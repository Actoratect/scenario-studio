# Actoratect Scenario Studio

キャラクター設定、関係図、プロットボード、脚本を同じプロジェクトで編集するシナリオエディタ。現在の実用対象は Chrome / Edge のブラウザ版です。

> **状態**: 開発版 (2026-09-26 更新)。グラフ・キャラ編集・保存の改善を統合。
> マスターデータ・ローカライズ・AI の仕様は保留。Unity 統合、Tauri 配布、スマホ版は別途計画中です。

詳細な使い方は [`Documentation/UserGuide.md`](./Documentation/UserGuide.md) を参照。
設計仕様 / ロードマップは [`Documentation/ScenarioEditor/`](./Documentation/ScenarioEditor/) (00〜25 章) を参照。

## 何ができる

- **世界観構築** — ノード型 (キャラ / 舞台 / アイテム / 組織) + 相関図グラフ + 時代差分 (Era / Variant)
- **3 階層執筆** — あらすじ / プロット / 脚本 (サムネ + 名前付きセリフ表示、感情タグ)
- **年表ビュー** — 横軸 Era × 縦軸 キャラのガント / Plot Flow Lens で「シーン遷移」を可視化
- **プロットボード** — カードの作成・編集・接続、シーンやキャラへのリンク、保存と取り消し
- **キャラ資料** — 人物・見た目・場面別台詞・相手別台詞を必要な項目から追加
- **書き出し** — text / Markdown / **レビュー用 HTML (画像同梱の単一ファイル)**
- **作業画面** — 境界の分かるタブ、3列の既定配置、集中表示。保存済みの配置も復元
- **保存** — 明示保存 / 自動保存、外部変更の競合検知、編集途中の下書き保持

### 0.1.0 で入った主な機能 (post-MVP A〜AY)

| エリア | 機能 |
|---|---|
| 🩺 Project Health overlay | 起動 10 秒で「次に直すべき」が見える |
| Script Context Rail | ScriptPanel 右側の常駐 read-only rail (登場 / 用語 / 警告 / AI 文脈) |
| 🗺 Plot Flow Lens | Graph で「シーン遷移」を Lens 切替で表示 + ⚠ 到達不能検知 |
| 🎮 Unity Readiness | Unity 出力前のサムネ / 音声 / metadata 不足チェック |
| Review HTML Export | プロジェクト全体を 1 ファイル HTML (画像 inline) で配布 |
| 📝 AI Patch Queue | AI / 用語スキャナ提案を diff で承認 / 却下、drift 検知 |
| 🤝 Local Agent Handoff | 選択範囲を Codex / Claude.ai / ChatGPT / Gemini に渡す prompt パッケージ |
| 自由入力化 | gender / tone / Relation type を任意文字列に (プリセットは UI 補助) |

## クイックスタート

```bash
pnpm install
pnpm -F frontend dev          # → http://localhost:5173/
```

Windows では `Scenario Studio を起動.bat` をダブルクリックでも起動できます。ブラウザで「サンプル『走れメロス』を試す」を選び、空フォルダに展開すると編集を試せます。

> **動作環境**: Chrome / Edge 推奨 (File System Access API 利用)。
> Firefox / Safari 向けの OPFS アダプターはありますが、起動画面からの編集フローは未対応です。
> スマホは閲覧 (Review HTML) のみ — フル編集は **Scenario Studio Mini** (計画中、`Documentation/ScenarioEditor/23_scenario_studio_mini.md`) で対応予定。

## 開発

```bash
pnpm install              # 依存インストール
pnpm typecheck            # 全 package 型チェック
pnpm test                 # vitest
node --test scripts/restart-dev.test.mjs # 起動対象の判定テスト
pnpm lint                 # eslint
pnpm format               # prettier --write

pnpm -F frontend dev      # frontend dev server
pnpm -F core build        # core build
```

GitHub Pages サブパスでビルド (PR-AK):

```bash
# Linux/Mac
VITE_BASE_PATH=/scenario-studio/ pnpm -F frontend build
# Windows PowerShell
$env:VITE_BASE_PATH='/scenario-studio/'; pnpm -F frontend build
```

## 配布

- **GitHub Pages**: `main` への push で自動 deploy → `https://<owner>.github.io/<repo>/`
- **zip 配布**: GitHub Actions Artifacts から `dist/` をダウンロード → 任意の static server で配信

## プロジェクト構造

```
.
├── packages/
│   ├── core/                # ピュア TS (DOM / Node 非依存) — domain / lint / yaml / export / ai 抽象
│   ├── adapter-browser/     # FS Access API + IndexedDB + OPFS フォールバック
│   ├── adapter-tauri/       # Tauri API (Phase 3)
│   ├── adapter-unity/       # Unity Bridge HTTP (Phase 2)
│   ├── adapter-node/        # Node fs + CLI Agent Runner (Codex / Aider 等)
│   ├── ui-kit/              # 共通 UI コンポーネント (ContextMenu 等)
│   ├── frontend/            # SolidJS + Vite + Dockview (本体)
│   ├── tauri/               # Tauri (Rust)
│   └── cli/                 # Node-based CLI (dogfood / sample 生成)
├── sample-projects/
│   └── meros/               # 起動時の組込サンプル『走れメロス』
├── Documentation/
│   ├── UserGuide.md         # 使い方ガイド (AI 向けデータスペック含む)
│   └── ScenarioEditor/      # 設計書 (00〜25 章)
└── .github/
    └── workflows/           # CI (typecheck + lint + test + Tauri rust check)
```

## サブシステム / 関連プロジェクト

- **Scenario Studio Mini** (計画中) — Pro と同データを扱うスマホ版 (PWA + 将来 Capacitor)。詳細: [`23_scenario_studio_mini.md`](./Documentation/ScenarioEditor/23_scenario_studio_mini.md)
- **`com.actoratect.editor-tools`** ([Unity Package](https://github.com/Actoratect/com.actoratect.editor-tools)) — Phase 2 で連携予定 (SceneLoader / RenameTool 同居)

## ライセンス

TBD (Phase 4 1.0 公開前に確定)。Frontend / Core / Adapters / CLI / Unity Package は **Apache 2.0 or MIT 想定**。
詳細: [`Documentation/ScenarioEditor/13_roadmap.md`](./Documentation/ScenarioEditor/13_roadmap.md) の「OSS / 商用の境界」節。

## ロードマップ要約

| Phase | スコープ | 状態 |
|---|---|---|
| 0 | 設計 / PoC | ✅ 完了 |
| 1 | MVP (M1〜M8) + post-MVP A〜AY | ✅ 完了 (= 0.1.0) |
| 2 | Unity 連携 | 計画段階 |
| 3 | β (Tauri 配布、レビュアー協業) | 計画段階 |
| 4 | 1.0 (一般公開) | 計画段階 |
| 5+ | 深掘り (AI / 業界フォーマット / プラグイン 等) | 継続 |
| Y (並走) | Scenario Studio Mini (スマホ版) | 計画段階 |
| X (棚上げ) | SaaS 化 | 未着手 |

詳細: [`Documentation/ScenarioEditor/13_roadmap.md`](./Documentation/ScenarioEditor/13_roadmap.md)
