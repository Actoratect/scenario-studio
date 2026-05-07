# 23. Scenario Studio Mini (スマホ版)

> **位置づけ**: Scenario Studio (デスクトップ版) と **同じデータ** を扱う、スマホファーストの軽量編集 / 閲覧クライアント。
> 別アプリとして並走する。フル機能の **Scenario Studio (Pro)** と差異化することで、両方のスコープが明確になる。

## 1. 目的 (Why)

- **隙間時間に書ける** — 通勤 / 待ち時間にプロット / シーン synopsis / セリフのアイデアをモバイルで投入したい
- **レビュー導線をモバイルで完結** — 章 / シーンを読みつつコメントや tag だけ付けたい
- **書き手以外の参加ハードルを下げる** — 監督 / 翻訳者 / 演者にスマホ 1 台で参加してもらう
- 同じ Git レポ / フォルダを Pro と共有 → 「Pro で構造を作り、Mini で文字を入れる」分業が成立する

## 2. 非目標 (Out of scope)

- Pro と同じ multi-pane Dockview を再現しない
- 1 万ノード級プロジェクトの全 panel フル機能を持ち込まない
- Graph / Plot Flow Lens の編集 (閲覧は OK)
- AI Patch Queue の運用 (閲覧 + 通知のみ)
- File System Access API への依存
- iOS で File System へ直接書く (= 後述の同期チャネル経由で対応)

## 3. プラットフォーム / 技術選択 (素案)

| 観点 | 選択候補 | 理由 |
|---|---|---|
| アプリ形態 | **PWA + Capacitor (将来 native)** | Web スタックで Pro とコード共有。iOS / Android 両対応。store 配布も視野 |
| UI 基盤 | SolidJS (Pro と同じ) + 専用モバイル shell | Dockview は外す。bottom-nav / stack navigator |
| ファイル | iOS: Capacitor Filesystem / Android: MediaStore | FS Access API が無い前提 |
| 同期 | **Git (Working Copy / a-Shell 等) + ZIP import / WebDAV / 任意クラウド** | Pro と同じレポを参照。SaaS は Phase X 棚上げのため未使用 |
| エディタ | CodeMirror 6 mobile profile or 専用軽量 textarea | キーボード / IME 重視 |
| AI 連携 | Pro と同じ AiService 抽象 | provider 切替・key vault は再利用 |

## 4. 機能スコープ (MVP)

「最小限を Pro から踏襲、UI はスマホに寄せる」が原則。

### 必須

- ✅ **プロジェクトを開く** (ZIP import / 既存フォルダ pick / Git clone via Working Copy 等)
- ✅ **アウトライン閲覧** (章 → シーン)
- ✅ **シーン script 表示** (block 単位、line/aside/stage は最低限)
- ✅ **シーン synopsis Markdown 編集** (章 / project 単位も)
- ✅ **キャラ Inspector (read-only or 主要 field のみ書込)**
- ✅ **用語集の閲覧 + 表記揺れ警告 chip**
- ✅ **Lint 結果の確認** (Project Health のサブセット)
- ✅ **Review HTML を開く / 共有する** (Pro 出力物の閲覧経路)
- ✅ **保存 = ZIP export / Git push (外部アプリ連携) / WebDAV** のいずれか
- ✅ Pro と同じ **YAML / Markdown スキーマ**を読める (`Documentation/UserGuide.md §8` 準拠)

### 後で

- 🟡 **シーン script の block 編集** (line の text / who だけ)
- 🟡 **AI 1 行続き提案** (Tab 相当のボタン)
- 🟡 **AI シーン要約** (Cmd+Shift+A モバイル版)
- 🟡 **コメント / 付箋** (Phase 3 β でレビュアー UX として再検討)
- 🟡 **写真 → キャラサムネ自動切り抜き** (モバイル特化)

### やらない (Mini では明示的に外す)

- ❌ Graph 編集 (Relationship / Plot Flow)
- ❌ Era CRUD (Era 切替の表示は OK)
- ❌ Variant override 一括編集 (BulkVariantOverlay)
- ❌ Right-click ContextMenu (long-press 代替も初版では入れない)
- ❌ Dockview / 複数 panel フロート
- ❌ AI Patch Queue 操作 (閲覧 + bell 通知のみ)
- ❌ Local Agent Handoff (Pro 専用)
- ❌ Unity Readiness drawer (Pro 専用)

> **判断基準**: スマホ 1 台で「書き手 / レビュアーの共同作業の 80%」が回ることをゴールに、機能は意図的に絞る。

## 5. 画面設計 (素案)

### Bottom Nav (5 タブ)

```
[📖 アウトライン] [🎬 シーン] [👥 キャラ] [🩺 ヘルス] [⋯ その他]
```

