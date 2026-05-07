# 18. Unity 統合の極大化

> Unity 採用の本質的価値は **「データを実装にそのまま流せる」「リポジトリ内テキストを開発側 AI が読み書きできる」** にある。
> ブラウザ単独では到達できない領域を、Unity 経由で **直接実装に届く** ように設計する。

## Unity が独自に持つ強み (再確認)

| 強み | 内容 |
|---|---|
| **Asset パイプライン** | PNG/WAV/YAML がそのままビルドに含まれる、ASTC/Crunch 圧縮、Sprite/AudioClip 自動変換 |
| **ScriptableObject** | エディタ確認可、`[CreateAssetMenu]` から生成、Inspector で参照辿れる、ランタイムで `Resources.Load` |
| **AssetDatabase** | 検索/Find Usages/依存関係解析、リネーム時の参照追従 |
| **Addressables** | 動的ロード、リモート更新、メモリ最適化 |
| **Localization パッケージ** | StringTable、Asset Table、Smart String、ロケール切替 |
| **Visual Scripting / Bolt / GraphTool** | コードレスでシナリオを駆動 |
| **Timeline** | カットシーン/演出を時間軸で編集 |
| **Editor 拡張全般** | Inspector / Project Window / Scene View 統合 |
| **AI コーディング相性** | リポジトリ内 `.yaml`/`.cs` を Claude Code/Cursor が **そのまま** 読み書き |
| **既存ノウハウ** | テスト/ビルド/CI、業界の蓄積 |

これらを 1 つも捨てない設計を本ドキュメントで定義。

## 1. アセット自動生成パイプライン

### 1.1 全体フロー

```
.yaml / .png / .wav (シナリオ作業)
    ↓ 監視 (FileSystemWatcher / AssetPostprocessor)
変更検出
    ↓ パース (YamlDotNet) + 変換ルール適用
ScriptableObject (.asset) / Sprite / AudioClip 生成
    ↓
Assets/ScenarioData/ に配置
    ↓ Unity が自動 Reimport
ゲームから参照可能
```

### 1.2 入力 → 出力対応表

| 入力ファイル | 生成 Unity Asset | 配置 |
|---|---|---|
| `Nodes/characters/tarou.yaml` | `CharacterAsset` (.asset) | `Assets/ScenarioData/Characters/Tarou.asset` |
| `Nodes/locations/castle.yaml` | `LocationAsset` (.asset) | `Assets/ScenarioData/Locations/Castle.asset` |
| `Scenarios/ch01/scenes/s01.scn.yaml` | `SceneAsset` (.asset) | `Assets/ScenarioData/Scenes/Ch01_S01.asset` |
| `Media/characters/tarou_default.png` | `Sprite` (auto Sprite Mode 設定) | (画像はそのまま import 設定だけ書込み) |
| `Media/voice/VO_TAROU_001.wav` | `AudioClip` (auto Decompress 設定) | (同上) |
| `Localization/ja.csv` | `StringTable` (Unity Localization) | `Assets/ScenarioData/Localization/StringTable_ja.asset` |
| `Variables/story_flags.yaml` | `VariableSet` (.asset) | `Assets/ScenarioData/Variables/StoryFlags.asset` |

### 1.3 画像 import 設定の自動化

```csharp
// Editor/ScenarioEditor/AssetPipeline/MediaImporter.cs
class MediaImporter : AssetPostprocessor {
    void OnPreprocessTexture() {
        if (!assetPath.StartsWith("Assets/Scenarios/Media/")) return;
        var ti = (TextureImporter)assetImporter;
        ti.textureType = TextureImporterType.Sprite;
        ti.spritePixelsPerUnit = 100;
        ti.mipmapEnabled = false;
        ti.alphaIsTransparency = true;
        ti.SetPlatformTextureSettings(new TextureImporterPlatformSettings {
            name = "Standalone",
            format = TextureImporterFormat.DXT5Crunched,
            compressionQuality = 50,
            crunchedCompression = true
        });
        // モバイル用 ASTC も
    }

    void OnPreprocessAudio() {
        if (!assetPath.StartsWith("Assets/Scenarios/Media/voice/")) return;
        var ai = (AudioImporter)assetImporter;
        var settings = ai.defaultSampleSettings;
        settings.compressionFormat = AudioCompressionFormat.Vorbis;
        settings.quality = 0.5f;
        settings.loadType = AudioClipLoadType.CompressedInMemory;
        ai.defaultSampleSettings = settings;
    }
}
```

