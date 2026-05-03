# 20. Phase 1 実装計画 (MVP / Browser standalone)

> このドキュメントは **着手用の実装計画書**。判断・優先順は Phase 0 PoC の検証結果 (`19_phase0_retrospective.md`) を根拠にしている。
> 期間: 設計上 4 ヶ月 (`13_roadmap.md` Phase 1)。1 名フルタイム想定 + AI 支援。
> ターゲット: **Browser standalone のみ**。Unity (Phase 2) / Tauri (Phase 3) は別フェーズで。

## 0. MVP の done 定義 (`13_roadmap.md` 完了条件の具体化)

「ライター 1 人が Browser で **1 章を完成させる** ことができる」を MVP done とする。具体的には:

| 観点 | 受け入れ基準 |
|---|---|
| **データ** | ノード 50 / シーン 30 / 脚本 5,000 行のプロジェクトを 2 週間ドッグフードして問題なく動く |
| **対応ブラウザ** | Chrome / Edge を first-class、Safari / Firefox は ZIP モード |
| **起動時間** | PWA 既開時 2 秒、初回 5 秒 |
| **保存** | 編集 500ms デバウンスで自動保存、未保存表示なし |
| **セキュリティ** | CSP strict、SRI、入力サニタイズ、AI API キーは IndexedDB + WebCrypto AES-GCM (パスフレーズ) で暗号化 |
| **AI** | 1 行続き提案 (Tab 確定 / Esc 破棄)、Show prompt 表示、Provider 切替が設定 1 行 |
| **Lint** | 基本 5 ルール (参照整合性 / 孤児 / 循環 / 必須欠落 / slug 重複) で警告 |
| **CLI** | `scenario validate` / `scenario export <id>` 雛形が動く |

**測定可能性**: M8 milestone でドッグフード実走を行い、上記 8 項目を 1 つずつ確認。1 つでも欠ければ MVP 未完了とする。

---

## 1. 優先順位の原則: dogfood-first slice

Phase 0 PoC の最大の learning は「個別機能を 1 つずつ完成させても、ユーザは何もできない」だった。Phase 1 は **「最初の 1 ヶ月でドッグフードできる thin slice を作る」** を最優先にし、機能を縦に切る。

### 1.1 Critical path (これがないと何も動かない順)

```
[M1 Project Shell]
   ↓
[M2 Domain + YAML]   ← この時点で「データを読み書きできる」
   ↓
[M3 Inspector]        ← 1 ノードが編集できる = 最初のドッグフード可能ライン
   ↓
[M4 Era + Outliner]   ← 章 / シーンが扱える
   ↓
[M5 Graph]            ← ノード間関係が見える
   ↓
[M6 Script]           ← 脚本が書ける = 完全なドッグフード
   ↓
[M7 AI + Lint]        ← 補助機能
   ↓
[M8 Polish + PWA]     ← 配布可能
```

### 1.2 並列化可能なところ

- M5 (Graph) と M6 (Script) は M3-M4 完了後に **並列に走らせられる** (担当者が複数いる場合)
- M7 の AI / Lint / Glossary は互いに独立 — 並列可
- M8 の PWA / CLI / 入力サニタイズも互いに独立

1 名フルタイム想定では並列化不要。複数人体制になった時の余裕として残す。

### 1.3 リスク先取り

Phase 0 の learning から、以下は **早期に着手** すべき:

- **YAML parser/serializer の往復可能性** (Eemeli `yaml` で comment 保持) → M2 で先に確定。後回しすると Inspector の保存パスが歪む。
- **NodeFieldStore (Yjs) の ProjectModel 統合** → M2 で並行して入れる。Inspector を作ってから Yjs を被せると編集パスが二重実装になる。
- **`Uint8Array<ArrayBufferLike>` 問題** (PoC-C / PoC-G で実例) → どの新規 fetch / Blob 操作でも踏むので、ヘルパ `toOwnedArrayBuffer()` を共通化 (`core/src/util/`)
- **動的 import 分割** → bundle が gzip 194 KB から増える前に分割導線を作る (M1)。ScriptPanel / GraphView / BenchmarkPanel をルート分離。