- **アウトライン**: 章 → シーン リスト (drag 並べ替えは将来)
- **シーン**: 選択中シーンの読み / 編集 (synopsis 中心、script は閲覧)
- **キャラ**: Pro の Inspector のサブセット (display_name / personality / 関係)
- **ヘルス**: Project Health の縮小版 (Lint / 不足アセット / 章別進捗)
- **⋯**: Glossary / Settings / Export / Provider 設定 / About

### スタックナビゲーション

各タブ内で「リスト → 詳細 → 編集」を スタックで深堀り。
戻るは OS 標準ジェスチャ + ヘッダ ←。

### モバイル専用 affordance

- **Pull to refresh**: ファイル再読み込み
- **Swipe to dismiss**: 編集 sheet を閉じる
- **Long press**: コンテキストアクション (Pro の右クリック相当)
- **Bottom sheet**: 詳細編集 / AI 提案
- **Share sheet 連携**: Review HTML を OS の share menu から流せる

## 6. データの一貫性 (重要)

**Pro との同一データ運用** が前提。Mini は破壊的変更を避けるべく以下を守る:

1. **書き出し時に同じ YAML スキーマ** (`Documentation/UserGuide.md §8` 準拠)
2. **schemaVersion / kind / id を保持** — 既存ファイルを読み書きする際は変更しない
3. **field の add は OK / rename は NG** — Pro 側がまだ知らないフィールドを後付けしない
4. **Conflict は同期チャネルに委譲** — Git / WebDAV の競合解決は外部ツールで。アプリ内では touched-marker のみ
5. **不明な block / field は preserve** — Mini が知らない field も読み書きで保持 (Pro が後で追加した機能を壊さない)

## 7. 開発フェーズ (素案)

| 段階 | スコープ | 期間目安 |
|---|---|---|
| **Mini PoC** (Mi-0) | PWA で「アウトライン閲覧 + Review HTML 表示」 | 2〜3 週 |
| **Mini α** (Mi-1) | 上記 + シーン synopsis 編集 + ZIP / Git 同期 | 1〜2 ヶ月 |
| **Mini β** (Mi-2) | キャラ Inspector / 用語集 / Lint / AI 1 行提案 | 1〜2 ヶ月 |
| **Mini 1.0** (Mi-3) | レビュアー協業 (コメント / 付箋) / Capacitor native 配布 | 2〜3 ヶ月 |

**着手タイミング**: Pro Phase 1 (現在) 完了後、Phase 2 (Unity 連携) と並走可能なタイミングで Mi-0 着手。
ただし優先度は Pro Phase 2 / Phase 3 の方が高いので、**「Mini はリソース余剰がある時の並行 track」**という位置づけ。

## 8. 残課題 / 設計判断

- **Q-Mi-1**: コードベースをモノレポに含めるか、別 repo にするか
  - 推奨: 同 monorepo の `packages/frontend-mini/` (core / adapters は再利用)
- **Q-Mi-2**: iOS App Store 配布の必要性
  - 当面 PWA で十分。store は Mi-3 以降で検討
- **Q-Mi-3**: 同期で「Mini が書いたものを Pro でどう取り込むか」
  - 第 1 案: Git pull / push を外部アプリに委譲 (= ZIP も同様)
  - 第 2 案: WebDAV / Dropbox / iCloud Drive (FS-only)
  - 第 3 案: Phase X SaaS が来たら自動同期 (現時点では棚上げ)
- **Q-Mi-4**: Pro と Mini で **異なるブランチ** で AI を使うとき、Patch Queue の整合性
  - 当面 Mini の AI は「コピー → 手で貼る」までに留める。Patch Queue 編集は Pro のみ
- **Q-Mi-5**: Lint ルールセット
  - 全 builtin ルールを評価できる必要はない。`empty-script` / `glossary-forbidden` / `node-ref-missing` の 3 つで MVP

## 9. 名称 / ブランディング

- 開発名: **Scenario Studio Mini**
- 略称: **SS Mini**
- 関連ドキュメント:
  - 本ドキュメント = `23_scenario_studio_mini.md` (設計コンセプト)
  - データスキーマは `UserGuide.md §8` を共有 (= Pro と完全互換)
  - クロスプラットフォーム戦略 `15_cross-platform.md` に Mobile を追記する余地あり (将来)

## 10. 撤退条件

- Mi-0 で「PWA 上の File System 経由でプロジェクトを読み書きする手段」が確保できない場合 → ZIP-only に縮退
- Mi-1 ドッグフードで「書き手が Pro より速く書ける場面が 1 つもない」場合 → 閲覧専用クライアント (Reader) に縮退
- Pro 側が Phase 2 / 3 に集中するべき場合 → Mini track を一時停止
