# 08. ファイル形式

## 設計の核

- **YAML を一次ソース**。人間にも AI にも読みやすい
- CSV/JSON は **派生** (エクスポートまたは特定用途)
- すべて **テキスト + Git friendly**
- 大物バイナリは Git LFS / Git Annex
- スキーマバージョンを各ファイルに埋め、マイグレーション可

## 1. なぜ YAML を一次に

| 候補 | 利点 | 欠点 |
|---|---|---|
| **YAML** | 可読性◎、コメント可、複雑な構造 | パーサ依存・エッジケース、空白依存 |
| JSON | 厳密、ツール多い | コメント不可、可読性△ |
| TOML | キレイ | ネストが弱い |
| Markdown frontmatter | 本文と一体 | スキーマ乏しい |
| CSV | Excel互換、表に強い | 階層・参照が弱い |
| ScriptableObject (.asset) | Unity 標準 | 独自バイナリ風、Git 非親和 |

→ **構造データは YAML、本文 (synopsis/notes) は Markdown、表データ (Localization/Glossary) は CSV+YAML 両対応** とする。

## 2. ファイル拡張子の使い分け

| 拡張子 | 内容 | 例 |
|---|---|---|
| `.yaml` | 構造データ全般 | Nodes/, Templates/, Variables/ |
| `.scn.yaml` | シナリオ脚本専用 (シンタックス強調差別化) | scenes/s01.scn.yaml |
| `.md` | 本文 Markdown | synopsis.md, notes.md |
| `.csv` | 翻訳/語彙テーブル | localization/ja.csv |
| `.png` `.jpg` `.webp` | 画像 | media/characters/* |
| `.wav` `.ogg` `.mp3` | 音声 | media/voice/* |
| `.json` | 機械生成キャッシュ・エクスポート | Index/*.json, Export/*.json |
| `.lock` | 排他ロック | (協業時のみ) |

## 3. ファイル冒頭の共通ヘッダ

```yaml
schemaVersion: 1
kind: node                       # node | template | scene | era | calendar | ...
id: 01HF9XABCDEFGHIJ              # ULID
slug: tarou
templateId: template.character
createdAt: "2025-04-01T10:00:00Z"
updatedAt: "2025-04-15T18:00:00Z"
authoredBy: alice
# --- 以下、kind ごとの本体 ---
```

## 4. YAML スタイルガイド

- **インデント 2 スペース**
- **キーは snake_case (英)** + ローカライズはサブツリー
- **配列はハイフン揃え**
- **複数行文字列は `|` (literal block)** を優先 (改行保持)
- **fold (`>`) は禁止** (意図せぬ空白吸収を避ける)
- **タグ (`!!str`) は使わない**
- **アンカー/エイリアス (`&` `*`) はテンプレート定義のみ許容**
- **Boolean は `true`/`false`** (`yes`/`no` 禁止)
- **null は省略** (`field: null` ではなくキー自体を消す)
- **コメントは `# `** (英日混在 OK)

### 4.1 サンプル (キャラ)

```yaml
schemaVersion: 1
kind: node
id: 01HF9XABCDEFGHIJK
slug: tarou
templateId: template.character

displayName:
  ja: 太郎
  en: Tarou

thumbnail: media/characters/tarou_default.png

fields:
  full_name:
    ja: 山田 太郎
    en: Yamada Tarou
  birth_year: -50
  gender: male
  height: 175
  appearance: |
    黒髪・黒目。背丈は平均より少し高め。
    左頬に古傷がある。
  personality: |
    一見気怠げだが、内心は誰よりも責任感が強い。
  speech_style:
    first_person: 俺
    second_person: お前
    tone: casual
    catchphrases:
      - "やってみるか"
      - "面倒だが"

variants:
  - eraId: era.young
    thumbnailOverride: media/characters/tarou_young.png
    fieldsOverride:
      hair_color: black
      personality: |
        理想に燃え、軽率な面もある。

tags: [protagonist, swordsman]
status: draft
notes: |
  終盤で過去と対峙させたい。
```

## 5. ファイル分割粒度の指針

| パターン | 推奨 |
|---|---|
| 1 ノード = 1 ファイル | キャラ/舞台/アイテム等 |
| 1 シーン = 1 ファイル | 脚本 |
| カテゴリ = 1 ファイル | リレーション (relations_family.yaml 等) |
| プロジェクト = 1 ファイル | エラ定義、カレンダー、ProjectSettings |
| 言語 = 1 ファイル | ローカライズ (ja.csv, en.csv) |

→ Git の merge 衝突を最小化。1 PR で触るファイルが分散するように。

## 6. CSV (ローカライズ・用語集)

ローカライズキー、用語集など「**列が固定で行数が多い**」場合 CSV。

```csv
key,ja,en,zh-Hans,context
scene.s01.line.001.tarou,旅の者だ。,Just a traveler.,只是个旅者。,城門で身分を尋ねられて
scene.s01.line.002.gate,身分証を見せろ。,Show me your ID.,出示你的身份证。,
```

- UTF-8 BOM なし
- 改行 LF
- カンマ区切り、`"` でエスケープ
- 1 行目はヘッダ
- 順序: key,ja,en,...,context
- `key` でソート (Git diff を安定化)

## 7. メディアファイル

- **Git LFS 推奨**
- 命名規則: `<type>/<slug>_<variant>.<ext>` (例: `characters/tarou_old.png`)
- 解像度: サムネ用 256x256 / 詳細用は任意
- 自動サムネ生成パイプライン (元画像→ `media/.thumbnails/<hash>.webp`)

## 8. インデックス/キャッシュ (`Index/`)

`.gitignore` 対象。起動時/ファイル変更時に再生成:

```
Index/
├── byTemplate.json         # template -> [nodeId]
├── bySlug.json             # slug -> nodeId
├── relationsAdjacency.json # nodeId -> [{type, target}]
├── searchIndex.bin         # 全文検索用転置インデックス
├── glossaryAuto.json       # 用語集自動検出
└── stats.json              # 進捗統計
```

## 9. プロジェクト設定

```yaml
# ProjectSettings.yaml
schemaVersion: 1
projectName: わが帝国の黄昏
defaultLocale: ja
locales: [ja, en, zh-Hans]
defaultCalendar: cal.gregorian
calendars: [cal.gregorian, cal.eldoria]
defaultEra: era.modern
beatTemplate: save_the_cat
exporters:
  - id: unity_so
    target: Assets/ScenarioData
  - id: yarn
    target: Assets/Yarn
linterRules:
  reference_integrity: error
  unused_variable: warning
  unlocalized_text: warning
  duplicate_slug: error
ai:
  provider: claude
  model: claude-opus-4-7
  defaultLocale: ja
```

## 10. スキーマ検証

- 起動時/保存時に各 YAML をスキーマ検証
- スキーマは C# クラス (`[Serializable]`) と紐付け
- エラーは Console パネルに集約。インライン下線も
- `--validate-only` の CLI モード提供 (CI で実行)

## 11. マイグレーション

`schemaVersion` を上げる際の手順:
1. 旧スキーマでロード
2. 変換関数 (`Migrator_v1_to_v2`) を実行
3. 新スキーマで書き戻し
4. `migration_log.md` を生成 (Git に commit)

## 12. AI コーディング向けの工夫

- 全ファイルに **小さな `# describe:` コメント**を頭に入れる
  - LLM がファイル種別を瞬時に把握
- フィールド名に **動詞/名詞の意味が出るキー名**
- 1 ファイルが **概ね 200 行 / 10KB 以内**
- スキーマ自体を YAML で配布 (LLM プロンプトに同梱可)
- 外部 AI が独立に編集する際の **競合検出マーカー** (内部ハッシュ)
