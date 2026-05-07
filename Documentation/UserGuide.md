# Scenario Studio — 使い方ガイド

このドキュメントは「Scenario Studio を実際に書く側 / レビューする側」が読むためのガイドです。
技術設計は `Documentation/ScenarioEditor/` の 00-22 章を参照してください。

---

## 1. これは何

**Scenario Studio** は、長編シナリオ (キャラ × 章 × シーン × Era × 用語集) を 1 つのフォルダで持ち回りながら、
書く / 直す / 図にする / レビューに渡す をすべて 1 アプリで完結させるためのエディタです。

設計の柱:

- **ローカルファースト** — プロジェクト = 自分の PC のフォルダ。クラウドに依存しません。
- **テキストファイル原本** — 全データは YAML / Markdown。Git でバージョン管理可。
- **タブを増やさない** — 新機能は rail / overlay / 右クリック / Cmd+K にまず入れる。書く画面に文脈を寄せる。
- **AI はベンダーフリー** — Claude / OpenAI / Gemini / Ollama / Codex / Aider を切り替え可。生成は必ず人間承認を通す。

---

## 2. 5 分セットアップ

### 起動 (開発中)

```powershell
pnpm install
pnpm -F frontend dev
# → http://localhost:5173/
```

ブラウザで開いた **Welcome 画面** から:

- **「FF7 サンプルを開く」** — まず触るならこれ。実プロジェクトと同じ構造を体感できます。
- **「フォルダを選択」** — 既存プロジェクトを開く。
- **「新規プロジェクト」** — 空フォルダから作成。

> Chrome / Edge は File System Access API でフォルダ直書き、Firefox / Safari は OPFS フォールバック。
> 本番運用は Chrome / Edge 推奨です。

### 配布版

- **GitHub Pages**: `https://<owner>.github.io/<repo>/` (push で deploy)
- **zip 配布**: Actions Artifacts からダウンロード → `npx serve dist` などで開く

詳細: `CLAUDE.md` の「配布 (PR-AK)」節を参照。

---

## 3. 画面の見方 (パネル早見)

Workspace は **Dockview** で自由にレイアウトできます。各パネルは drag でフロート / 分割可。
ヘッダ右の **⟳** で初期 layout に戻ります。

| パネル | 何をする |
|---|---|
| 🕸 **グラフ** | キャラ / 場所 / 派閥 の関係性を見る・編集する。Lens 切替で 🗺 **Plot Flow** (シーン遷移) も表示 |
| 📝 **インスペクタ** | 選択中ノード (キャラ / 場所 / アイテム) のフィールド編集 |
| 📚 **アウトライン** | 章 / シーン構造を drag 並べ替え |
| 📖 **あらすじ** | プロジェクト全体の Markdown synopsis (画像も埋め込める) |
| 🎬 **脚本** | scene script を block 単位 (line / aside / stage / sfx / bgm / choice) で編集 |
| 🧪 **ベンチ** | 大規模グラフのレンダリング検証 (開発用) |
| ⚠ **コンソール** | Lint issue 一覧。クリックで該当ノード / シーンへジャンプ |
| 📘 **用語集** | 正式表記 / 別表記 / 禁止表記 を CRUD |
| 🤖 **AI** | プロバイダ選択・unlock |
| ⚙ **設定** | プロジェクト設定 / Era CRUD |
| 🗂 **プロット** | シーン timeline (drag-reorder) |
| 📊 **統計** | セリフ密度 / 章別行数 |
| ⏳ **Era 年表** | 横軸 Era × 縦軸 キャラの生死マトリクス |

### Workspace ヘッダ (常駐)

```
[Project名] [Era Slider] [SaveBadge] [⌨] [🩺] [?] [📝 Patch] [🎮] [⤓ Export] [⟳] [プロジェクトを閉じる]
```

| ボタン | 機能 |
|---|---|
| 🩺 | **Project Health** — Lint Top / 不足アセット / 章別進捗 (起動 10 秒で「次に直すべき」が分かる) |
| 📝 Patch | **AI Patch Queue** — AI / 用語スキャナの修正候補を承認 / 却下 |
| 🎮 | **Unity Readiness** — Unity 出力前のチェック (サムネ / 音声 / metadata 不足) |
| ⤓ Export | scene / chapter / project を text / Markdown / **Review HTML** で書き出し |