---

## 2. Milestones (各 2 週間 × 8 = 16 週)

### M1: Project Shell (2 週間)

**ゴール**: 「空のプロジェクトを開いて閉じられる」

**deliverable**:

- `core/src/project/`:
  - `ProjectHandle` (既存) を拡張、open / close / lastOpened リストを IndexedDB に
  - `ProjectModel` 雛形 (空の Map<NodeId, ScenarioNode> + Era list + Settings)
  - `ProjectLoader` interface (Adapter から projectFiles を読み込む)
- `core/src/yaml/`:
  - `parseYaml(text): { ast, value }` Eemeli `yaml` の Document を保持
  - `serializeYaml(ast, value): text` 編集後の往復、comment 保持を round-trip テストで担保
- `frontend/src/panels/ProjectPicker.tsx`: 「新規 / 開く / 最近開いた」UI
- `frontend/src/services/`: ProjectService (現在のプロジェクト) + EventBus
- vite-plugin-pwa の skeleton (offline-first の方針だけ入れる、本格化は M8)
- 動的 import: `BenchmarkPanel`, `ScriptPanel` を `lazy()` で分割

**新規 dep**: `yaml` (Eemeli)、`vite-plugin-pwa`、`@solidjs/router`

**完了条件**:
- 「新規プロジェクト」ボタンで FS Access API でフォルダ選択 → `ProjectSettings.yaml` + 空の `Nodes/` `Scenarios/` `Eras/` `Templates/` ディレクトリが生成
- 既存プロジェクトを「開く」で settings が読まれる
- 起動時に「最近開いた」プロジェクトが IndexedDB から復元される
- vitest: yaml 往復 (parse → serialize → parse が同型)、ProjectModel skeleton

---

### M2: Domain Layer + Templates (2 週間)

**ゴール**: 「ノードを CRUD できる (UI なしでも、テストで証明できる)」

**deliverable**:

- `core/src/domain/templates/`: 4 builtin テンプレート
  - `character.ts` (full_name / birth_year / gender / height / appearance / speech_style / faction)
  - `location.ts` (region / climate / population)
  - `item.ts` (category / rarity / owner)
  - `faction.ts` (founded_year / leader / allies / rivals)
- `core/src/domain/template-engine.ts`: フィールド schema 検証 + デフォルト値 + `LocalizedString` 型対応
- `core/src/domain/node-repository.ts`:
  - `loadAll(adapter, handle)`: `Nodes/**/*.yaml` を読み、ScenarioNode に hydrate
  - `save(adapter, handle, node)`: 単一ノードを `Nodes/<template>/<slug>.yaml` に書く
  - `rename(adapter, handle, nodeId, newSlug)`: ファイル名追従、参照解決
  - `delete(adapter, handle, nodeId)`: 削除 + 参照孤児検査 (M7 Lint への入力)
- `core/src/history/project-history.ts`: ProjectModel 全体に NodeFieldStore を **per-node** 適用、global undo/redo manager
- `ulid` package で NodeId 生成
- `immer` で不変更新

**新規 dep**: `ulid`, `immer`

**完了条件**:
- vitest: 4 テンプレート × CRUD 操作 (create / read / update / delete / rename) の round-trip
- vitest: 50 ノード / 100 リレーションのプロジェクトを load → save → load して同一性確認
- vitest: undo/redo がノード単位 + プロジェクト全体の両 scope で動く

---

### M3: Inspector Panel (2 週間)

**ゴール**: 「Inspector で 1 ノードを編集できる、編集が自動保存される」

**deliverable**:

- `ui-kit/src/form/`: Solid form プリミティブ
  - `<TextInput />`, `<NumberInput />`, `<EnumSelect />`, `<LocalizedStringInput />`, `<MarkdownArea />`, `<MediaUpload />`, `<NodeRefPicker />`
  - すべて `value()` / `onChange(v)` の controlled、Yjs に直接書き込まない (Inspector 経由)
