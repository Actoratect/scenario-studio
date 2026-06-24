# Scenario Studio — 空テンプレート

新しいシナリオを始めるための最小構成テンプレートです。
構造の見本として、1 キャラ・1 時代・1 章・1 シーンだけ入っています。

## 使い方

1. このフォルダ (`_template/`) を**リポジトリの外**の作業場所へコピーし、好きな名前に変える
   （例: `~/Documents/ScenarioProjects/my-story/`）。
2. `ProjectSettings.yaml` の `name:` を作品名に書き換える。
3. Scenario Studio を起動し、**「既存プロジェクトを開く」**でコピー先フォルダを選ぶ。
4. 見本の章・シーン・キャラはエディタ上で自由に編集・削除して構わない。

> リポジトリ内のまま開くと編集が git の差分に出てしまうため、必ず外にコピーしてから開くこと。

## フォルダの意味

| フォルダ | 中身 |
|---|---|
| `Nodes/characters` `locations` `items` `factions` | ノード (キャラ / 舞台 / アイテム / 組織) 1 ファイル = 1 ノード |
| `Scenarios/<章>/` | 章ごとに `_index.yaml` + `*.scn.yaml` (脚本) + `synopsis.md` |
| `Scenarios/_project.yaml` | 章の並び順 |
| `Eras/` | 時代 (Variant 解決に使う) |
| `Glossary/terms.yaml` | 用語集 |
| `Relations/relations.yaml` | ノード間の明示的な相関 |
| `Templates` `Variables` `Localization` `Media` `PlotBoards` | 各機能の置き場 (今は空) |

詳しい形式は `sample-projects/meros/`（走れメロスの完全なサンプル）を参照。
