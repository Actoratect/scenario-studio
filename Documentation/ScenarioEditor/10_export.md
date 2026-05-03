# 10. ゲームエクスポート

## 設計の核

- **「ライターが書いた YAML」をそのまま使う / もしくはランタイムが食える形に変換**の 2 経路
- **Read-only エクスポート**を基本 (ゲーム側からの逆書き戻しはしない)
- **Hot Reload** で執筆中に即反映
- **複数の出力先**を同一プロジェクトから並行可能 (Unity SO + Yarn + 翻訳テーブル等)
- **TS で実装** (12_architecture.md)。Unity 専用エクスポータは Unity Bridge 経由で C# 側に処理を委譲

## エクスポート実行経路

| 環境 | 実行方法 |
|---|---|
| Browser / Tauri (スタンドアロン) | TS のエクスポータが直接ファイルへ書き出し |
| Tauri (デスクトップ) | 出力先を OS のファイルダイアログで選択 |
| Unity Editor (Bridge 経由) | TS が `POST /api/asset/import` を呼び、Unity 側 C# が `ScriptableObject` を生成 |
| CLI | Node から TS エクスポータを実行 (CI 用) |

## 1. エクスポータの抽象

```typescript
export interface Exporter {
  readonly id: string;
  readonly displayName: string;
  readonly platforms: ReadonlyArray<"browser" | "tauri" | "unity" | "cli">;
  validate(ctx: ExportContext): LintResult[];
  export(ctx: ExportContext): Promise<ExportResult>;
}
```

`ProjectSettings.yaml` の `exporters` で複数登録、メニューから個別実行 / 一括実行。
`unity_so` のように Unity 環境でしか動かないものは `platforms: ["unity"]` を設定し、未対応環境では UI で disable。

## 2. 標準で用意するエクスポータ

| ID | 出力 | 用途 |
|---|---|---|
| `unity_so` | ScriptableObject (.asset) | Unity ランタイム標準 |
| `unity_localization` | StringTable + Locale Asset | Unity Localization パッケージ |
| `json` | JSON (1ファイル/ノード or バンドル) | エンジン非依存 |
| `yarn` | Yarn (.yarn) | Yarn Spinner 連携 |
| `ink` | Ink (.ink) | Ink ランタイム連携 |
| `csv_voice` | CSV (収録台本) | 声優収録用 |
| `csv_loc` | CSV (翻訳テーブル) | 翻訳ベンダー渡し |
| `xliff` | XLIFF | 翻訳業界標準 |
| `pdf_script` | PDF (脚本ライク) | 監督/上司レビュー |
| `markdown_book` | Markdown (設定資料集) | World Bible 配布 |
| `fountain` | Fountain (.fountain) | 業界標準フォーマット (映画脚本) |

## 3. Unity ScriptableObject 出力

### 3.1 出力先

```
Assets/ScenarioData/
├── Characters/
│   ├── Tarou.asset
│   └── Hanako.asset
├── Scenes/
│   ├── Ch01_S01_Opening.asset
│   └── ...
└── Index.asset            # マスター辞書
```

### 3.2 ランタイムクラス

```csharp
[CreateAssetMenu]
public class CharacterAsset : ScriptableObject {
    public string nodeId;
    public string slug;
    public LocalizedString displayName;
    public Sprite thumbnail;
    public CharacterFields fields;
    public CharacterVariant[] variants;
    public string[] tags;
}

public class SceneAsset : ScriptableObject {
    public string sceneId;
    public string title;
    public string povCharacterId;
    public string locationId;
    public ScriptStep[] steps;     // 行配列
}

[Serializable]
public abstract class ScriptStep { /* base */ }

[Serializable]
public class StageStep   : ScriptStep { public string text; }
[Serializable]
public class LineStep    : ScriptStep { public string speakerId; public string emotion; public string aside; public string textKey; }
[Serializable]
public class ChoiceStep  : ScriptStep { public string promptKey; public ChoiceOption[] options; }
[Serializable]
public class VarSetStep  : ScriptStep { public string varId; public ValueRef value; }
// ...
```

### 3.3 実行経路と Hot Reload

