# 06. シナリオ階層 (あらすじ・プロット・脚本)

## 設計の核

物語制作は **粒度の異なる 3 層 + 1** で進めるのが業界の通例 (Snowflake / Story Bible 等)。本ツールではこれを正面から受ける。

| 層 | 入れる粒度 | 編集UI | データ形式 |
|---|---|---|---|
| 0. **企画** (Logline/Theme) | 1〜2文 | テキスト1枚 | Markdown |
| 1. **あらすじ** (Synopsis) | 1章=数百字 | リッチテキスト | Markdown |
| 2. **プロット** (Plot) | 1シーン=1カード、ビート構造 | カードボード/アウトライナ | YAML |
| 3. **脚本** (Script) | 1発話=1行 | スクリプトエディタ | YAML or 専用 .scn |

すべて **同じシナリオ単位 (章/シーン)** に紐付き、3層を行き来できる。

## 1. ディレクトリ構造

```
Scenarios/
├── _project.yaml           # 全体構造、章一覧、適用ビートシート
├── theme.md                # ログライン、テーマ、コアコンセプト
├── synopsis.md             # 全体あらすじ
├── beats.yaml              # ビートシート割当
├── ch01_meeting/
│   ├── _index.yaml         # 章メタ (title, summary, beat, tension, status)
│   ├── synopsis.md         # 章あらすじ
│   ├── plot.yaml           # シーン列 (カード)
│   ├── notes.md            # 章ノート (構想、メモ)
│   └── scenes/
│       ├── s01_opening.scn.yaml
│       ├── s02_encounter.scn.yaml
│       └── _scene_index.yaml
└── ch02_conflict/...
```

`.scn.yaml` は脚本専用拡張子 (シンタックスを差別化)。

## 2. 企画層 (Theme/Logline)

```markdown
# テーマ
人は、過ちを乗り越えて初めて本当の自分に出会う。

## ログライン
かつて世界を裏切った魔導士が、自分が殺したはずの娘の幻影に導かれ、
百年後の崩壊しかけた帝国を救う羽目になる物語。

## 主要トーン
- ダークファンタジー、贖罪、再生
- 重さ8 / 軽さ2 (シリアス寄りだが軽口も)

## コアテーマの問い
「過去は本当に上書きできるのか？」
```

ここは 1 ファイル。プロジェクトの North Star。

## 3. あらすじ層 (Synopsis)

### 3.1 全体あらすじ

`synopsis.md` に Markdown で。
- 文字数バッジ (例: 1,200/2,000 目標)
- AI による要約/拡張ボタン (P1)

### 3.2 章あらすじ

各章ディレクトリの `synopsis.md`。
- 章カードに表示される
- カンバン/ボードビューで一覧

### 3.3 シノプシスエディタ

通常の Markdown エディタ + 追加機能:
- 用語集自動リンク (固有名詞ハイライト)
- キャラ名 hover でサムネ＋プロフィールポップアップ
- 集中モード切替

## 4. プロット層 (Plot)

### 4.1 ビートシート

プロジェクトレベルでビート構造を 1 つ採用 (or 複合)。

```yaml
# beats.yaml
template: save_the_cat   # save_the_cat | hero_journey | three_act | kishotenketsu | story_circle | custom
beats:
  - id: opening_image
    label: オープニング・イメージ
    targetPercent: 1
    color: "#ddd"
  - id: theme_stated
    targetPercent: 5
  - id: setup
    targetPercent: 10
  - id: catalyst
    targetPercent: 12
  # ... 15ビート全体
```

各章/シーンは `beat: <beatId>` で紐付け。
- 達成度ビューで「どのビートに何シーンあるか」を可視化
- 不足ビート警告

### 4.2 プロットカード (シーンカード)

