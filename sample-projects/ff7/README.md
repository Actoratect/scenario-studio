# FF7 サンプルプロジェクト

Scenario Studio の機能を一通り試すためのデモプロジェクト。

## 開き方

1. `pnpm -F @scenario-studio/frontend dev` で dev サーバ起動
2. ブラウザで http://localhost:5173/
3. 「既存プロジェクトを開く」 → `sample-projects/ff7/` フォルダを選択

## 入っているもの

| 種類 | 数 | 例 |
|---|---|---|
| Character | 8 | クラウド / ティファ / セフィロス / エアリス / バレット / ザックス / ヴィンセント / ルーファウス |
| Location | 5 | ミッドガル / 八番街 / ニブルヘイム / コスモキャニオン / 古代種の都 |
| Item | 4 | バスターソード / 正宗 / ホーリーマテリア / フェニックスの尾 |
| Faction | 5 | 神羅 / アバランチ / ソルジャー / 古代種 / タークス |
| Era | 4 | 物語世界 → ニブルヘイム事件以前 / ニブルヘイム事件 / 本編 |
| Chapter / Scene | 2 / 5 | 第 1 章 八番魔晄炉 (3 シーン), 第 2 章 ニブルヘイム回想 (2 シーン) |
| Glossary | 5 | マテリア / ライフストリーム / 魔晄 / ジェノバ / メテオ |
| Relation | 10 | 幼馴染 / 宿敵 / 親友・恩人 など |

## 試してほしい操作

- **Outline で章 / シーンをドラッグ並べ替え** (各行左の ⋮⋮ ハンドル)
- **Graph タブで Shift+drag** して新規関係作成
- **Cmd+K** で「セフィロス」検索 → Inspector に jump
- **Era スライダ** で時系列を切替
- **Synopsis タブ** で Markdown プレビュー

## 再生成

```bash
pnpm -F @scenario-studio/cli build
node packages/cli/dist/dev/generate-ff7-sample.js sample-projects/ff7
```

## 著作権

キャラクター名 / 場所名 / 用語は周知の固有名詞を借用しているが、
台詞 / シーン構成 / 関係設定は本プロジェクトの**創作サンプル**であり、
FF7 本編の脚本データではない。あくまで Scenario Studio 動作デモ用。