---

## 4. 書く・直す・整える の流れ

### 4.1 「今日やること」の把握

起動 → 🩺 **Project Health** を開く → 上から消化:

1. **エラー** Lint (赤) → クリックで Inspector / Script へジャンプ
2. **警告 / 情報** → 余裕があれば
3. **不足アセット** (サムネ未設定 / display_name 不在 / 空 cast) → リストから 1 件ずつ
4. **章別進捗バー** → 進捗の薄い章に着手

### 4.2 脚本を書く (ScriptPanel + Rail)

🎬 **脚本** パネルを最大化しても作業できます。右側に **Script Context Rail** が常駐:

- **概要**: タイトル / blocks / 行数 / 文字数 / 行平均
- **登場**: キャラサムネ + 名前 (クリック → Inspector へジャンプ)
- **用語**: glossary ヒット chip
- **警告**: シーン内 Lint issue
- **AI 文脈**: AI に送るプロンプトのプレビュー

> **コツ**: 編集は Rail からは行いません (read-only)。直したいときは「Inspector へジャンプ」「右クリック AI」「Glossary Panel」のどれか。

書きながら使うキーボード:

- `Tab` で AI 1 行続き提案を確定
- ブロック挿入は脚本上部のツールバー

### 4.3 構造を見る・直す (Graph)

🕸 **グラフ** で Lens を切り替え:

- **🕸 Relationship** — キャラ間の関係性 (デフォルト)。 `Shift+drag` で関係作成
- **🗺 Plot Flow** — シーン間遷移 (next / choice goto)。⚠ バッジ = 到達不能 / 解決失敗

2 段目の filter 行:

- 👤 キャラ / 📍 場所 / 🗝 アイテム / ⚑ 勢力 を表示 / 非表示
- 🔍 検索: label / ID 部分一致 → 非マッチを薄く表示

### 4.4 Era (時系列の差分) を扱う

ヘッダの **Era Slider** で時代を切替。各 Era で「キャラがどう違うか」を override できます:

- Inspector の field に「⤴ 他 Era にも適用」ボタン
- BulkVariantOverlay で対象 Era を checkbox 選択 → 1 回で全 Era に書込

> **コツ**: Era は「設定の差分管理」用。base に共通項目、Era は差分のみ。

---

## 5. AI を文脈付きで使う

Scenario Studio の AI は **「便利な補完」より「安全な変更」** を重視しています。

### 5.1 セットアップ

🤖 **AI** パネルで provider を選択 → API key 入力 → unlock。
key は WebCrypto + PBKDF2 で暗号化保存 (詳細: `16_security.md`)。

### 5.2 場面別の使い分け

| やりたいこと | 起点 | 経路 |
|---|---|---|
| 1 行続きを補完 | Script で書きながら | `Tab` |
| シーン要約 | 任意 | `Cmd+Shift+A` → Show prompt 確認 → 1 行 |
| テキスト欄を 3 案で書き直す | textarea / input を **右クリック** | preset 選択 → 3 案比較 → ✎ / ＋ / 📋 |
| 用語表記を一括修正 | `Cmd+Shift+Q` | 「🔎 用語修正スキャン」→ 行ごと採用 |
| 外部 AI (Codex / Claude.ai / Gemini) に文脈を渡す | `Cmd+Shift+H` | 📋 Clipboard / 💾 ファイル / 🌐 deep link |

### 5.3 安全装置

- **Show prompt**: AI に送る内容を必ずプレビューしてから送信
- **Patch Queue の drift 検知**: 採用前に同 field を手で編集すると、その patch は自動 reject
- **採用は通常の Undo に乗る** (Cmd+Z で戻せる)
- **3 案の温度違い** (0.3 / 0.6 / 0.9) で多様性確保。確定 1 案にロックインしない

### 5.4 ローカル AI に外注する (UX-8 Local Agent Handoff)

`Cmd+Shift+H` で「いまの選択範囲 (node / scene / project)」をパッケージ化:

- 📋 Clipboard にコピー → ChatGPT / Claude.ai / Gemini に貼る
- 💾 `.editor/ai-context/<timestamp>.md` に保存 → ローカルの Codex / Claude Code / Aider に渡す
- 🌐 deep link で各 AI Web を直接開く (URL 長制限時は clipboard fallback)

