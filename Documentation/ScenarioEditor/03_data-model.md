# 03. データモデル

## 全体像

```
Project
├── Templates/             # ノード型の定義 (Character, Location, Item, Faction, Event...)
├── Nodes/                 # 個々のノード本体
│   ├── characters/
│   ├── locations/
│   ├── items/
│   ├── factions/
│   └── events/
├── Relations/             # ノード間リレーション (有向辺、属性付き)
├── Eras/                  # 時代エポック定義
├── Calendars/             # 暦 (グレゴリオ + 独自)
├── Scenarios/             # 階層: あらすじ → プロット → 脚本
│   └── ch01/
│       ├── _scene_index.yaml
│       ├── s01_opening.yaml
│       └── ...
├── Variables/             # フラグ/カウンタ/列挙
├── Glossary/              # 用語集
├── Localization/          # 多言語テーブル
├── Media/                 # 画像/音声 (大物は LFS / Git Annex)
└── ProjectSettings.yaml
```

## 1. ノード (Node)

### 1.1 抽象モデル

```
Node {
  id              : NodeId          # ULID, 不変
  templateId      : TemplateId      # どの型か
  slug            : string          # 人間可読ID (URL/ファイル名向き)
  displayName     : LocalizedString # ローカライズ可能な表示名
  thumbnail       : MediaRef?       # サムネ画像 (1枚)
  media           : MediaRef[]      # 追加画像/参考資料
  fields          : Map<string, FieldValue>  # テンプレート定義のフィールド値
  variants        : NodeVariant[]   # 時代別差分
  tags            : string[]        # 分類タグ
  status          : Status          # Draft/Review/Approved/Locked
  notes           : Markdown        # 自由メモ
  createdAt, updatedAt, authoredBy
}
```

### 1.2 NodeVariant (時代差分)

時代エポックごとに、フィールドの差分のみ保持。マージ時に「ベース＋差分」で解決。

```
NodeVariant {
  eraId           : EraId           # 例: "era.modern", "era.100yago"
  fieldsOverride  : Map<string, FieldValue>   # 上書きしたいフィールドだけ
  thumbnailOverride : MediaRef?     # 「100年前は若い姿」など
  notes           : Markdown?
  isAlive         : bool?           # null=継承
}
```

例: 老人になったキャラ
```yaml
id: 01HF9X...
templateId: character
slug: tarou
displayName: { ja: 太郎, en: Tarou }
thumbnail: media/characters/tarou_default.png
fields:
  birth_year: -50            # 物語現在を 0 とした相対年
  faction: faction.red
  height: 175
variants:
  - eraId: era.young
    thumbnailOverride: media/characters/tarou_young.png
    fieldsOverride:
      hair_color: "black"
  - eraId: era.elder
    thumbnailOverride: media/characters/tarou_old.png
    fieldsOverride:
      hair_color: "white"
      health: "weakened"
```

### 1.3 ID 戦略

- **NodeId**: ULID (時系列ソート可能、衝突確率実質ゼロ)
- **slug**: ファイル名兼検索用。重複は警告。リネーム時は別名追従
- 参照は **常に id**。slug は表示と human-friendly な link 解決のみ
- IDはどのファイルにも生で書ける (`character/01HF9X...`)。プロジェクトに一意のインデックスファイルを持つ

## 2. テンプレート (Template)

ノード型の定義。フィールドのスキーマを宣言。

```yaml
# Templates/character.yaml
id: template.character
displayName: { ja: キャラクター, en: Character }
icon: builtin:user
defaultThumbnailColor: "#88aacc"
fields:
  - id: full_name
    label: { ja: フルネーム, en: Full Name }
    type: localized_string
    required: true
  - id: birth_year
    label: { ja: 生年, en: Birth Year }
    type: int
    description: 物語現在(0年)からの相対値
  - id: gender
    label: { ja: 性別, en: Gender }
    type: enum
    values: [male, female, nonbinary, unknown]
  - id: height
    type: number
    unit: cm
  - id: appearance
    type: markdown
  - id: personality
    type: markdown
  - id: voice_actor
    type: ref
    refTemplate: template.person
  - id: speech_style
    type: subform
    fields:
      - { id: first_person, type: string, label: { ja: 一人称 } }
      - { id: second_person, type: string, label: { ja: 二人称 } }
      - { id: tone, type: enum, values: [formal, casual, archaic] }
      - { id: catchphrases, type: list<string>, label: { ja: 口癖 } }
  - id: relations_summary
    type: markdown
    readonly: true
    derivedFrom: relations  # システムが自動生成
relations:
  # 関係性に使えるリレーション種別 (許可リスト)
  allowed:
    - parent_of
    - sibling_of
    - rival_of
    - loves
    - works_for
```