- `frontend/src/panels/InspectorPanel.tsx` (PoC-A の placeholder を本実装に):
  - 選択ノード (`SelectionContext` 経由) のテンプレート schema を読む
  - フィールドごとに適切な ui-kit コンポーネントをレンダ
  - onChange → ProjectModel 経由で NodeFieldStore に書く (500ms デバウンス)
  - 保存タイミングで Adapter 経由で YAML に永続化
- `frontend/src/services/SelectionContext.ts`: 共通選択モデル (12 §5.3)
- `frontend/src/services/SaveScheduler.ts`: 500ms デバウンス書き出し

**完了条件**:
- 1 キャラクターノードを Inspector から編集 → 500ms 後に YAML 更新
- Ctrl+Z で 1 つ前の編集に戻る、Ctrl+Y で再適用
- フォーカス変更 (別フィールドへ tab 移動) で `markUndoBoundary()` が呼ばれる
- vitest: form 各コンポーネントの controlled 動作、SaveScheduler のデバウンス

---

### M4: Era / Variant UI + Outliner + Synopsis (2 週間)

**ゴール**: 「Era スライダで時代を切り替え、Outliner で章/シーンを並べ、あらすじを書ける」

**deliverable**:

- `frontend/src/global/EraSlider.tsx`: グローバルツールバー上に常駐 (07_window-system.md §2)
  - スライダ (連続) + ドロップダウン (定義済み Era) + 年入力
  - `[` `]` で 1 Era 単位、Shift+矢印で 1 年単位
  - `EraContext` Signal で全 panel に伝播
- `core/src/domain/scenario.ts`: Scenario 階層 (Project → 章 → シーン)
- `core/src/scenario-repository.ts`: `_index.yaml` / `synopsis.md` / `_scene_index.yaml` の load/save
- `frontend/src/panels/OutlinePanel.tsx` (PoC-A の placeholder を本実装に):
  - TanStack Virtual で大規模対応
  - ドラッグで章/シーンの並べ替え
- `frontend/src/panels/SynopsisPanel.tsx`: 全体 synopsis Markdown エディタ
  - TipTap か CodeMirror Markdown のどちらか — M4 着手時に decide (CM6 で揃えると依存が減る)
- Inspector の Variant タブ: `EraContext` の era に基づいて variant フィールドを focus
- 5 relation types fixed: `parent` / `child` / `friend` / `enemy` / `member_of` (faction 用)

**新規 dep**: `@tanstack/solid-virtual` (TanStack Virtual の Solid 版)

**完了条件**:
- Era スライダで Era 切替 → Inspector の表示値が `resolveNode()` 結果に同期
- Outliner で章 → シーン階層が見える、ドラッグで並べ替えが永続化
- Synopsis Markdown が編集 → `synopsis.md` に保存

---

### M5: GraphView (Relationship Lens) (2 週間)

**ゴール**: 「Graph で全ノードの関係性が見える、グラフ上で選択 → Inspector が同期」

**deliverable**:

- `frontend/src/panels/GraphPanel.tsx` (PoC-A の placeholder を本実装に):
  - `solid-flow` で全 ScenarioNode + 5 relation types を描画
  - パン / ズーム (10%-400%) / 矩形選択 / Shift+クリックトグル
  - ダブルクリックで Inspector フォーカス
  - リレーション作成: ノード辺をドラッグ → 他ノード → 種別選択ポップアップ
- `core/src/graph/relationship-lens.ts`: ノード集合 + 表示する relation 種別を組合わせて `{ nodes, edges }` を返す
- `core/src/graph/layout.ts`: Force-directed 自動レイアウト (graphology-layout-forceatlas2 の wrap)
- レイアウト保存: `Layouts/<lens>.yaml` にノード位置を保存 (Lens 単位)

**完了条件**:
- 50 ノードのプロジェクトで 60 fps でパン/ズーム
- グラフでノード選択 → Inspector に反映 → 編集 → グラフラベル更新
- リレーション作成・削除が永続化