---

## 6. 配布・レビュー・Unity に渡す

### 6.1 レビュー用 1 枚 HTML (UX-5)

`Cmd+E` → Export → **「レビュー用 HTML」** を選択 → 「ブラウザでプレビュー」 / 「ダウンロード」

特徴:

- 外部 CSS / JS / フォント不要 (オフラインで開ける)
- キャラサムネは **data: URL でインライン化** (画像ファイルを別途配らずに済む)
- 目次クリックで scene にジャンプ
- 末尾に Cast / 用語集 / Lint Top を付与

> **コツ**: チームの「読むだけ」レビュアーへの第一手。説明なしで読める形になります。

### 6.2 Unity に渡す前のチェック (UX-4)

🎮 **Unity Readiness** で:

- サムネ未設定キャラ
- SFX / BGM の cue 名空欄
- display_name / dev_name 不在
- StringTable 推定サイズ

問題行をクリック → 該当ノード / シーンへジャンプ。

### 6.3 Markdown / プレーンテキスト

`Cmd+E` → 範囲 (scene / chapter / project) × 形式 (.md / .txt) を選択 → 生成 → クリップボード or ダウンロード。

---

## 7. ショートカット早見表

| 操作 | Win/Linux | Mac |
|---|---|---|
| コマンドパレット | `Ctrl+K` | `Cmd+K` |
| ショートカット一覧 | `Ctrl+/` | `Cmd+/` |
| 全文検索 | `Ctrl+F` | `Cmd+F` |
| ID 一覧 | `Ctrl+I` | `Cmd+I` |
| Export ダイアログ | `Ctrl+E` | `Cmd+E` |
| 即時保存 (flush) | `Ctrl+S` | `Cmd+S` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y` | `Cmd+Z` / `Cmd+Shift+Z` |
| AI シーン要約 | `Ctrl+Shift+A` | `Cmd+Shift+A` |
| Local Agent Handoff | `Ctrl+Shift+H` | `Cmd+Shift+H` |
| AI Patch Queue | `Ctrl+Shift+Q` | `Cmd+Shift+Q` |
| 続き提案を確定 (Script) | `Tab` | `Tab` |
| Script Find & Replace | `Ctrl+H` | `Cmd+H` |

---

## 8. AI 向け — フォルダ構造 / データ作成スペック

このセクションは **AI コーディングエージェント (Codex / Claude Code / Cursor / Aider 等) が
「ユーザーの依頼を読んで、どこに何のファイルをどんな形で作るか」を自律判断できる**
ように書かれた仕様です。
人間が読む場合も「ファイルを直接編集したい」「Git diff を読みたい」ときの参考になります。

### 8.1 全体マップ (3 行で覚える)

1. **作品の全体像** = `Scenarios/` (章 / シーン / synopsis)
2. **登場するもの** = `Nodes/` (キャラ / 場所 / アイテム / 派閥)
3. **設定の補強** = `Eras/` (時系列差分) + `Glossary/` (用語) + `Relations/` (関係) + `Media/` (画像音声)

### 8.2 ディレクトリレイアウト (実物)

```
<プロジェクトフォルダ>/
├── ProjectSettings.yaml          # プロジェクト基本設定
├── README.md                     # 任意。プロジェクト説明
├── Scenarios/
│   ├── _project.yaml             # 章順
│   ├── synopsis.md               # プロジェクト全体のあらすじ (Markdown)
│   ├── synopsis-images/          # synopsis 内に貼った画像
│   ├── ch01_<slug>/              # 章フォルダ — slug は a-z0-9_ のみ
│   │   ├── _index.yaml           # 章のメタ (title / summary)。任意 (無くても scenes があれば slug が title になる)
│   │   ├── _scene_index.yaml     # シーン順
│   │   ├── synopsis.md           # 章のあらすじ (任意)
│   │   ├── s01_<slug>.scn.yaml   # 各シーン
│   │   └── s02_<slug>.scn.yaml
│   └── ch02_<slug>/...
├── Nodes/
│   ├── characters/               # template.character
│   │   └── <slug>.yaml
│   ├── locations/                # template.location
│   ├── items/                    # template.item
│   └── factions/                 # template.faction
├── Eras/
│   ├── era.world.yaml            # 親 (世界そのもの)
│   ├── era.<id>.yaml             # 子 (時代 / Variant)
│   └── ...
├── Glossary/
│   └── terms.yaml                # 用語集
├── Relations/
│   └── relations.yaml            # キャラ間の関係性
├── Media/                        # 画像 / 音声 (キャラサムネ / SFX / BGM)
├── Localization/                 # 翻訳 (将来用)
├── Templates/                    # builtin テンプレ override (通常空)
├── Variables/                    # シナリオ変数 (将来用)
└── .editor/                      # machine-local。Git ignore 推奨
    ├── ai-keys.json              # AES-GCM 暗号化された API key
    └── ai-context/<ts>.md        # Local Agent Handoff の保存物
