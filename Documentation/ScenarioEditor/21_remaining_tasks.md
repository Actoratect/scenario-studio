# 21. 残タスクリスト (post-MVP, 2026-05-05 時点)

> Phase 1 (M1-M8) + post-MVP A〜AA の合計 28 PR がマージ済。
> 本ファイルは「**今後やる予定 / 検討中の機能**」を整理。
> 完了したらここから消す or「✅ 完了 (PR #XX)」を付ける。

## 🔴 緊急度高 (実機運用に直結)

- [x] **画像アップロードの drag & drop 対応** ✅ 完了 (PR-AB) — Inspector サムネゾーン + Outline ノード行で画像 drop → 直接アップロード
- [x] **シーン rename + slug 編集** ✅ 完了 (PR-AB) — Outline シーン行 ✎ ボタンで title + slug を変更 (slug 変更時はファイル rename + `_scene_index.yaml` 更新)
- [ ] **Inspector で大規模ノード時のパフォーマンス** — 50+ field のテンプレで再描画が重くなる可能性。createMemo の細粒度化
- [x] **Lint 6 番目のルール: dialogue の連続発話検知** ✅ 完了 (PR-AB) — `consecutive-same-speaker` (info)。stage / aside / 別キャラを挟むと run リセット

## 🟡 中 (UX 改善)

- [ ] **Inspector フィールドにドキュメント link / プレビュー** — node_ref フィールドに hover で参照先プレビュー
- [x] **Plot Timeline の drag-reorder** ✅ 完了 (PR-AD) — シーンカード drag で同章内 reorder + 他章への移動
- [x] **Plot Timeline で章 drag 並べ替え** ✅ 完了 (PR-AD) — カラム header drag で章順入れ替え
- [ ] **Synopsis Markdown の table / image 対応** — marked は GFM ON だが image アップロード経路無し
- [ ] **Glossary の用語をシーン text 中で自動ハイライト** — 用語 + 表記揺れ違反を inline 表示
- [ ] **Stats panel に「セリフ密度」グラフ** — 章別 / シーン別の 1 行平均文字数
- [x] **Welcome 画面に「FF7 サンプルを開く」ボタン** ✅ 完了 (PR-AE) — Vite plugin で sample を bundle、選択フォルダに展開して開く
- [ ] **AI でシーン全体の要約生成** — Cmd+Shift+A 等で「このシーンを 1 行で要約」
- [ ] **Auto-save 競合検知** — 外部 (他ツール) で同じファイルが編集されたら警告
- [x] **Recent project 履歴の管理 UI** ✅ 完了 (PR-AE) — Welcome に 📌 pin / × 削除 (確認 prompt つき)

## 🟢 小 (Polish)

- [ ] **Help / About ダイアログ** — version / リンク / クレジット
- [ ] **設定パネルでテーマ切替** (light / dark / system)
- [ ] **Tab order を保存** — Dockview のレイアウトを localStorage に永続化
- [ ] **マルチセレクト in Outline** — 複数ノードを選んで一括削除 / 一括 rename
- [ ] **キーボードショートカット カスタマイズ**
- [ ] **i18n: UI 英語 / 中国語切替** (内部識別子は日本語化済みなので外殻のみ)

## 🔵 大 (新機能)

- [ ] **Tauri デスクトップ版 配布インストーラ** — .msi / .dmg / .AppImage
- [ ] **Unity ランタイム統合** (Phase 2) — Unity プロジェクトに脚本データを bundle
- [ ] **Yjs CRDT 共同編集** (Phase X SaaS への布石) — オフライン → 同期
- [ ] **AI: 章/シーン まるごと生成** (Show prompt 確認後)
- [ ] **AI: キャラ性格に基づくセリフ感情推定**
- [ ] **Voice 録音アシスト** — シーン script を読み上げ TTS で確認
- [ ] **タイムライン本格 timeline** (横軸 = 時間 / 縦軸 = キャラの存命) — 05_timeline.md §3
- [ ] **Variant override の bulk 編集** — 複数 Era にまたがる一括 override

## 完了 (post-MVP A-AA)

| # | PR | 内容 |
|---|---|---|
| #19 | hotfix | CSP for HMR + Scene 追加 UI |
| #20 | PR-A | CUDO テーマ + ローディング視覚化 |
| #21 | PR-B | LocalizedString 廃止 → 名前+読み仮名+ID |
| #22 | PR-C | Graph: drag / 中間 Box ラベル / Era フィルタ |
| #23 | PR-D | 自動保存 status pill + Toast 通知 |
| #24 | PR-E | 明示 Relations + Shift+drag 作成 |
| #25 | PR-F | AI 1 行続き提案 (Tab 確定) |
| #26 | PR-G | ノード rename / delete + 章 rename + シーン削除 |
| #27 | PR-H | Cmd+K コマンドパレット |
| #28 | PR-I | Outline drag 並べ替え + Synopsis Markdown |
| #29 | PR-J | FF7 サンプル + 生成スクリプト |
| #30 | PR-K | Export — Scene/Chapter/Project を text/Markdown |
| #31 | PR-L | Era Variants Inspector UI |
| #32 | PR-M | Settings panel + Era CRUD |
| #33 | PR-N | Onboarding banner + Cmd+/ shortcuts |
| #34 | PR-O | Inspector field grouping + 折りたたみ |
| #35 | PR-P | Plot Timeline panel |
| #36 | PR-Q | ノードサムネイル画像 |
| #37 | PR-R | Cross-panel scene jump |
| #38 | PR-S | Script block-insert toolbar |
| #39 | PR-T | Cmd+F 全文検索 |
| #40 | PR-U | Cross-chapter scene drag |
| #41 | PR-V | Stats panel |
| #42 | PR-W | Script Find & Replace (Cmd+H) |
| #43 | PR-X | Inspector 全面改修 + タブ日本語化 |
| #44 | PR-Y | ID 一覧 (Cmd+I) |
| #45 | PR-Z | Inspector inline Era selector |
| #46 | PR-AA | Script visual editor |
| #47 | PR-AB | 🔴緊急: シーン rename / 画像 drag-drop / 連続発話 lint |
| #48 | PR-AC | 統一トンマナ + Inspector 2列レイアウト + 立ち絵サムネ Crop |
| #49 | PR-AD | Plot Timeline drag-reorder (シーン + 章) |
| #50 | PR-AE | Welcome: FF7 サンプル open + recent pin/削除 |