**Phase 1 won't-have** (Phase 3 へ): Lens 切替 (Faction/Location/PlotFlow)、フィルタ DSL、Mini-map、Sigma.js 移行。MVP は Relationship Lens 1 つ。

---

### M6: Script Editor 本実装 (2 週間)

**ゴール**: 「シーンを開いて Smart モードで脚本が書ける、サムネ/感情タグ/選択肢が inline 表示」

**deliverable**:

- `frontend/src/panels/ScriptPanel.tsx` (PoC-D を本実装に):
  - シーン file (`s01_opening.scn.yaml`) の load/save
  - Smart 入力モード (06_scenario-layers.md §5.4):
    - 行頭で `:` → 話者選択候補ポップアップ
    - 行頭で `!` → ト書き行
    - 行頭で `?` → 選択肢行 (options を inline で展開)
  - Inline widget 拡張 (PoC-D の base に追加):
    - **CharacterThumbnailWidget**: PoC-D の slug ハッシュ色 + ノードの thumbnail (登録済なら) を small avatar
    - **EmotionTagWidget**: PoC-D + クリックでドロップダウン (定義済み emotion 一覧から選択)
    - **ChoiceWidget**: 選択肢を inline UI 風に表示 (`then` リンクが他シーンへジャンプ)
    - **SfxBgmWidget**: アイコン表示
- `core/src/script/parser.ts`: `.scn.yaml` の `script:` 配列を `ScriptStep[]` (typed union) に
- `core/src/script/serializer.ts`: 編集後の書き戻し
- 文字数バッジ (行末): 「12字 / 30字制限」、超え赤
- アサイド `<弱々しく>` のレンダリング (山括弧)

**完了条件**:
- 5,000 行の脚本ファイルで 60 fps スクロール
- Smart モードで 1 シーン書ききれる (キーボードのみ)
- inline widget 4 種が動く

---

### M7: AI + Lint + Glossary (2 週間)

**ゴール**: 「AI 補完が Tab で確定、Lint 警告が出る、用語集で揺らぎ検出」

**deliverable**:

- `core/src/ai/key-vault.ts`: Browser での AI API キー保管
  - WebCrypto AES-GCM + パスフレーズ (PBKDF2 で derived key)
  - IndexedDB に encrypted blob を保存
  - 起動時にパスフレーズ入力ダイアログ
- `frontend/src/services/AiService.ts`:
  - `LlmProviderRegistry` を holds、ProjectSettings.yaml の `ai` セクションから provider を register
  - 「Show prompt」モーダル — 送信前のプロンプトを可視化
- `frontend/src/codemirror/inlineCompletion.ts`: CodeMirror 6 用 inline completion plugin
  - カーソル位置で 800ms デバウンス → `LlmProvider.complete(req)` で続き 1 行を提案
  - 提案を ghost text で表示、Tab で確定 / Esc で破棄
- `core/src/lint/`:
  - `LintRule` interface (id / severity / check(project): Issue[])
  - 5 builtin rule:
    - `relation-target-exists` (リレーション先がプロジェクト内に存在)
    - `orphan-node` (どこからも参照されていないノードを info レベル)
    - `circular-relation` (parent/child の循環)
    - `required-field-missing` (テンプレート required フィールドの未入力)
    - `duplicate-slug` (slug の重複)
  - 結果は `LintResult` を Console panel に表示
- `frontend/src/panels/ConsolePanel.tsx` (新規): Lint + AI + その他通知の出力先
- `frontend/src/panels/GlossaryPanel.tsx` (新規): 用語集テーブル (TanStack Table)
  - 用語 + 別表記 + 別表記禁止のリスト
  - 脚本 / synopsis 編集中に用語集違反を underline (M6 Script Editor に hook)

**新規 dep**: `@tanstack/solid-table` (Glossary 用)