```

### 8.3 ファイル別スキーマ (作る / 読む 両方の参考)

すべての YAML は先頭に `schemaVersion: 1` を入れる。識別子は **英字 + 数字 + アンダースコア** のみ
(slug は a-z0-9_、id は ULID で `0101...` 形式)。

> **ID 生成ルール**:
> - **ULID** (`0101KQRB45...`) を使うのがプロジェクト統一。新規ノード作成時は ULID generator を使う。
> - AI が手作業で書く場合、衝突回避のため **既存ファイルを必ず読んで重複しない値**を選ぶ。
> - **slug** は人間可読 (a-z0-9_)。ファイル名と一致させる。

#### `ProjectSettings.yaml`

```yaml
schemaVersion: 1
name: 作品タイトル
locales:
  - ja
  - en
```

#### `Scenarios/_project.yaml`

章の **登場順** を定義 (フォルダ名 = slug)。

```yaml
schemaVersion: 1
kind: scenario_project
chapters:
  - ch01_midgar_bombing
  - ch02_nibelheim_memory
  - ch03_<次の章>
```

#### `Scenarios/synopsis.md`

プロジェクト全体のあらすじ (Markdown 自由形式)。画像を貼るときは
`synopsis-images/<filename>.png` に置いて `![](synopsis-images/foo.png)` で参照。

#### `Scenarios/<chapter>/_index.yaml`

章のメタ (任意ファイル)。無くても `_scene_index.yaml` か `*.scn.yaml` があれば章として認識され、
タイトルは slug がそのまま使われる。後で title / summary を付けたくなったらこれを足す。

```yaml
schemaVersion: 1
kind: chapter
id: chapter.ch01_midgar_bombing
slug: ch01_midgar_bombing
title: '第 1 章: 八番魔晄炉'
summary: AVALANCHE による魔晄炉爆破。元ソルジャー クラウドが傭兵として参加する。
```

#### `Scenarios/<chapter>/_scene_index.yaml`

章内のシーンの **登場順**。

```yaml
schemaVersion: 1
kind: scene_index
scenes:
  - s01_train_arrival
  - s02_reactor_infiltration
  - s03_escape
```

#### `Scenarios/<chapter>/<scene>.scn.yaml`

シーン本体。`script` 配列が物語の中核。各 block は `kind` で型を区別 (8.4 参照)。

```yaml
schemaVersion: 1
sceneId: scene.s01_train_arrival
plot:
  title: '列車到着'
  cast: []                    # 任意。空でも可
  beat: '主人公とバレットの出会い'   # 任意。場面の意図メモ
  tension: 0.4                # 任意。0-1 の数値で緊張度
  status: 'draft'             # 任意。draft / review / done

script:
  - { kind: stage, text: '深夜のミッドガル八番街駅。蒸気と魔晄の匂い。' }
  - { kind: line, who: barret, emotion: angry, text: 'おい新入り! 動け!' }
  - { kind: line, who: cloud, emotion: calm, text: '...わかってる。' }
  - { kind: aside, who: cloud, text: '傭兵。それが今の俺の肩書きだ。' }
  - { kind: stage, text: '改札を抜け、二人は魔晄炉へ向かう。' }
  - { kind: sfx, name: ambient_steam }
  - { kind: bgm, cue: bgm_midgar_underground }
  - kind: choice
    prompt: 'バレットの命令にどう応える?'
    options:
      - { text: 'すぐ動く', then: 's01b_obedient' }
      - { text: '皮肉を言い返す', then: 's01b_sarcastic' }