- 本セクションのコード (C#) は Unity 側パッケージ `Editor/ScenarioEditor/AssetPipeline/` に常駐
- TS フロントエンドからは Bridge HTTP `POST /api/asset/import` で起動。または AssetPostprocessor で自動起動
- AssetPostprocessor / FileSystemWatcher で `.yaml` 変更検出 → 該当 Asset を再生成
- 実行中ゲームには `IDataReloadable` インターフェイス経由で通知 → 「再起動なし」を目指す
- Browser/Tauri 単独で使う場合 (Unity なし) は本エクスポータ自体が disable

## 4. Yarn / Ink エクスポート

### 4.1 Yarn (推奨: 既存ランタイム活用)

```yarn
title: Ch01_S01_Opening
tags: pov_tarou
---
<<set $met_gatekeeper to false>>
夜。雨。城門。
ぼろ布を被り、ふらふらと門に近づく。
Gatekeeper: 誰だ。身分証を見せろ。
Tarou: ……旅の者だ。
-> 名乗る
    <<jump Ch01_S01_Reveal>>
-> 偽る
    <<jump Ch01_S01_Disguise>>
<<set $met_gatekeeper to true>>
===
```

- Variable / Choice / Jump は 1:1 でマッピング
- 演出指示 (`SE:` `BGM:`) はカスタムコマンドに

### 4.2 Ink

- 同様にラベル + ナラティブ
- 条件分岐は Ink の `{condition: ...}` を活用

### 4.3 ランタイム選定の指針

- **Yarn**: Unity 連携が容易、Visual Novel 寄り
- **Ink**: ロジック重視、文学寄り
- **Unity ScriptableObject 標準**: シンプル、エディタ統合最強
- 同時に複数出力可能なのでチームの好みで併用

## 5. 収録台本 CSV (csv_voice)

声優・収録ディレクション向け:

```csv
cueId,fileName,speakerId,speakerName,sceneId,emotion,direction,maxSec,line,reading
0001,VO_TAROU_001,tarou,太郎,Ch01_S01,tired,弱々しく,2.5,旅の者だ。,たびのものだ
0002,VO_GATE_001,gatekeeper,門番,Ch01_S01,suspicious,威圧的に,3.0,身分証を見せろ。,みぶんしょうをみせろ
```

- `maxSec`: 収録尺の目安 (文字数 × 平均モーラから推定)
- `reading`: 難読語のふりがな
- フィルタ可能: キャラ別 / シーン別 / Take 単位
- Excel/Google Sheets 互換

## 6. PDF 脚本

- A4 縦/横、フォント指定
- ヘッダ: シーンID/タイトル/POV/Era
- 行レイアウト: ト書き左寄せ、セリフはインデント、感情は括弧
- 改訂モードでカラー差分表示
- Final Draft 風スタイルテンプレ + ノベル風スタイルテンプレ

## 7. 設定資料集 (Markdown Book)

- 「キャラ→舞台→組織→年表→用語集」順で 1 つの Markdown / HTML へ
- 画像も同梱、相互リンク
- 静的サイトジェネレータ (mdBook / Hugo / Astro) 互換のフォーマット
- World Anvil 風の閲覧体験を social/teaser でも公開可能

## 8. インクリメンタル出力

- 全ファイル再生成は重い (1万ノードで数十秒)
- 変更検出 → 影響ノードのみ再エクスポート (`Index/` のキャッシュを利用)
- CI では `--full` で完全再生成して整合性チェック

## 9. CI 連携

```yaml
# .github/workflows/scenario-validate.yml
- name: Validate Scenarios
  run: scenario-cli validate --strict
- name: Lint Localization
  run: scenario-cli loc-lint --required-locales ja,en
- name: Export Unity SO
  run: scenario-cli export unity_so --check
```

CLI モードを Editor 起動なしで動かせるよう、コアロジックは UI 非依存。

## 10. 出力時の検証

エクスポート前に:
- 参照整合性 (削除済みキャラを参照していないか)
- 翻訳完備 (必要言語がすべて埋まっているか)
- 変数未定義
- 到達不能シーン (デッドコード)
- プレースホルダ整合性
- 文字数オーバー

エラー1つでもあると出力失敗 (warning は通る)。`--allow-warnings`/`--allow-errors` フラグあり。

## 11. バージョニング

- エクスポート結果に `manifest.json` を同梱
  - ソース commit hash
  - エクスポート日時
  - 含まれるノード ID 一覧 + 各 hash
- ランタイムでバージョン整合性チェック可能

## 12. 双方向 (将来)

- ゲーム実装側で発生した「翻訳バッチ」「ボイスファイル ID」等のメタを書き戻す軽量 API
- 安全のため特定フィールドのみ (status/recorded メタ等)
