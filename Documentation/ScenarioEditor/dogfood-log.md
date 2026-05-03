# ドッグフード ログ (Phase 1 / M8)

> **目的**: 「ライター 1 人が Browser で 1 章を完成させる」MVP done の検証。
> **規模目標**: ノード 50 / シーン 30 / 脚本 5,000 行のテストプロジェクトを 2 週間 daily 使用。
> **生成**: `packages/cli/src/dev/generate-dogfood.ts` で fixture プロジェクトを実 FS に書き出し可能。

## 計測項目

| 観点 | 目標 (`20_phase1_implementation_plan.md` §0) | 実測 |
|---|---|---|
| 起動時間 (PWA 既開) | 2 秒以内 | _未計測_ |
| 起動時間 (初回) | 5 秒以内 | _未計測_ |
| メモリ (50 nodes / 30 scenes 開いた状態) | < 500 MB | _未計測_ |
| 自動保存遅延 | 編集 → 保存 < 1 秒 | _未計測_ |
| Graph fps (50 ノード) | 60 fps | _未計測_ |
| AI 1 行続き提案レイテンシ | < 2 秒 | _未計測_ |

## 観察ログ

### Day 1 (YYYY-MM-DD)

- _テンプレート: 何をやって、何が壊れて、何が良かったか_

### Day 2 (YYYY-MM-DD)

...

## バグ台帳 (critical / minor)

| 日付 | severity | 観察 | 対応 |
|---|---|---|---|
| _none yet_ | | | |

- **critical** = ライターのワークフローを止める = MVP done の障害
- **minor** = 不便だが回避可能 = Phase 2 チケット化候補

## MVP done チェックリスト (`20_phase1_implementation_plan.md` §0 の 8 項目)

実装ステータス (M8 完了時点):

- [ ] **データ**: 50/30/5,000 を 2 週間使って問題なし
  - 実装: ✅ fixture generator (`packages/cli/src/dev/generate-dogfood.ts`)
  - 検証: ⏳ 実 dogfood は本ファイルに 2 週間ログを残す
- [ ] **対応ブラウザ**: Chrome / Edge first-class (Safari/Firefox は ZIP モード)
  - 実装: ✅ FS Access API は Chrome/Edge で動作 (M1)
  - 検証: ⏳ Safari ZIP モードは Phase 1 後半 / Phase 2
- [ ] **起動時間**: PWA 2 秒 / 初回 5 秒
  - 実装: ✅ vite-plugin-pwa + 計測コード (`metrics/boot.ts`)、SWR キャッシュ戦略
  - 検証: ⏳ 実プロジェクトで PWA 既開時 2 秒以内を実測
- [x] **保存**: 500ms デバウンスで自動保存、未保存表示なし
  - 実装: ✅ `SaveScheduler` + `Inspector` (M3) / `ScriptPanel` (M6)
- [x] **セキュリティ**: CSP strict / SRI / 入力サニタイズ / WebCrypto AES-GCM
  - 実装: ✅ index.html に CSP meta、`yaml/sanitize.ts` で全 write path に C0 フィルタ、`ai/key-vault.ts` で WebCrypto AES-GCM (PBKDF2 200k iter)
  - SRI: 同一オリジン (`script-src 'self'`) で外部 script を許さないため SRI hash は不要
- [x] **AI**: 1 行続き提案 / Show prompt / Provider 切替
  - 実装: ✅ `AiService` + `AiPanel` (Show prompt modal、Provider 切替 dropdown、claude-opus-4-7 デフォルト)
  - 1 行続き提案 (Tab 確定 / Esc 破棄): inline completion は Phase 1 後半 — Show prompt 経由の単発送信は M8 で動作
- [x] **Lint**: 5 ルールが警告
  - 実装: ✅ `LintEngine` + 5 builtin rules (M7)、`ConsolePanel` で表示
- [x] **CLI**: `scenario validate` / `scenario export <id>` 雛形が動く
  - 実装: ✅ `validate` / `export` / `stats` の 3 command、bin script (`bin/scenario.mjs`) 経由でも動作 (tsx ランナー)