1シーン=1カード。`plot.yaml` または scenes/*.scn.yaml の頭部メタから生成。

```yaml
# ch01/plot.yaml
scenes:
  - sceneId: s01_opening
    title: 嵐の城門
    pov: character.tarou
    location: location.castle_gate
    timeEra: era.modern
    cast: [character.tarou, character.gatekeeper]
    summary: |
      雨の中、ボロを纏った主人公が城門に到着。
      門番は怪訝そうに身分証を求める。
    purpose: テーマ提示 / 主人公の現状
    beat: opening_image
    tension: 30
    status: draft
    targetWords: 1200
    actualWords: 0          # auto-calculated
    notes: 雨 SE 必須
```

### 4.3 編集ビュー

| ビュー | 用途 |
|---|---|
| **コルクボード** | カードを2D配置、自由並べ替え (Scrivener 風) |
| **アウトライナ** | 章 > シーン階層、表形式 |
| **ガント (Tension)** | 緊張度カーブを横軸シーンで可視化 |
| **カンバン** | Status (Draft/Review/Approved 等) でレーン配置 |
| **ビートマップ** | ビートシート + シーン配置を 1 枚で |

ドラッグで並べ替え → `_scene_index.yaml` の order に反映。

### 4.4 シーン編集ポップアップ

カードダブルクリックで編集パネル。
- メタ編集 + summary + リンク (脚本へ飛ぶ)
- 「キャストはここから選ぶ」フィールドはノードピッカー (キャラ一覧)

## 5. 脚本層 (Script)

### 5.1 ファイル形式

```yaml
# scenes/s01_opening.scn.yaml
schemaVersion: 1
sceneId: s01_opening
plot:
  title: 嵐の城門
  pov: character.tarou
  location: location.castle_gate
  cast: [character.tarou, character.gatekeeper]
  beat: opening_image
  tension: 30

# 脚本本体
script:
  - { kind: stage,    text: "夜。雨。城門。" }
  - { kind: action,   who: tarou, text: ぼろ布を被り、ふらふらと門に近づく。 }
  - { kind: line,     who: gatekeeper, emotion: suspicious, text: "誰だ。身分証を見せろ。" }
  - { kind: line,     who: tarou,      emotion: tired,      text: "……旅の者だ。", aside: 弱々しく }
  - { kind: choice,   prompt: 主人公はどうする?
      options:
        - { text: 名乗る,   then: opening_reveal }
        - { text: 偽る,     then: opening_disguise } }
  - { kind: sfx,      cue: thunder_far, text: 遠雷 }
  - { kind: bgm,      cue: bgm_tense, fade: 2.0 }
  - { kind: var_set,  var: var.met_gatekeeper, value: true }
  - { kind: comment,  text: "ここで雷光ごとにキャラを 1 フレーム照らす演出案" }
  - { kind: include,  scene: s01_subscene_thunder }
```

### 5.2 行種別 (kind)

| kind | 用途 |
|---|---|
| `stage` | ト書き (背景・状況) |
| `action` | 動作 (誰がどうした) |
| `line` | 発話 (主役の行) |
| `choice` | 選択肢分岐 |
| `if` / `else` | 条件分岐 (変数評価) |
| `var_set` / `var_inc` | 変数操作 |
| `goto` / `include` | 別シーンへ遷移/インクルード |
| `sfx` / `bgm` / `voice` | 音声指示 |
| `camera` / `fx` | 演出指示 |
| `wait` | 待機秒数 |
| `comment` | ライターコメント (出力対象外) |

### 5.3 脚本エディタ UI

```
┌──────────────────────────────────────────────────────┐
│ Scene: s01_opening    POV: 太郎    Era: 現代          │
├──────────────────────────────────────────────────────┤
│ [▼ メタ折り畳み]                                       │
│                                                       │
│ ────────────────────────────────────────────         │
│  夜。雨。城門。                                         │
│                                                       │
│  ぼろ布を被り、ふらふらと門に近づく。                     │
│                                                       │
│  ┌──┐                                                 │
│  │👤│ 門番  (suspicious)                              │
│  └──┘ 「誰だ。身分証を見せろ。」                          │
│                                                       │
│  ┌──┐                                                 │
│  │👤│ 太郎  (tired) <弱々しく>                         │
│  └──┘ 「……旅の者だ。」 (12字 / 30字制限)             │
│                                                       │
│  ❓ 選択 「主人公はどうする?」                            │
│     1) 名乗る → s01_reveal                             │
│     2) 偽る   → s01_disguise                           │
│                                                       │
│  🔊 SE: thunder_far  (遠雷)                            │
│  🎵 BGM: bgm_tense (fade 2.0s)                         │
│  $met_gatekeeper = true                                │
└──────────────────────────────────────────────────────┘
```

要点:
- **キャラのサムネ＋名前を行頭に表示** (ご要望通り)
- **感情タグ** が括弧で表示。クリックで一覧から選択
- **文字数カウンタ** が行末。制限超え赤
- **選択肢/SE/BGM/変数** がアイコンで瞬時に判別
- **アサイド (演技指示)** は山括弧 `< >` で
- **コメント** は別色で出力対象外

### 5.4 入力モード

| モード | 動作 |
|---|---|
| **Smart** (既定) | 行頭で `:` を打つと話者選択候補。`!` でト書き。`?` で選択肢 |
| **Fountain-like** | 大文字話者名を頭に書くと line 化 |
| **Block** | 行種別をマウスで挿入 (ボタンパネル) |
| **Raw YAML** | YAML 直接編集 (上級者向け) |

## 6. 3層の連動

### 6.1 同期表現

- **章メタ** (タイトル/POV/Era 等) は `_index.yaml` に正規化
- **シーンメタ** は `plot.yaml` の該当エントリと `s01_*.scn.yaml` の `plot:` ブロックで二重持ちしない
  - 真実のソースは個別 `.scn.yaml` の `plot:` ブロック
  - `plot.yaml` は **生成キャッシュ** (順序＋一覧)
- どのビューで編集しても他に伝播

### 6.2 視点間ジャンプ

- カードクリック → 脚本ヘッダにジャンプ
- 脚本のシーンタイトル右に「カードへ戻る」ボタン
- あらすじ Markdown の `[[s01_opening]]` リンクから直接ジャンプ

## 7. 進捗と統計

シーン単位で持つメトリクス:
- 総文字数 (本文のみ)
- 発話文字数 / ト書き文字数
- 想定読了時間 (450字/分)
- 登場キャラ別文字数
- 選択肢数 / 分岐数
- 未訳ローカライズキー数

集約してダッシュボード表示。

## 8. 改訂モード (Revisions)

- カラー差分 (Final Draft 風)
- 改訂ターン (Pass 1, Pass 2, ...) を `revisions.yaml` で管理
- `git diff` ベースだが、ライター向けに「青稿 / 赤稿」表示
- 行ロック (校正中だけ編集禁止)

## 9. テンプレート

新規シーン作成時に選べるテンプレート:
- **対話シーン** (基本会話)
- **アクションシーン** (動作多め)
- **モノローグ** (主人公心情)
- **回想** (フラッシュバック)
- **選択分岐シーン** (チョイスベース)
- **エンディング**
- ユーザ追加テンプレ可能

## 10. 拡張: マルチエンディング/分岐管理

- シーン間遷移は `goto`/`choice` で表現
- グラフエディタの **Plot Flow Lens** で分岐を可視化 (articy Flow 風)
- 「END」ノードを終端マーカーに、到達可能エンディング数を集計
- 不到達シーン(デッドコード)を警告