### 2.1 フィールド型 (FieldType) 一覧

| 型 | 説明 |
|---|---|
| `string` | 単行テキスト |
| `localized_string` | 言語マップ (ローカライズ対象) |
| `markdown` | 複数行 Markdown |
| `int`, `number` | 数値、単位付与可 |
| `bool` | チェックボックス |
| `enum` | values 制約付き |
| `date` | 日付 (カレンダー指定可) |
| `era_year` | エラ相対年 (現在を 0 とした年差) |
| `color` | カラーピッカー |
| `ref` | 他ノード参照 (refTemplate で型制約) |
| `list<T>` | リスト |
| `subform` | 入れ子フォーム |
| `media` | 画像/音声/動画ファイル参照 |
| `coordinate` | 地図上の座標 (mapId, x, y) |
| `expression` | 簡易式 (`{playerName}`, `{tarou.age()}` など) |

### 2.2 ビルトインテンプレート

最初から提供する標準テンプレ:

- `character` (キャラ)
- `location` (場所/舞台)
- `item` (アイテム)
- `faction` (組織)
- `event` (歴史的事件/伏線)
- `concept` (テーマ/概念/魔法体系)
- `species` (種族)
- `vehicle` (乗り物/船舶/メカ)
- `language` (作中言語)

ユーザは独自テンプレートを追加可能。

## 3. リレーション (Relation)

ノード間の有向辺。属性を持つ。

```yaml
# Relations/rel_001.yaml  (またはまとめて Relations/all.yaml)
id: rel.01HF9X...
fromNode: character.tarou
toNode: character.hanako
type: loves
sinceEraId: era.young            # この関係がいつから
untilEraId: era.modern           # いつまで (null=現在まで)
strength: 8                       # 0-10
notes: "幼馴染、片想い"
bidirectional: false
```

### 3.1 リレーション型のメタ定義

```yaml
# Relations/_types.yaml
- id: parent_of
  label: { ja: 親, en: Parent }
  inverse: child_of
  edgeStyle: { color: "#ffaa00", style: solid, arrow: triangle }
- id: loves
  label: { ja: 想いを寄せる, en: Loves }
  inverse: loved_by
  edgeStyle: { color: "#ff6688", style: dashed, arrow: heart }
```

「親→子」を登録すれば「子→親」も自動で反映 (inverse 推論)。

### 3.2 グループ (Cluster)

組織や家族など「枠で囲む」用途:

```yaml
- id: cluster.red_squad
  label: { ja: 赤組, en: Red Squad }
  members: [character.tarou, character.hanako]
  visual: { fill: "#ffeeee", border: "#ff6666" }
```

## 4. エポック (Era)

時代の単位。時間軸の選択肢。

```yaml
# Eras/_index.yaml
- id: era.creation
  label: { ja: 創世期, en: Creation }
  yearRange: [-1000, -500]
  ordinal: 0
- id: era.ancient
  yearRange: [-500, -100]
  ordinal: 1
- id: era.100yago
  label: { ja: 百年前, en: 100 Years Ago }
  yearRange: [-100, -90]
  ordinal: 2
- id: era.modern
  label: { ja: 現代, en: Present Day }
  yearRange: [0, 0]
  ordinal: 3
```

エラは「点」でも「期間」でも定義可能。連続したエラの集合が `Calendar` を構成。

## 5. カレンダー (Calendar)

複数の暦を共存させる。グレゴリオ暦と独自暦の対応も持つ。

```yaml
# Calendars/gregorian.yaml
id: cal.gregorian
displayName: グレゴリオ暦
type: builtin.gregorian

# Calendars/eldoria.yaml
id: cal.eldoria
displayName: エルドリア暦
type: custom
yearLength: 400
months:
  - { name: 春の月, days: 100 }
  - { name: 夏の月, days: 100 }
  - { name: 秋の月, days: 100 }
  - { name: 冬の月, days: 100 }
weekDays: [太, 月, 火, 水, 木, 金, 星]
epoch: { gregorianYear: 0, customYear: 1000 }   # 暦の対応点
```

## 6. シナリオ階層

詳細は `06_scenario-layers.md`。ここでは構造概要のみ:

```
Scenarios/
├── _project.yaml               # 全体構造
├── ch01/
│   ├── _index.yaml             # 章メタ (タイトル、ビート、要約)
│   ├── synopsis.md             # あらすじ (Markdown)
│   ├── plot.yaml               # プロットカード列
│   └── scenes/
│       ├── s01_opening.yaml    # 脚本 (発話列)
│       └── s02_meeting.yaml
└── ch02/...
```

## 7. 変数 (Variable)

ゲーム実装側と共有するフラグ/カウンタ。