```

#### `Nodes/characters/<slug>.yaml`

```yaml
schemaVersion: 1
kind: node
id: 0101KQRB45DV3ZPN2GG4YZS32J0D       # ULID — 既存と衝突しない値
templateId: template.character
slug: aerith                            # ファイル名と一致
fields:
  display_name: エアリス・ゲインズブール    # 表示用 (UI / Export で使用)
  reading: えありす・げいんずぶーる         # 読み仮名
  dev_name: Aerith                       # script の who で参照する英字内部名
  gender: female                         # enum: male / female / nonbinary / unknown
  tone: casual                           # enum: casual / polite / formal / rough / archaic
  first_person: わたし                    # 一人称 (口調確認用)
  birth_year: -2                         # 物語時系列の相対年 (整数可)
  height: 163                            # 数値 (cm)
  appearance: ピンクのリボンで髪を結った...  # multiline 可
  personality: 太陽のように朗らかで...       # multiline 可
  faction: 0101KQRB45CY0ZGV70XMJEPFY5NK  # node_ref → factions/<slug>.yaml の id
thumbnail: Media/aerith.png              # 任意。キャラサムネ画像パス (相対)
thumbnailRect: { x: 10, y: 0, w: 100, h: 100 }  # 任意。立ち絵から丸サムネを切り抜く矩形
```

#### `Nodes/locations/<slug>.yaml`

```yaml
schemaVersion: 1
kind: node
id: 0101KQRB45GA8...
templateId: template.location
slug: midgar_sector7
fields:
  display_name: 八番街スラム
  reading: はちばんがいすらむ
  parent_location: 0101KQRB45GMID7...    # 任意。node_ref → 親 location
  description: ...
```

#### `Nodes/items/<slug>.yaml`

```yaml
schemaVersion: 1
kind: node
id: 0101KQRB45...
templateId: template.item
slug: buster_sword
fields:
  display_name: バスターソード
  owner: 0101KQRB45...                   # 任意。node_ref → character
  description: ...
```

#### `Nodes/factions/<slug>.yaml`

```yaml
schemaVersion: 1
kind: node
id: 0101KQRB45...
templateId: template.faction
slug: avalanche
fields:
  display_name: アバランチ
  leader: 0101KQRB45...                  # 任意。node_ref → character
  description: ...
```

#### `Eras/era.<id>.yaml`

時系列差分を表現。`parent` で継承元 Era を指定すると、parent の override が引き継がれる。

```yaml
schemaVersion: 1
kind: era
id: era.present                          # ファイル名と一致
label: 本編 (メテオ襲来期)
parent: era.world                        # 任意。Era 階層の親
yearRange: [5, 5]                        # 任意。物語年。[start, end]
```

各 Era で **キャラ field を上書き** したい場合は、ノード YAML 側に `variants` ブロックを追加:

```yaml
schemaVersion: 1
kind: node
id: 0101...
templateId: template.character
slug: cloud
fields:
  display_name: クラウド
  appearance: 青年期の容姿
variants:
  era.flashback_nibelheim:
    fieldsOverride:
      appearance: ニブルヘイム時代の少年クラウド
      isAlive: true
    isAlive: true
```

#### `Glossary/terms.yaml`

```yaml
schemaVersion: 1
kind: glossary
terms:
  - term: マテリア                # 正式表記
    aliases:                       # 認められた別表記
      - Materia
    forbidden:                     # 禁止表記 (Patch Queue scanner が検出)
      - まてりあ
    description: 魔法を発動させる結晶。
  - term: ライフストリーム
    aliases: [Lifestream, 星の生命]
    forbidden: []
    description: 星全体を巡る生命エネルギー。
```

#### `Relations/relations.yaml`

```yaml
schemaVersion: 1
kind: relations
relations:
  - id: rel.01KQRB45JB...                # 任意の一意 ID
    source: 0101...                       # node id (character)
    target: 0101...                       # node id
    type: friend                          # friend / enemy / family / mentor / love / rival / etc.
    label: 幼馴染                          # 任意。表示用ラベル
