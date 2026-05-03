# Actoratect Scenario Studio

ブラウザ・デスクトップ (Tauri)・Unity Editor の 3 ターゲットで動く、AI 協調前提の大規模シナリオエディタ。

> **🚧 Phase 0: 設計・PoC 進行中。** 設計は `Documentation/ScenarioEditor/`、ロードマップは `Documentation/ScenarioEditor/13_roadmap.md` 参照。

## 何ができる予定か

- ノード型 (キャラ/舞台/アイテム/組織/イベント) の世界観構築
- 相関図グラフエディタ + 時代差分 (Variant)
- あらすじ / プロット / 脚本の 3 階層執筆 (サムネ + 名前付きセリフ表示)
- 年表ビュー (時代スライダで一斉切替)
- ローカライズ + ゲームエクスポート (Unity ScriptableObject / Yarn / Ink / 等)
- AI 協調 (Claude API / Claude Code / Codex / OpenAI / Gemini / Ollama 等を抽象越しに切替)
- ブラウザ単独で動く + Unity に組み込むと Asset 自動生成 + 開発側 AI が YAML を直接編集

## 開発

```bash
pnpm install
pnpm typecheck
pnpm test
```

詳細な開発ガイドは `Documentation/ScenarioEditor/` を参照。

## 構造 (予定)

```
.
├── packages/
│   ├── core/                # ピュア TS (DOM/Node 非依存)
│   ├── adapter-browser/     # FS Access API + IndexedDB
│   ├── adapter-tauri/       # Tauri API
│   ├── adapter-unity/       # Unity Bridge HTTP
│   ├── adapter-node/        # Node fs (CLI 用)
│   ├── ui-kit/              # 共通 UI コンポーネント
│   ├── frontend/            # SolidJS + Vite
│   ├── tauri/               # Tauri (Rust)
│   └── cli/                 # Node-based CLI
├── Documentation/
│   └── ScenarioEditor/      # 設計書 18 章
└── .github/
    └── workflows/
```

## ライセンス

TBD (詳細は `Documentation/ScenarioEditor/13_roadmap.md` の OSS / 商用境界を参照)

## 関連リポジトリ

- [`com.actoratect.editor-tools`](https://github.com/Actoratect/com.actoratect.editor-tools) — Unity Package (Phase 2 で連携予定)