**完了条件**:
- パスフレーズ入力 → AI キー復号 → 補完が動く
- Show prompt で送信内容が見える
- Lint 5 ルールが Console に表示
- 用語集 1 件登録 → Synopsis で違反箇所に下線

---

### M8: Polish (PWA + CLI + サニタイズ + ドッグフード) (2 週間)

**ゴール**: 「Browser 配布可能、ライターが 2 週間ドッグフードできる」

**deliverable**:

- **PWA** (`vite-plugin-pwa`):
  - Service Worker (Stale-While-Revalidate for static, Cache-First for icons)
  - manifest.json + iOS / Android インストール対応
  - 起動時間計測 (M1 で仕込んだ計測コードで測る) — 目標 PWA 既開時 2 秒、初回 5 秒
- **CSP / SRI / 入力サニタイズ** (`16_security.md §2`):
  - HTML には strict CSP meta (script-src 'self', etc.)
  - DOMPurify で synopsis Markdown を sanitize
  - YAML のキー / 値の制御文字フィルタ
- **CLI モード** (`packages/cli`):
  - `scenario validate <project-path>`: 5 Lint ルールを CLI で実行
  - `scenario export <node-id> --format yaml|json`: 単一ノードを stdout に
  - `scenario stats <project-path>`: ノード数 / 文字数 / 未訳キー数
  - vitest fixture: `tests/fixtures/sample_project/` を作って CLI 経由のテスト
- **自動保存安定化**:
  - 競合検知 (外部編集 vs 自分の編集 — `watch` event で diff し、競合あれば差分マージ UI)
- **ドッグフード**:
  - 「設定 50 / シーン 30 / 脚本 5,000 行」のテストプロジェクトを用意 (or 既存実プロジェクトを移植)
  - 2 週間 daily 使用、issue を `Documentation/ScenarioEditor/dogfood-log.md` に記録 (新規ファイル、Phase 1 後に保管)
  - 起動時間 / メモリ / 保存遅延 / グラフ fps を計測

**完了条件 (= MVP done)**:
- §0 の 8 項目すべて pass
- ドッグフードログに critical bug 0 件、minor bug は Phase 2 にチケット化

---

## 3. 依存グラフ

```
                          ┌─────────────────┐
                          │ M1 Project Shell │
                          └─────────┬───────┘
                                    │
                          ┌─────────▼───────┐
                          │ M2 Domain + YAML │
                          └─────────┬───────┘
                                    │
                          ┌─────────▼───────┐
                          │ M3 Inspector    │
                          └─────────┬───────┘
                                    │
                          ┌─────────▼───────┐
                          │ M4 Era + Outline │
                          └────┬────────┬───┘
                               │        │
                ┌──────────────▼──┐  ┌──▼─────────────┐
                │ M5 GraphView    │  │ M6 Script      │ ← M5/M6 並列可
                └──────────────┬──┘  └──┬─────────────┘
                               │        │
                          ┌────▼────────▼───┐
                          │ M7 AI/Lint/Gloss │
                          └─────────┬───────┘
                                    │
                          ┌─────────▼───────┐
                          │ M8 Polish + PWA │
                          └─────────────────┘
```

---

## 4. リスク台帳 (Phase 0 由来 + 新規)