```

### 8.4 Script block 種別 (scene の `script` 配列)

各要素の `kind` で型が決まる。以下が **すべての種別**:

| kind | 用途 | 必須 field | 任意 field |
|---|---|---|---|
| `stage` | ト書き / 情景描写 | `text` | — |
| `line` | キャラのセリフ | `who`, `text` | `emotion` |
| `aside` | 独白 / モノローグ | `text` | `who` |
| `action` | キャラの動作 | `who`, `text` | — |
| `sfx` | 効果音 cue | `name` | — |
| `bgm` | BGM cue | `cue` | — |
| `choice` | 選択肢分岐 | `prompt` | `options[].text`, `options[].then` |

`who` は **キャラの `dev_name` または `slug`**。`emotion` は自由文字列 (例: `angry` / `calm` / `happy` / `sad` / `surprised` / `embarrassed`)。
`then` は **同章内の scene slug** (`s01b_xxx`) または **`<chapter>/<slug>`** を指す。

> **AI が新規 scene を作るとき**: `cast` フィールドを書くなら、`who` で参照したキャラ全員を漏らさず列挙。
> ただし `cast: []` は許可されているので、面倒なら空でも Lint は通る (Project Health は警告するが)。

### 8.5 「ユーザーがこう言ったら、何を作る」決定木

ユーザーの依頼 → 触るファイル の典型的なマッピング:

| ユーザー依頼例 | 触る場所 | 注意 |
|---|---|---|
| 「新キャラ ◯◯ を追加して」 | `Nodes/characters/<slug>.yaml` 新規 | display_name / dev_name / slug を埋める。faction は既存 id を参照 (なければ後付け) |
| 「◯章 △番目に新シーン」 | `Scenarios/<ch>/<scene>.scn.yaml` 新規 + `_scene_index.yaml` 更新 | scene 中で参照する who は dev_name / slug いずれか実在 |
| 「キャラ A の口調を変えて」 | `Nodes/characters/A.yaml` の `tone` / `first_person` | 過去 scene の line も整合性チェック (Lint が拾う) |
| 「用語『◯◯』の表記揺れを禁止に」 | `Glossary/terms.yaml` の forbidden に追加 | 既存 scene 内の forbidden 表記は Patch Queue で一括修正可 |
| 「Era B 時点ではキャラ A は子供」 | `Nodes/characters/A.yaml` の `variants:` に era.B のオーバーライドを追加 | base はそのまま、差分のみ書く |
| 「シーンに分岐を追加」 | `<scene>.scn.yaml` の script に `kind: choice` ブロック追加 | 各 option の then 先 scene が実在することを確認 |
| 「あらすじを更新」 | `Scenarios/synopsis.md` (全体) または `Scenarios/<ch>/synopsis.md` (章) | 画像は `synopsis-images/` に置く |
| 「キャラ A と B を恋人関係に」 | `Relations/relations.yaml` に entry 追加 | source / target は character の **id** (slug ではない) |

### 8.6 やってはいけない (AI 用 don't list)

- **id を再利用しない** — 新規ノード作成時は他の `*.yaml` を全部 grep して衝突確認。
- **slug にスペース / 日本語 / 大文字 を入れない** — a-z0-9_ のみ。
- **dev_name は英字** — script の `who: aerith` で参照される。日本語にすると参照が通らない。
- **builtin template を勝手に改変しない** — `Templates/` はカスタム override のみ。標準フィールドは
  `packages/core/src/domain/templates/*.ts` に固定定義あり。
- **`.editor/` を編集しない / コミットしない** — machine-local。
- **`schemaVersion: 1` を省略しない** — Loader が拒否する。
- **kind を省略しない** — `kind: node` / `kind: era` / `kind: scene_index` / `kind: glossary` / `kind: relations` / `kind: scenario_project` のいずれか必須。
- **node_ref で存在しない id を書かない** — Lint が `node-ref-missing` で警告。Inspector に赤く出る。
- **章フォルダは空にしない** — `_index.yaml` も `_scene_index.yaml` も `*.scn.yaml` も無いと章ごとロードから漏れる (= 0.1.0 までは silently、以降も「scene 0 件 + index 無し」のみ skip)。最低 1 つの scene か `_index.yaml` を置いておく。

### 8.7 検証 (作ったあと走らせるべき)

新規ファイル / 変更後はアプリを開き直さず、以下で機械検証可:

1. **Lint** が拾うエラーは Project Health (🩺) で見える:
   - `missing-display-name` / `missing-dev-name` / `node-ref-missing` / `script-unknown-who` /
     `consecutive-same-speaker` / `missing-thumbnail` / `empty-script` / `glossary-forbidden`
2. **Plot Flow Lens** で choice の `then` 先が実在するか可視化 (⚠ バッジ)
3. **Unity Readiness** (🎮) で「Unity 出力前に揃っていないアセット」を一覧化

### 8.8 AI が困ったときの逃げ道

- **既存ファイルを 1 つ読む**: 同種の YAML が必ず 1 つはあるはず (`Nodes/characters/cloud.yaml` 等)。
  形式コピーすれば 8 割正解。
- **ULID を生成できないとき**: 既存 ULID を検索 (`grep -rh "id: 0101" Nodes/`) → 末尾 1 桁を手で変える。
  最後の手段。生成器を呼べるならそちらが安全。
- **template field を覚えていないとき**: `packages/core/src/domain/templates/` 配下の TS が source of truth。
  欠けても Inspector が defaultValue を埋めるので、必須は `display_name` と `dev_name` (キャラのみ) と `slug` だけ。

> Git で履歴管理する場合、`.editor/` は **`.gitignore`** に入れるのがおすすめ (machine-local な設定 / API key 暗号化ファイルが入る)。

---

## 9. コツ & よくあるハマりどころ

### 書くとき

- **タブを最大化しない癖**: ScriptPanel だけ全画面にしても Rail がコンテキストを補ってくれます。Inspector を毎回切り替える必要は減ります。
- **Era は base 共通 + 差分**: 全項目を Era に書かない。base に書ける情報は base に。
- **YAML を直接いじっていい**: アプリ起動中でも、外部エディタで `.scn.yaml` を直接編集 → 保存すると ConflictDetector が検知し、上書きを止めて prompt します。

### 直すとき

- **Lint は「起動 10 秒で見える」が建前**: 🩺 Health で済まないなら、Console panel にも飛ばせるようリストから jump できます。
- **AI 修正は queue に積む**: 自動適用しないことで、後で他の編集と衝突しないか **drift 検知** で守られます。

### 整えるとき

- **Plot Flow Lens で「閉じてないシーン」を可視化**: choice の goto 先タイプミスや、章末の dead-end は ⚠ バッジが先に教えてくれます。
- **Review HTML は「説明なしで読める形」のチェック用**: 自分で 1 度読んで、レビュアー目線で違和感がないか先に確認すると後の往復が減ります。

### AI と協業するとき

- **3 案を全部試さなくていい**: 温度違いの 3 案は「採用 1 個 / 参考 2 個」想定。書き手の好みが出ます。
- **Local Agent Handoff のパッケージは「相手が読む」前提**: glossary 抜粋・cast・該当 YAML が入るので、ChatGPT に貼っても文脈が成立します。

### 困ったら

- **保存できない**: ヘッダの SaveBadge が赤 (`error`) なら、ConflictDetector が外部変更を検知している可能性。Toast を見る → 必要なら手動で path 確認。
- **AI が動かない**: AI panel が unlock 状態か確認。ロック中だと Patch Queue / 右クリック AI も「lock」表示。
- **Layout が崩れた**: ヘッダ ⟳ で初期化。
- **文字化け**: YAML / Markdown は UTF-8 前提。外部エディタで保存する際は BOM なし UTF-8 で。

---

## 10. ロードマップと現在地

- **Phase 1 (M1-M8)** + **post-MVP A〜AY**: ほぼ完了。MVP として全機能稼働。
- **Phase 2** (Unity 統合 / 外部配布インストーラ / i18n / dark theme): 本格着手前。
- **Phase X** (SaaS): 棚上げ。

詳細: `Documentation/ScenarioEditor/13_roadmap.md` および `21_remaining_tasks.md`。

---

## 11. 参考リンク (このリポジトリ内)

- 全体設計: `Documentation/ScenarioEditor/00_README.md`
- データモデル: `03_data-model.md`
- グラフ: `04_graph-editor.md`
- AI ワークフロー: `11_ai-workflow.md`
- Export 仕様: `10_export.md`
- セキュリティ: `16_security.md`
- Unity 統合: `18_unity-integration.md`
- UX 改善方針: `22_ux_feature_review.md`
- 残タスク: `21_remaining_tasks.md`