→ **ライターは画像/音声をフォルダに置くだけ**。最適な import 設定が自動適用。

### 1.4 ScriptableObject 生成

```csharp
// Editor/ScenarioEditor/AssetPipeline/CharacterImporter.cs
[ScriptedImporter(version: 1, ext: "yaml")]
class CharacterYamlImporter : ScriptedImporter {
    public override void OnImportAsset(AssetImportContext ctx) {
        var yaml = File.ReadAllText(ctx.assetPath);
        var data = YamlSerializer.Deserialize<CharacterData>(yaml);

        var so = ScriptableObject.CreateInstance<CharacterAsset>();
        so.nodeId        = data.id;
        so.slug          = data.slug;
        so.displayName   = data.displayName;
        so.fields        = data.fields.ToManaged();
        so.thumbnail     = LoadSprite(data.thumbnail);
        so.variants      = data.variants.Select(ToVariant).ToArray();

        ctx.AddObjectToAsset("main", so);
        ctx.SetMainObject(so);
        if (so.thumbnail != null) ctx.DependsOnSourceAsset(data.thumbnail);
    }
}
```

`ScriptedImporter` を使えば、`.yaml` がそのまま **Unity の Asset として扱える**。ScriptableObject を別生成せず、`.yaml` ファイル自体に main object を持たせる手も可。

### 1.5 Hot Reload

```csharp
// Editor/ScenarioEditor/AssetPipeline/ScenarioHotReload.cs
[InitializeOnLoad]
static class ScenarioHotReload {
    static ScenarioHotReload() {
        AssetDatabase.importPackageCompleted += _ => Notify();
        EditorApplication.update += Watch;
    }
    static void Notify() {
        if (!Application.isPlaying) return;
        foreach (var r in Object.FindObjectsByType<MonoBehaviour>(...)) {
            if (r is IScenarioReloadable rr) rr.OnScenarioReload();
        }
    }
}
```

Play 中に YAML を更新 → 該当 Asset 再生成 → ランタイムへ通知 → **再起動なしで反映**。

## 2. ランタイム API

```csharp
// Runtime/ScenarioRuntime/ScenarioPlayer.cs
public class ScenarioPlayer : MonoBehaviour {
    public SceneAsset scene;
    public ICharacterRenderer renderer;
    public IVoicePlayer voice;
    public IVariableStore variables;

    public IEnumerator Play() {
        foreach (var step in scene.steps) {
            switch (step) {
                case StageStep s:    yield return renderer.ShowStage(s.text); break;
                case LineStep l:     yield return renderer.ShowLine(l); break;
                case ChoiceStep c:   yield return renderer.ShowChoice(c); break;
                case VarSetStep v:   variables.Set(v.varId, v.value); break;
                case SfxStep s:      voice.PlaySfx(s.cue); break;
                case BgmStep b:     voice.PlayBgm(b.cue, b.fade); break;
                // ...
            }
        }
    }
}
```

最小実装でゲームに組み込めるよう、抽象は Interface ベース。
プレビューランナー (`02_proposals.md` G4) は同じ API を使う共通レンダラ。

## 3. Inspector 統合

### 3.1 ScriptableObject の Inspector 拡張

