# 21. 残タスクリスト (post-MVP, 2026-05-05 時点)

> Phase 1 (M1-M8) + post-MVP A〜AA の合計 28 PR がマージ済。
> 本ファイルは「**今後やる予定 / 検討中の機能**」を整理。
> 完了したらここから消す or「✅ 完了 (PR #XX)」を付ける。
>
> 2026-05-07 の UX / 機能改善レビューは `22_ux_feature_review.md` に整理。特に Project Health / Script Context Rail / Field Context AI Actions / Local Agent Handoff / Plot Flow Lens / Unity Readiness / Review Package / AI Patch Queue を次の有力候補としている。なお、既定タブ数は増やしすぎず、rail / overlay / 右クリックメニュー / Cmd+K action を優先する。

## 🔴 緊急度高 (実機運用に直結)

- [x] **画像アップロードの drag & drop 対応** ✅ 完了 (PR-AB) — Inspector サムネゾーン + Outline ノード行で画像 drop → 直接アップロード
- [x] **シーン rename + slug 編集** ✅ 完了 (PR-AB) — Outline シーン行 ✎ ボタンで title + slug を変更 (slug 変更時はファイル rename + `_scene_index.yaml` 更新)
- [x] **Inspector で大規模ノード時のパフォーマンス** ✅ 完了 (PR-AI) — FieldGroup の `<For>` 内で per-field の value/issue/hasOverride を `createMemo` で包み、Era 切替や他 field 編集による DOM patch を field 単位に局所化
- [x] **Lint 6 番目のルール: dialogue の連続発話検知** ✅ 完了 (PR-AB) — `consecutive-same-speaker` (info)。stage / aside / 別キャラを挟むと run リセット

## 🟡 中 (UX 改善)

- [ ] **タブ増加を抑える UX 方針の反映** — 新機能は既定タブ追加ではなく、既存パネル内 rail / drawer / overlay / 右クリック / Cmd+K action を優先する
- [ ] **AI 連携の2軸整理** — Developer Local Agent (Codex / IDE / ChatGPT UI handoff) と General External API (課金あり自動生成) を UI / docs で分ける
- [ ] **画像欄 right-click AI 画像生成** — ChatGPT / Gemini 用 prompt copy と、外部APIでの3案生成 (課金あり) を分けて提供
- [ ] **テキスト欄 right-click AI 提案** — 選択テキスト / フィールド文脈から 3 案を生成し、差分確認後に置換 / 追記 / コピー
- [ ] **Local Agent Handoff** — 選択中ノード / シーンの context package を作り、Codex / Claude Code / Cursor / Aider / IDE へ渡して diff を取り込む
- [x] **Inspector フィールドにドキュメント link / プレビュー** ✅ 完了 (PR-AG) — node_ref に inline preview 行 (サムネ + 名前 + ジャンプ ❘ 参照切れは赤)
- [x] **Plot Timeline の drag-reorder** ✅ 完了 (PR-AD) — シーンカード drag で同章内 reorder + 他章への移動
- [x] **Plot Timeline で章 drag 並べ替え** ✅ 完了 (PR-AD) — カラム header drag で章順入れ替え
- [x] **Synopsis Markdown の table / image 対応** ✅ 完了 (PR-AH) — 「🖼 画像」ボタン / drop で `Scenarios/synopsis-images/` に保存 + Markdown 挿入、preview は blob URL に解決 (table は marked GFM で既に対応)
- [x] **Glossary の用語をシーン text 中で自動ハイライト** ✅ 完了 (PR-AF) — Visual editor 各テキスト下に chip 行 (✓ 検出 / ⚠ 違反)
- [x] **Stats panel に「セリフ密度」グラフ** ✅ 完了 (PR-AF) — 章別 1 行平均文字数 (緑バー)
- [x] **Welcome 画面に「FF7 サンプルを開く」ボタン** ✅ 完了 (PR-AE) — Vite plugin で sample を bundle、選択フォルダに展開して開く
- [x] **AI でシーン全体の要約生成** ✅ 完了 (PR-AJ) — Cmd+Shift+A で AiSummaryOverlay 起動 → Show prompt 確認 → 1 行要約 (40 字目安)、コピー可能
- [x] **Auto-save 競合検知** ✅ 完了 (PR-AH) — ConflictDetector が path 別 snapshot を保持し、上書き直前に disk 内容と diff、不一致時は confirm prompt
- [x] **Recent project 履歴の管理 UI** ✅ 完了 (PR-AE) — Welcome に 📌 pin / × 削除 (確認 prompt つき)

## 🟢 小 (Polish)

- [x] **Help / About ダイアログ** ✅ 完了 (PR-AF) — `?` ボタン / version + リンク + クレジット
- [ ] **設定パネルでテーマ切替** (light / dark / system) — *意図的に保留*: PR-AC で「ライト基調固定 + 単一アクセント」のトンマナを慎重に調整したため、dark 版は別途デザインから始める必要あり (CUDO 互換配色の dark variant が未確定)。Phase 2 で改めて
- [x] **Tab order を保存** ✅ 完了 (PR-AG) — Dockview layout を localStorage に永続化、ヘッダ ⟳ で初期化
- [x] **マルチセレクト in Outline** ✅ 完了 (PR-AG) — Cmd/Ctrl/Shift+クリックで複数選択 → 🗑 一括削除 (rename は今回見送り、文字列共通部が無く有用性低)
- [ ] **キーボードショートカット カスタマイズ** — *意図的に保留*: 現在のショートカットは設計確定 (07_window-system §4)。remap UI + 競合検知 + 永続化はそれ自体が中規模機能。実害ある衝突 (Cmd+H 等) は OS 別に手当てしているので Phase 2 まで先送り
- [ ] **i18n: UI 英語 / 中国語切替** (内部識別子は日本語化済みなので外殻のみ) — *意図的に保留*: 全 panel / overlay / Toast の文字列を `t()` 経由に置換する大手術。Phase 2 で SaaS 検討と同時に着手

## 🔵 大 (新機能)

- [ ] **Tauri デスクトップ版 配布インストーラ** — .msi / .dmg / .AppImage
- [ ] **Unity ランタイム統合** (Phase 2) — Unity プロジェクトに脚本データを bundle
- [ ] **Yjs CRDT 共同編集** (Phase X SaaS への布石) — オフライン → 同期
- [ ] **AI: 章/シーン まるごと生成** (Show prompt 確認後)
- [ ] **AI: キャラ性格に基づくセリフ感情推定**
- [ ] **Voice 録音アシスト** — シーン script を読み上げ TTS で確認
- [x] **タイムライン本格 timeline** ✅ MVP 完了 (PR-AM) — Era Timeline panel: 横軸 = Era / 縦軸 = キャラ、生存 / variant / 死亡をマトリクス化、セル click で Era 切替 + キャラ選択。年単位ズーム / イベントピン / リレーション期間は将来拡張
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
| #51 | PR-AF | Glossary auto-highlight + Stats セリフ密度 + Help/About |
| #52 | PR-AG | Dock layout 永続化 + Outline 複数選択 + node_ref preview |
| #53 | PR-AH | Synopsis 画像 upload + Auto-save 競合検知 |
| #54 | PR-AI | Inspector perf — per-field createMemo (大規模ノード対策) |
| #55 | PR-AJ | AI シーン要約 (Cmd+Shift+A) |
| #56 | PR-AK | GitHub Pages deploy + zip artifact 配布 |
| #57 | sync | post-MVP chain (AC..AK) を main へ同期 |
| #58 | PR-AL | portable zip — root-path build + README 同梱 |
| #—  | PR-AM | Era Timeline panel (横軸=Era × 縦軸=キャラ ガント) |