```yaml
# Variables/story_flags.yaml
- id: var.met_alice
  type: bool
  default: false
  scope: persistent          # persistent | session | scene
  description: アリスと初対面したか
- id: var.player_name
  type: string
  default: "プレイヤー"
  localized: false
- id: var.affection.alice
  type: int
  default: 0
  range: [-100, 100]
```

## 8. 用語集 (Glossary)

```yaml
# Glossary/_terms.yaml
- term: アクトラテクト
  reading: あくとらてくと
  category: organization
  refNode: faction.actoratect
  forbiddenAliases: [アクトラ, Actra]   # 検出して警告
  description: 物語の中心となる組織。
```

## 9. ファイル分割ポリシー

Git ファーストのため、衝突しやすい大ファイルを避ける。

| データ種別 | 1ファイル単位 | 理由 |
|---|---|---|
| Node (Character/Item等) | 1ノード=1ファイル | 編集者が分散しても衝突しにくい |
| Relation | テーマ別 (relations_family.yaml 等) | 1リレーション=1ファイルだと多すぎる |
| Era / Calendar | プロジェクトに1ファイル | 数が少ない |
| Scenario Scene | 1シーン=1ファイル | 1人1シーン執筆が普通 |
| Glossary | 1ファイル / 章別分割可 | 競合稀 |
| Variable | 名前空間別 (1ファイル/数十変数) | 衝突あり、PR で吸収可 |

## 10. AI コーディングへの配慮

### 10.1 スキーマ自体が短い
- フィールド数を絞り、subform は名前付きで再利用
- テンプレート定義もYAMLなので AI が読み書きできる

### 10.2 コンテキスト最小化
- 1ファイルが LLM のコンテキストに楽に収まるサイズ (1〜10KB目安)
- 1ノード=1ファイル原則
- 大きい本文 (Markdown) はファイル分離

### 10.3 機械可読な参照
- 参照は常に `<templateSlug>.<slug>` 形式の文字列
- `[[...]]` Wiki リンクも併用 (人間用)、AI には id を渡す

### 10.4 スキーマ Lint
- `*.yaml` 保存時にスキーマ検証
- AI が壊れた YAML を吐いても CI で検出

## 11. データ整合性のメタ

- すべてのファイルに `schemaVersion: 1` を含める
- マイグレーションは ProjectSettings の `schemaVersion` を見て段階的に走らせる
- 内部 `Index/` を持ち、起動時に再構築 (LSM tree 風)
  - `byTemplate.json`、`bySlug.json`、`relationsAdjacency.json` などのキャッシュ
  - `.gitignore` 対象

## 12. 将来拡張用の予約フィールド (Phase X 棚上げ前提)

SaaS 化 (`17_saas.md` / Phase X、現時点では棚上げ) を **後で着手したくなった場合に備えて**、後方互換的に追加するフィールドだけ予約しておく。
**Phase 0〜4 では必須ではない**。空のままで問題なく動く。実装時はこれらのキーを「**未指定なら local 単独**」と読み替える。

### 12.1 ノード/シーンへのオプション追加

```yaml
# (既存フィールドに加えて)
visibility: org              # org | private | public  (Phase 5+ で意味を持つ)
permissions:
  view:  [role.viewer, role.editor]
  edit:  [role.editor]
ownership:
  authoredBy: alice
  lastModifiedBy: bob
ai:
  allow: true                # AI 送信を許可するか
```

### 12.2 ProjectSettings への追加

```yaml
tenantId: null               # ローカルプロジェクトでは null。SaaS 連携時に付与
projectId: null              # 同上
syncMode: local-only         # local-only | cloud-backed | cloud-primary
cloud:
  endpoint: null             # https://api.actoratect.dev/...
  region: null               # tokyo | global
```

### 12.3 監査ログ (audit-log.yaml)

将来 SaaS 連携前提で、ローカルでも変更履歴を記録:

```yaml
- ts: "2026-04-15T10:00:00Z"
  who: alice
  op: update
  target: node.character.tarou
  fieldsChanged: [appearance, fields.height]
  origin: web | tauri | unity | api | ai
```

ローカルでも蓄積し、Cloud 化したら同期。

### 12.4 ID ネームスペース

SaaS で同名スラグの組織間衝突を避けるため、最終的な参照は `tenantId/projectId/nodeId` の 3 段。
ローカル単独では tenantId/projectId は省略可、参照の解決は `null` を allow。

## 13. AI コーディング/SaaS の同居

- ローカル単独運用と SaaS 運用で **データ構造を変えない**
- 追加フィールドは optional、欠落時は安全な既定値
- AI Agent はローカル/SaaS どちらの YAML も同じスキーマで扱える
- これにより「最初はローカル、途中からクラウド」「途中で OSS Self-host へ」がスムーズ