```csharp
[CustomEditor(typeof(CharacterAsset))]
class CharacterAssetEditor : Editor {
    public override void OnInspectorGUI() {
        var ch = (CharacterAsset)target;
        EditorGUILayout.LabelField("Name", ch.displayName.Get(SystemLocale));
        EditorGUILayout.LabelField("Slug", ch.slug);
        if (ch.thumbnail) EditorGUI.DrawPreviewTexture(...);

        // 主要フィールド
        DrawSpeechStyle(ch.fields);
        DrawRelations(ch);

        EditorGUILayout.Space();
        if (GUILayout.Button("📝 Open in Scenario Editor")) {
            ScenarioEditorBridge.Open($"node/{ch.nodeId}");
        }
    }
}
```

→ **Unity Inspector** から「シナリオエディタで開く」ボタン 1 発で web 版にジャンプ。

### 3.2 Project Window の拡張

- アイコン (キャラ用、シーン用) を ScriptableObject 別に変更
- ContextMenu に「シナリオで使われている箇所を検索」追加

### 3.3 Scene View ハンドル

- `LocationAsset` を Scene View に配置すれば、座標と地図情報が表示
- Gizmo でルート線を可視化

### 3.4 Search Provider

- Unity Search ($, # 検索) に Custom Provider を登録
- `s:character tarou` のような検索が Project 全体から効く

## 4. Find Usages / 影響解析

```csharp
[MenuItem("CONTEXT/CharacterAsset/Find Scenes Using This")]
static void FindScenesUsing(MenuCommand cmd) {
    var ch = (CharacterAsset)cmd.context;
    var scenes = AssetDatabase.FindAssets("t:SceneAsset")
        .Select(g => AssetDatabase.LoadAssetAtPath<SceneAsset>(AssetDatabase.GUIDToAssetPath(g)))
        .Where(s => s.steps.OfType<LineStep>().Any(l => l.speakerId == ch.nodeId))
        .ToList();
    Selection.objects = scenes.Cast<Object>().ToArray();
}
```

→ 「このキャラが登場するシーンを全部選択」が 1 クリック。
他にも:
- 未使用ノード検出 (削除候補)
- 削除しようとして参照あればエラー
- リネーム時の自動追従 (slug 変更 → 全ファイル更新)

## 5. Build パイプライン

### 5.1 ビルド時バリデーション

```csharp
class ScenarioBuildValidator : IPreprocessBuildWithReport {
    public int callbackOrder => 0;
    public void OnPreprocessBuild(BuildReport report) {
        var errors = ScenarioLinter.RunStrict();
        if (errors.Any(e => e.severity == Severity.Error)) {
            throw new BuildFailedException("Scenario validation failed: " + ...);
        }
    }
}
```

→ ビルド前に **必ず** Linter が走る。未訳・参照切れ・到達不能シーンなどを検出。

### 5.2 開発専用フィールドのストリップ

`notes` や `editorOnly: true` のフィールドを最終ビルドから除外。
ビルドサイズ削減 + 機密情報 (制作メモ等) の漏洩防止。

### 5.3 Addressables 統合

```csharp
class AddressablesScenarioPostprocessor : AssetPostprocessor {
    static void OnPostprocessAllAssets(...) {
        var settings = AddressableAssetSettingsDefaultObject.Settings;
        foreach (var path in importedAssets) {
            if (!path.StartsWith("Assets/ScenarioData/Scenes/")) continue;
            var entry = settings.CreateOrMoveEntry(AssetDatabase.AssetPathToGUID(path), settings.DefaultGroup);
            entry.address = "scene/" + Path.GetFileNameWithoutExtension(path);
            entry.SetLabel("scenario", true, true);
        }
    }
}
```

→ シーンが自動的に Addressable group に追加。
→ 動的ロード/リモート更新 (DLC) が可能に。

### 5.4 ローカライズ統合

- StringTable (`Localization/ja.csv` から生成) を Asset として扱う
- Smart String/プレースホルダ表記の互換
- Locale 切替で自動再描画 (Unity Localization 標準)

### 5.5 Visual Scripting / Bolt 連携

- `PlayScene(sceneId)` のような Unit を提供
- Visual Scripting からシナリオ呼び出し可
- アーティスト/レベルデザイナがコード書かずに使える

### 5.6 Timeline 連携

- `ScenarioTrack` (Custom PlayableTrack) を提供
- カットシーンに「このタイミングでセリフ表示」が組み込める
- セリフのタイミングがビジュアルで分かる

## 6. AI 開発エージェント連携 (キラー機能)

ユーザの強調ポイント。**Claude Code / Cursor / Codex / Aider / Continue / 他なんでも** が **リポジトリ内テキストを直接読み書きできる** ことを最大化。
特定のエージェントに依存せず、汎用的な「コーディングエージェント」が動けば必ず使える設計。

これは補助的な便利機能ではなく、Unity 統合の中核価値とする。開発者はローカルに Codex / コーディングAI / IDE を入れ、Scenario Studio の GUI で構造を見ながら、AI にはリポジトリ内の YAML / C# / TS を直接編集させる。Unity 側は AssetPostprocessor / Bridge / Hot Reload で変更を即ゲーム実装へ反映する。

### 6.1 LLM フレンドリーな配置

- すべての YAML が **規模が小さく**、AI のコンテキストに乗る (`08_file-format.md`)
- 短い `# describe:` ヘッダで AI が即座に理解
- スキーマも YAML、AI に投げて参照させやすい

### 6.2 開発側 AI が出来ること (例)

```
プロンプト: 「キャラ太郎に弟キャラ次郎を追加して、関係性も登録して」

AI Agent の作業:
1. Templates/character.yaml を Read してフィールド構造を把握
2. Nodes/characters/tarou.yaml を Read して兄の情報を取得
3. Nodes/characters/jirou.yaml を Write (新規)
4. Relations/family.yaml に sibling_of を追加
5. Glossary に「次郎」を追加

→ 全部 .yaml なので、Claude Code / Cursor が普通の編集で完結
```

### 6.3 スキーマ JSON Schema 配布

- すべてのテンプレートを **JSON Schema** として配布
- LLM が "validate this YAML against schema X" を実行可能
- 開発側 AI が壊れた YAML を吐かない

```
.scenario-editor/schemas/
├── node.character.schema.json
├── node.location.schema.json
├── scene.scn.schema.json
└── ...
```

### 6.4 AI 向け CLI

```sh
scenario-cli ai-context node/character/tarou
# → AI に渡す前提情報を 1 ファイルに集約
#   (フィールド + 関連リレーション + 関連シーン要約 + スキーマ)
```

### 6.5 Unity スクリプトとの相互参照

- C# スクリプト中の `character.tarou` を全プロジェクトで検索
- 「コードで使ってるノード ID」と「シナリオで定義してるノード ID」の差分検出
- 削除しようとしたら C# 参照を警告

### 6.6 PR ベース AI ワークフロー

- AI が変更を提案 → ローカルブランチにコミット → PR 作成
- レビュー → マージ
- すべて Git 上で透明に

### 6.7 Unity Cloud Build / Render Pipeline 連携

- ビルド時にシナリオ Lint を CI へ
- 失敗したら PR をブロック
- AI Linter (整合性) も CI で実行可能

## 7. Web エディタとの繋がり (Bridge 経由)

`15_cross-platform.md` で定めた Bridge HTTP を活用:

| Web エディタの操作 | Unity 側の反応 |
|---|---|
| ノード作成/編集 | Asset 自動生成、Inspector 即反映 |
| シーン編集 | SceneAsset 更新、Play 中なら hot reload |
| エクスポート実行 | StringTable / Addressables 更新 |
| プレビュー再生 | Unity の Play モードを起動 |

逆方向 (Unity → Web):
- Inspector で「Open in Scenario Editor」→ web の該当ページへ
- Asset 選択 → web 側 Selection に同期 (Phase 2+)

## 8. パッケージ構成

```
unity-package/   (com.actoratect.editor-tools)
├── Editor/
│   ├── (既存: SceneLoader, RenameTool, …)
│   └── ScenarioEditor/
│       ├── BridgeServer/             # HTTP/SSE
│       ├── AssetPipeline/
│       │   ├── ImporterCharacter.cs
│       │   ├── ImporterScene.cs
│       │   ├── ImporterMedia.cs
│       │   ├── ImporterLocalization.cs
│       │   └── ScenarioHotReload.cs
│       ├── EditorWindow/
│       │   ├── ScenarioEditorMenu.cs
│       │   └── (オプション WebView host)
│       ├── Inspector/
│       │   ├── CharacterAssetEditor.cs
│       │   └── SceneAssetEditor.cs
│       ├── Search/
│       │   └── ScenarioSearchProvider.cs
│       ├── Build/
│       │   ├── ScenarioBuildValidator.cs
│       │   └── AddressablesPostprocessor.cs
│       ├── Settings/
│       │   └── ScenarioSettingsProvider.cs
│       └── Telemetry/                # 任意 / opt-in
├── Runtime/
│   ├── ScenarioRuntime/
│   │   ├── ScenarioPlayer.cs
│   │   ├── ScenarioAssets/
│   │   │   ├── CharacterAsset.cs
│   │   │   ├── SceneAsset.cs
│   │   │   ├── ScriptStep.cs
│   │   │   └── …
│   │   ├── Variables/
│   │   └── Renderers/
│   └── Actoratect.Scenario.asmdef
└── package.json
```

## 9. ドキュメント / Sample

- Unity Package Manager 経由インストール時の "Samples~" として:
  - **Sample 1**: 簡易 ADV システム (画面 + セリフ + 選択肢)
  - **Sample 2**: 設定資料集ビューワ
  - **Sample 3**: ローカライズ切替
- 公式ドキュメントから Unity 連携の手順をたどれる

## 10. 既存 Unity プロジェクトへの導入

```
1. Package Manager で Git URL から本パッケージをインストール
2. Window > Actoratect > Scenario Editor をクリック
3. ブラウザが開く (まだプロジェクトが Unity 内にないので「新規 / 既存を開く」選択)
4. 「Unity プロジェクト内に新規」を選択 → Assets/Scenarios/ に雛形作成
5. ライターが web で執筆、ScriptableObject が自動生成される
6. ゲーム側のコードから ScenarioPlayer.Play(sceneAsset) を呼ぶ
```

→ **5 分で動き始める** ことを目標に。

## 11. CI / Build Server

- Unity Cloud Build / Self-hosted Runner で CLI 実行
  - `scenario-cli validate --strict`
  - `scenario-cli loc-lint --required ja,en`
  - `scenario-cli export unity_so --check`
- Validation 失敗で build をブロック
- スクリプトは Web/Tauri 共通 CLI と同じバイナリ

## 12. パフォーマンス考慮

- Asset 生成は increment (変更分のみ)
- Bulk 処理: `AssetDatabase.StartAssetEditing()` / `StopAssetEditing()` で高速化
- 1 万シーンでも reimport 5 分以内を目標
- Memory: Asset を `Resources.UnloadUnusedAssets()` で適宜解放

## 13. テスト

- `Tests/EditMode/`:
  - YAML → ScriptableObject 変換
  - Linter ルール
  - Bridge HTTP API
- `Tests/PlayMode/`:
  - ScenarioPlayer の最小再生
  - Hot Reload
  - Variable 操作

## 14. 将来拡張

- **Cinemachine 連携**: シーンの POV から自動カメラ
- **Animator 連携**: 感情タグ → 表情 BlendTree
- **Live2D / VRoid 連携**: 立ち絵差分自動切替
- **VFX/Lighting プリセット**: 演出タグから VFX Graph 起動
- **Apple Vision / VR**: 3D 空間での読書体験
- **Asset Store 公開**: 単体パッケージとして配布可能性

## 15. Web のみユーザへの配慮

- Unity を持たないライター/翻訳者でも **不便なく** 使える
- Unity 連携機能はオプショナル
- ローカルで作業 → Unity を持つエンジニアが Asset 化、というワークフローも自然