| リスク | 発生フェーズ | 影響 | 早期軽減策 |
|---|---|---|---|
| Eemeli `yaml` の comment 保持が複雑なケースで壊れる | M1 | 大 (ライター手書き YAML が破壊) | M1 で round-trip テストフィクスチャを充実、複雑 YAML サンプル 5 種で先行検証 |
| Yjs UndoManager の captureTimeout で意図しない grouping | M3 | 中 (UX) | M3 着手時に Inspector で `markUndoBoundary()` の発火タイミングをユーザテスト |
| FS Access API の権限再要求 (タブ閉鎖→再起動時) | M1 | 中 | persist permission API + 復元失敗時の再要求 UI を M1 で組み込み |
| Browser watch (polling 5 秒) が UX にならない | M4 | 中 | M4 完了時に実プロジェクトでドッグフード、必要なら interval を 2 秒に |
| solid-flow が 500 ノードで 60 fps 出ない | M5 | 大 | M5 中盤で実データで PoC-B harness 再走、限界が見えれば Sigma.js 早期切替 |
| AI コスト爆発 (デバウンス漏れ) | M7 | 中 | 800ms デバウンス + 月次予算上限 (8000 token / 50 USD デフォルト) を M7 で実装 |
| WebCrypto + パスフレーズの UX | M7 | 中 | M7 着手時に「パスフレーズ忘れた時のリセット導線」を設計 |
| bundle gzip 1MB 超え | M5/M6 | 中 | M1 で動的 import 仕込み済、M5/M6 完了時に bundle 監視 (CI に bundle-size check 追加検討) |
| ドッグフード時間が確保できない | M8 | 大 (MVP done 不可) | M7 中盤からドッグフードを並走 (M8 専用ではなく cumulative に) |

---

## 5. Phase 1 では **やらない** (won't-have、`13_roadmap.md` 確認)

Phase 1 で「やらない」を明文化することで scope creep を防ぐ:

- **Unity 連携** → Phase 2 (`com.actoratect.editor-tools` 側で実装、本 repo は変更最小)
- **Tauri 配布** → Phase 3 (PoC-G の scaffold は配置済、build / signing / updater は Phase 3)
- **カンバン / 進捗ダッシュボード** → Phase 4
- **ビートシート** → Phase 4 (テンプレ提供だけ可、達成度可視化は後)
- **Plot Flow Lens** → Phase 3 (MVP は Relationship Lens のみ)
- **改訂モード (青稿/赤稿)** → Phase 3
- **AI Linter (整合性 AI 拡張)** → Phase 3 (MVP はルールベース 5 種のみ)
- **マルチウィンドウ** → Phase 3 (Tauri / Browser)
- **業界フォーマット互換** (Yarn/Ink/Fountain) → Phase 3 で 1 つ選定
- **ローカライズ翻訳テーブル** → Phase 3 (MVP はキー設計だけ)
- **改訂履歴 (revisions.yaml)** → Phase 3
- **コルクボード** (Plot Board) → Phase 3
- **複数ノード同時編集** → Phase 3
- **集中モード** → Phase 3
- **コマンドパレット (Ctrl+Shift+P)** → Phase 3 が標準だが、M8 余裕があれば差し込み可

---

## 6. 着手前チェックリスト (M1 開始時)

`19_phase0_retrospective.md §5` の意思決定が必要:

- [ ] **L-2 ファイル分割粒度** — 1 ノード = 1 ファイル原則を採用 (推奨。M2 で実装)
- [ ] **L-6 対象 Locale** — UI 第一弾は **日英のみ** (推奨。M3 / M4 で `i18next` 導入)
- [ ] **L-7 デフォルト AI モデル** — 初回起動時の推奨は `claude-opus-4-7` (推奨)、Provider 未設定時はオフライン Lint のみ
- [ ] **Browser watch 戦略** — Phase 1 は polling 5 秒で出荷、FS Observer API 来たら Phase 3 で切替 (推奨)
- [ ] **CI 必須 check に Rust ジョブを追加** — Phase 1 で Tauri 本格稼働しないので **追加しない** (推奨)
- [ ] **Synopsis エディタ choice** — TipTap か CodeMirror Markdown — M4 着手時に decide (CM6 統一推奨で依存削減)

→ 上記の (推奨) は私の提案。User の最終確認後に M1 着手。

---

## 7. milestone branch 命名規則

```
phase1/m1-project-shell
phase1/m2-domain-yaml
phase1/m3-inspector
phase1/m4-era-outline
phase1/m5-graph
phase1/m6-script
phase1/m7-ai-lint-glossary
phase1/m8-polish
```

各 milestone は **1 PR ずつではなく**、論点ごとに小 PR に分割する (例: M1 で 3〜5 PR)。target は `main`、各 PR で CI gate + auto-merge。

---

