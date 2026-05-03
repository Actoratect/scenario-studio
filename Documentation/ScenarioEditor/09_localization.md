# 09. ローカライズ

## 設計の核

- **すべてのプレイヤー可視テキストにキーを振る**
- **キーは ID ベース** (オリジナル文字列ベースではない)
- **翻訳メモリ (TM)** とコンテキスト情報を最初から持つ
- **Unity Localization パッケージと共存**しつつ、独自 StringDB も並走可能

## 1. キー設計

### 1.1 階層型キー

```
project.<area>.<entity>.<field>[.<index>]
```

例:
```
scenario.ch01.s01.line.0001
scenario.ch01.s01.line.0002
node.character.tarou.full_name
node.character.tarou.appearance
ui.button.confirm
glossary.actoratect.description
```

### 1.2 キー生成戦略

| 種別 | 生成元 |
|---|---|
| 脚本セリフ | `scenario.<chId>.<sceneId>.line.<行番号 padding 4桁>` |
| ノードフィールド | `node.<templateSlug>.<nodeSlug>.<fieldId>` |
| UI 文字列 | `ui.<panel>.<element>` |
| 用語集 | `glossary.<termSlug>.<part>` (term/reading/description) |

行番号は **挿入時に永続化**。後から行が増減してもズレない (Stable ID)。

### 1.3 重複検出/孤児検出

- 重複キーは Lint エラー
- 「翻訳テーブルにあるが本文にない」 = 孤児 → 警告 (削除候補)
- 「本文にあるがテーブルにない」 = 未翻訳 → 警告

## 2. ローカライズテーブル

### 2.1 ファイル構造

```
Localization/
├── _settings.yaml          # 言語一覧、フォールバック規則
├── ja.csv                  # 日本語 (一次)
├── en.csv
├── zh-Hans.csv
└── ko.csv
```

### 2.2 _settings.yaml

```yaml
schemaVersion: 1
defaultLocale: ja
locales:
  - { code: ja, label: 日本語, font: NotoSansJP, dir: ltr }
  - { code: en, label: English, font: NotoSans, dir: ltr }
  - { code: zh-Hans, label: 简体中文, font: NotoSansSC, dir: ltr }
  - { code: ko, label: 한국어, font: NotoSansKR, dir: ltr }
fallbackOrder: [ja, en]
pluralRules: cldr   # CLDR (ICU) 準拠
```

### 2.3 CSV フォーマット

```csv
key,text,maxLength,context,status,updatedAt
scenario.ch01.s01.line.0001,旅の者だ。,30,城門で身分を尋ねられた弱々しい返答,approved,2025-04-15T10:00:00Z
scenario.ch01.s01.line.0002,身分証を見せろ。,40,門番の威圧,approved,2025-04-15T10:00:00Z
```

- `maxLength`: 当該キーの推奨最大文字数 (UI 制約)
- `context`: 翻訳者向けの状況説明 (話者性別/口調/前後)
- `status`: `draft | review | approved | locked`
- `updatedAt`: 翻訳更新時刻 (TM 流用判断に使用)

## 3. 翻訳メモリ (TM)

### 3.1 自動 TM

- 過去の翻訳ペアを (元文 → 訳文) で蓄積
- ファジー一致 (Levenshtein/類似度) で候補提示
- 完全一致は自動補完 (要確認フラグ付)

### 3.2 用語固定 (Termbase)

- 用語集 (Glossary) と連動
- 「Tarou は太郎/タロウ」など、訳語を固定
- 自動 Lint で違反検出

### 3.3 ファイル

```yaml
# Localization/.tm/main.yaml  (Git 管理)
entries:
  - srcLocale: ja
    src: 旅の者だ。
    dstLocale: en
    dst: Just a traveler.
    domain: scene_dialog
    speaker: tarou
    usedAt: ["scenario.ch01.s01.line.0001"]
    quality: approved
    updatedAt: ...
```

## 4. 翻訳コンテキスト

翻訳者に渡すべき情報を、**自動収集**してパッケージング:

| 項目 | 取得元 |
|---|---|
| 話者 | scn.yaml の `who` |
| 話者性別/口調 | キャラノードの speech_style |
| 前後行 (3〜5行) | 同シーン文脈 |
| シーン要約 | plot.summary |
| 想定演技 | line.aside, line.emotion |
| 関連画像 | キャラサムネ + scene location サムネ |
| 既存翻訳メモリヒット | TM 検索結果 |
| 用語固定 | Glossary 該当エントリ |
| 文字数制限 | maxLength |

これらを 1 つのパッケージで翻訳ベンダーに渡せるようにする (XLIFF 拡張 or 独自 JSON)。

## 5. プレースホルダ

### 5.1 表記

```
{playerName}                    # 単純変数
{tarou.age}                     # ノードフィールド
{her_or_him|tarou.gender}       # 性別による条件分岐 (CLDR plural/select)
{ count, plural, =0{空} =1{ひとつ} other{# 個} }   # ICU MessageFormat 互換
```

### 5.2 整合性

- 翻訳前後でプレースホルダの種類と数が一致しているか自動チェック
- 不一致は Lint Error

## 6. 文字数/レイアウト制約

### 6.1 制約定義

UI 要素に応じてキーごとに制約:

```yaml
# Localization/_constraints.yaml
- keyPattern: "ui.button.*"
  maxLength: 12
  font: NotoSans
  pixelWidth: 120         # 任意: ピクセル幅で判定
- keyPattern: "scenario.*.line.*"
  maxLength: 30           # 1行 30 字までを推奨
  warnRatio: 0.9
```

### 6.2 リアルタイムチェック

- 翻訳エディタでの入力中、制約超過は赤強調
- ピクセル幅判定: フォントのメトリクスを Font Asset から取得

## 7. 多言語フォント

- 言語ごとに既定フォントを `_settings.yaml` で指定
- ゲームへエクスポート時にフォント情報も同梱
- 縦書き対応: `direction: vertical-rl` (将来拡張)

## 8. 翻訳ワークフロー

```
ライター: ja で執筆 (キー自動付与)
   ↓
プロデューサ: 翻訳パッケージをエクスポート (XLIFF または CSV+context.json)
   ↓
翻訳者: 専用ツール (Trados/MemoQ/独自エディタ) で翻訳
   ↓
インポート: 検証 → CSV 反映 → status: review
   ↓
LQA: ゲーム内プレビューで確認 → status: approved
   ↓
ロック: status: locked (誤って書き換えられないよう)
```

## 9. 翻訳エディタ パネル

- 左: キーツリー (階層)
- 中: 訳文テーブル (行=キー, 列=言語)
- 右: コンテキストペイン (キャラサムネ、シーン場面、前後行、TM 候補)
- 上: フィルタ (status、変更日、未訳のみ、孤児のみ)
- AI 翻訳ボタン (一括/単行)

## 10. Unity Localization 連携

### 10.1 二方向

- **Export**: 本ツール → Unity Localization (Locale Asset, StringTable)
- **Import**: Unity Localization の StringTable → 本ツールのキーマッピング

### 10.2 既存資産活用

- Unity Localization の Smart Format / SmartString と互換のプレースホルダ表記
- LocalizedString コンポーネントから直接参照可能
- ランタイム切替を Unity Localization に委ねる選択肢

### 10.3 独自 StringDB (オプション)

- Unity Localization が重い/不要なケース向けの軽量 StringDB
- メモリ単一辞書 + エンコード済バイナリ (.bytes)

## 11. AI 翻訳

詳細は `11_ai-workflow.md`。

- 過去訳メモリと用語集をプロンプトに同梱
- 一度の API 呼び出しで複数行をバッチ翻訳 (cost/latency)
- 1 行ずつのストリーム翻訳も提供

## 12. 監査ログ

- 各キーに編集履歴 (誰が、いつ、何から何へ)
- Git の commit と紐付き、PR レビュー対象に

## 13. テキスト方向 (RTL/縦書き)

- アラビア語 (RTL): フォント・レイアウト方向対応
- 縦書き (将来): スクリプトエディタに縦組モード追加
- 文字種ごとの kerning/字間調整は font asset 側