## 8. 完成形イメージ (M8 完了時のプロジェクト構造)

```
packages/core/src/
├── platform.ts                 ✅ (PoC-C)
├── domain/
│   ├── era.ts                  ✅ (PoC-E)
│   ├── node.ts                 ✅ (PoC-E)
│   ├── variant.ts              ✅ (PoC-E)
│   ├── scenario.ts             🆕 M4
│   ├── templates/              🆕 M2
│   │   ├── character.ts
│   │   ├── location.ts
│   │   ├── item.ts
│   │   └── faction.ts
│   ├── template-engine.ts      🆕 M2
│   └── node-repository.ts      🆕 M2
├── ai/                         ✅ (PoC-F)
│   ├── types.ts
│   ├── registry.ts
│   ├── providers/{Anthropic,OpenAi,Ollama}Provider.ts
│   └── key-vault.ts            🆕 M7
├── history/
│   ├── NodeFieldStore.ts       ✅ (PoC-H)
│   └── project-history.ts      🆕 M2
├── yaml/                       🆕 M1
│   ├── parse.ts
│   └── serialize.ts
├── project/                    🆕 M1
│   ├── ProjectModel.ts
│   ├── ProjectLoader.ts
│   └── ProjectSettings.ts
├── graph/                      🆕 M5
│   ├── relationship-lens.ts
│   └── layout.ts
├── script/                     🆕 M6
│   ├── parser.ts
│   └── serializer.ts
└── lint/                       🆕 M7
    ├── LintRule.ts
    └── rules/{relation,orphan,circular,required,slug}.ts

packages/frontend/src/
├── App.tsx                     ✅ (PoC-A、M1 で route 追加)
├── global/
│   └── EraSlider.tsx           🆕 M4
├── services/
│   ├── ProjectService.ts       🆕 M1
│   ├── SelectionContext.ts     🆕 M3
│   ├── SaveScheduler.ts        🆕 M3
│   ├── AiService.ts            🆕 M7
│   └── EventBus.ts             🆕 M1
├── panels/
│   ├── GraphPanel.tsx          ✅ (PoC-A) → 🔁 M5 で本実装
│   ├── InspectorPanel.tsx      ✅ (PoC-A) → 🔁 M3 で本実装
│   ├── OutlinePanel.tsx        ✅ (PoC-A) → 🔁 M4 で本実装
│   ├── ScriptPanel.tsx         ✅ (PoC-D) → 🔁 M6 で本実装
│   ├── BenchmarkPanel.tsx      ✅ (PoC-B、M1 で動的 import 化)
│   ├── SynopsisPanel.tsx       🆕 M4
│   ├── GlossaryPanel.tsx       🆕 M7
│   ├── ConsolePanel.tsx        🆕 M7
│   └── ProjectPicker.tsx       🆕 M1
├── codemirror/
│   ├── createScriptEditor.ts   ✅ (PoC-D) → 🔁 M6 で Smart モード
│   ├── inlineWidgets.ts        ✅ (PoC-D) → 🔁 M6 で Choice/Sfx/Bgm 追加
│   └── inlineCompletion.ts     🆕 M7
├── bench/                      ✅ (PoC-B、M5 で実データ再ベンチ)
└── pwa/                        🆕 M8

packages/ui-kit/src/
├── form/                       🆕 M3
│   ├── TextInput.tsx
│   ├── NumberInput.tsx
│   ├── EnumSelect.tsx
│   ├── LocalizedStringInput.tsx
│   ├── MarkdownArea.tsx
│   ├── MediaUpload.tsx
│   └── NodeRefPicker.tsx
└── (他 panel 共通 UI を M4-M7 で追加)

packages/cli/src/                🆕 M8
├── commands/
│   ├── validate.ts
│   ├── export.ts
│   └── stats.ts
└── main.ts
```

---

> Phase 1 着手時はこのドキュメントを開いた状態で M1 から順に PR を切る。各 milestone 開始時に「前 milestone 完了の done 条件」を再確認、未達があれば持ち越しを明示する。
