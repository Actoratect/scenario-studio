# 17. SaaS 設計 (Cloud Platform)

> ⚠️ **本ドキュメントは「棚上げ (Phase X)」扱いです。**
>
> 当面 (Phase 0〜4 / 約 1.5 年) は **ツールとしての完成度** を最優先とし、SaaS 化には着手しません。
> ただし設計資産として本ドキュメントは保持し、データモデル/アーキテクチャ側でも将来 SaaS 化できる拡張余地は残しておきます。
>
> 着手判断のトリガ例:
> - Phase 4 (1.0) 完了時に外部の継続利用ユーザが一定数いる
> - 企業からの SaaS 提供問い合わせが累積する
> - リアルタイム共著の要望が顕在化する
> - 投資/協業の機会
>
> 本ドキュメントの内容は「将来やるならこう」というスナップショット。実装着手時には改めて市場と技術を見直す前提です。

---

> 「企業が本当に欲しい状態」を、Phase X で SaaS として正式提供する想定。
> ローカルファースト原則は維持しつつ、**任意で** クラウド機能を on にできる。

## ビジョン

**「ゲーム会社のシナリオ部門が、クラウド上で安心して共著・翻訳・運用できる場所」**

- ローカル / セルフホスト / マネージド SaaS の **3 つから選べる**
- マネージドの選択肢があると、企業 IT/セキュリティ部門の承認が下りやすい
- AI コスト/品質を中央管理 (キー一元、レート制限、コスト集計)
- 翻訳ベンダー、声優事務所など **外部パートナー** を権限分離して招待
- 監査・準拠 (GDPR / SOC 2 path) を提供することで Enterprise が採用しやすい

## なぜ SaaS が刺さるか (顧客タイプ別)

| 顧客 | 課題 | SaaS で解決 |
|---|---|---|
| **個人ライター** | バックアップ忘れ、PC 移行 | 自動同期、複数端末 |
| **小規模スタジオ** | Git 苦手、Sync コスト | リアルタイム共著、招待 URL 一発 |
| **中規模スタジオ** | 翻訳/収録ベンダー連携面倒 | 役割別招待、安全な権限分離 |
| **大手スタジオ** | セキュリティ/監査 | 監査ログ、SSO、データ所在選択 |
| **教育機関** | 生徒分の環境構築が大変 | 招待リンク 1 つで参加 |
| **同人サークル** | 個人で AI コスト払うのが厳しい | チーム単位の AI Quota 共有 |

## 1. 顧客セグメント / 価格戦略 (素案)

| プラン | 価格 | 主な制約・付加 | 想定ユーザ |
|---|---|---|---|
| **Free** | ¥0 | 1 プロジェクト、ノード 200 まで、AI 月 100 回、ローカルファイル必須 | 個人試用、評価 |
| **Pro** | ¥1,500/月/seat | 無制限プロジェクト、ノード無制限、AI Quota 月 1,000 回、共有読取り URL | フリーランス、個人事業 |
| **Team** | ¥3,500/月/seat | リアルタイム共著、ロール管理、Audit log 1 年、AI Quota 月 5,000/seat | 5〜30 人スタジオ |
| **Business** | ¥7,000/月/seat | 翻訳ベンダー seat 安価、SSO (Google/Microsoft)、SLA 99.9%、Audit log 3 年 | 50〜200 人スタジオ |
| **Enterprise** | 見積 | SAML SSO、専用 region、専用 AI Quota、専用サポート、DPA、セルフホスト選択肢 | 大手スタジオ、IP 厳格 |

価格は Notion / Linear / Figma の中央値を参考に。日本市場では JPY 表記、グローバルでは USD 並記。

### 役割別 seat 価格

- 翻訳/レビュア専用 seat: 通常 seat の 30〜50% 価格 (or プラン内に X 名無料)
- ゲスト seat: プロジェクト指定で時限 (請求は招待者へ)

### 試用ポリシー

- Pro/Team は **30 日無料** + クレジットカード不要
- Business/Enterprise は営業対応 + PoC

## 2. 主要 SaaS 機能

### 2.1 アカウント管理

- サインイン: GitHub/Google OAuth + メール+パスフレーズ
- 招待: メール / 招待 URL (HMAC 署名 + 期限)
- MFA: TOTP / Passkey (WebAuthn)
- 組織 (Tenant): 1 アカウントは複数組織に所属可
- セルフサービス課金 / 解約

### 2.2 プロジェクト共有

- ロール: Owner / Admin / Editor / Translator / Reviewer / Viewer (`16_security.md` §5.2)
- 共有方法:
  - メンバー追加 (要登録)
  - 招待 URL (期限付き、role 指定)
  - 公開 Read-only URL (パスワード可)
- プロジェクトごとの可視性: Private / Org / Public

### 2.3 リアルタイム共著 (Phase 6)

- **CRDT (Yjs)** で同時編集
- カーソル位置 / 選択範囲をリアルタイム表示
- ユーザカラー、アバター
- 編集履歴 = Yjs スナップショット (時間遡行可)
- オフライン編集も可、再接続時に自動マージ
- 衝突しないテキスト編集 + 構造編集

### 2.4 コメント / メンション

- ノード/シーン/行に紐づくスレッド
- `@username` メンション → 通知
- リアクション (絵文字)
- Resolve / Reopen
- アクティビティタイムラインで一覧

### 2.5 AI Proxy (中央管理)

- ユーザの API キーを **クライアントに渡さない**
- 組織単位で:
  - キー管理 (1 つの API キーを全員で共有)
  - Quota 設定 (月 X 回、$X)
  - レート制限
  - ログ集約 (誰が何を送ったか)
  - プロンプトキャッシュ集中管理 (コスト削減)
- 個人キー併用も可 (Free/Pro 向け)
- ローカル LLM 連携も Proxy 経由

### 2.6 翻訳ベンダー連携

- 翻訳業者向け **特化 UI** (Localization パネル + 限定権限)
- ベンダーは本文 read-only、翻訳カラムのみ編集可
- 進捗ダッシュボード (Translator が「いつまでに何を」が見える)
- TM (翻訳メモリ) を組織横断で共有 (Phase 6)

### 2.7 声優収録ワークフロー (Phase 6+)

- 収録台本のエクスポート + ステータス管理
- 録音ファイル (.wav) のアップロード/紐付け
- リテイク/差替え管理
- ボイスディレクタ向けロール

### 2.8 公開ビューワ

- "Story Bible" としての公開閲覧
- 設定資料集を URL で配布、チームの非ライターも見られる
- カスタムドメイン (Business+)
- Whitelabel (Enterprise)

### 2.9 SSO (Phase 6+)

- SAML 2.0 (Okta, Azure AD)
- SCIM プロビジョニング
- Just-in-Time 作成

### 2.10 Webhook / API

- プロジェクト変更を Webhook 通知 (Slack/Discord)
- REST API でノード/シーン CRUD (CI/CD で利用)
- Personal Access Token

## 3. 同期モデル

### 3.1 ローカル ↔ クラウドの関係

3 モード:

- **Local-only**: クラウド未接続。ファイルはローカルだけ
- **Cloud-backed**: ローカル＋クラウドミラー (バックアップ目的)
- **Cloud-primary**: クラウドが正、ローカルはキャッシュ (リアルタイム共著時)

ユーザがプロジェクト単位で選択。途中で切替可。

### 3.2 同期方式

- Cloud-backed: **Git ベース push/pull** (素朴、確実)
- Cloud-primary: **Yjs CRDT WebSocket** (リアルタイム)
- 両者は内部でデータ整合 (Yjs の永続化先 = R2)

### 3.3 競合解決

- Cloud-backed: Git 衝突 → ユーザ解決 UI
- Cloud-primary: CRDT で衝突しない (Yjs の保証)
- ファイル削除/移動は Yjs の Y.Doc で表現

## 4. 技術スタック (バックエンド)

選定方針: **エッジ実行 + マネージド DB** で運用負荷最小、グローバル低レイテンシ。

| 領域 | 採用 | 代替候補 |
|---|---|---|
| **エッジ実行** | Cloudflare Workers + Hono | Vercel Edge / AWS Lambda |
| **DB (構造化)** | Cloudflare D1 (SQLite at edge) | Postgres (Neon/Supabase) |
| **DB (Realtime/CRDT)** | Cloudflare Durable Objects + Y-Sweet (Yjs) | Liveblocks / partykit |
| **Object Storage** | Cloudflare R2 | S3 |
| **Vector Search** | Cloudflare Vectorize | Pinecone / pgvector |
| **Auth** | Better Auth (TS) + WorkOS for SSO | Clerk / Auth0 |
| **Email** | Resend | Postmark |
| **Billing** | Stripe | Paddle |
| **Monitoring** | Sentry + Cloudflare Analytics | Datadog |
| **Status Page** | Instatus | Statuspage |
| **CDN** | Cloudflare | (同居) |

→ Cloudflare スタックで**初期コスト極小**、スケール時もマネージド。日本リージョン対応も可 (Tokyo, Osaka)。

## 5. データモデル (マルチテナント)

```sql
-- DDL 概略
CREATE TABLE tenant (
  id            TEXT PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  plan          TEXT NOT NULL,
  region        TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL,
  ...
);

CREATE TABLE user (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  ...
);

CREATE TABLE membership (
  tenant_id     TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  role          TEXT NOT NULL,   -- owner|admin|editor|translator|reviewer|viewer
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE project (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  slug          TEXT NOT NULL,
  visibility    TEXT NOT NULL,   -- private|org|public
  storage_uri   TEXT NOT NULL,   -- r2://tenant-x/proj-y
  ydoc_id       TEXT NULL,       -- Durable Object id (if cloud-primary)
  ...
);

-- audit, billing, ai_usage 等
```

**全テーブルに tenant_id**。ORM ミドルウェアで `WHERE tenant_id = ?` を強制注入し、漏らさない。

## 6. SaaS バックエンドのモジュール

```
saas-backend/  (Cloudflare Workers)
├── src/
│   ├── routes/
│   │   ├── auth/             # signin, oauth callback, MFA, session
│   │   ├── tenants/          # CRUD, billing
│   │   ├── projects/         # CRUD, sharing
│   │   ├── files/            # R2 read/write proxy
│   │   ├── ai/               # AI proxy
│   │   ├── webhooks/         # Stripe, Slack
│   │   └── ws/               # WebSocket (Yjs sync)
│   ├── middleware/
│   │   ├── auth.ts           # Session validation
│   │   ├── tenant-scope.ts   # tenant_id 強制
│   │   ├── rate-limit.ts
│   │   └── audit.ts
│   ├── services/
│   │   ├── billing/
│   │   ├── ai-proxy/
│   │   ├── notifications/
│   │   └── yjs-sync/
│   └── infra/
│       ├── d1.ts
│       ├── r2.ts
│       ├── durable-objects/
│       └── vectorize.ts
└── wrangler.toml
```

## 7. SaaS と Local の同期フロー

### 7.1 Cloud-backed: 同期トリガー

```
ローカル編集
  ↓ ファイル変更
Adapter が変更検知
  ↓
SyncService が batch 化 (デバウンス 5 秒)
  ↓ HTTP PUT /api/files
SaaS Backend → R2 書込 + DB metadata 更新
  ↓
他のメンバーへ Webhook/SSE で通知
  ↓
それぞれの adapter が pull
```

### 7.2 Cloud-primary: リアルタイム

```
ローカル編集
  ↓ Yjs オペレーション
Y.Doc (in-memory) に適用
  ↓ WebSocket
Durable Object が CRDT マージ + 永続化 (R2)
  ↓ broadcast
他クライアントの Y.Doc に適用
  ↓ Adapter が再描画
```

オフライン時は Y.Doc がローカルに溜まり、再接続時に自動マージ。

## 8. SaaS と Unity の関係

- Unity プロジェクトの YAML は通常ローカルに置く
- **Cloud-backed モード**: Unity は普段通りローカルで作業。バックアップ/共有のためクラウドミラー
- **Cloud-primary モード**: Unity は SaaS から **取得→書込みのみ**。SaaS が真実のソース
  - リアルタイム編集中も Unity Editor は使える (read-only ロック or pull only)
  - エクスポート時に最新版を取得して ScriptableObject 生成
- **混在運用**: 大規模スタジオでは「ライターは SaaS、エンジニアは Unity 経由」のような分業も自然

## 9. 開発・運用体制

### 9.1 環境

| 環境 | 用途 |
|---|---|
| `dev` | エンジニア各自 |
| `preview` | PR ごとの自動デプロイ (Cloudflare Pages) |
| `staging` | β テスター |
| `production` | 本番 |

### 9.2 CI/CD

- GitHub Actions:
  - Lint / Test (vitest, playwright)
  - Security scan (Semgrep, gitleaks, dependency audit)
  - Wrangler deploy preview
- main マージで staging へ自動 deploy
- production deploy は手動承認 + 2 人レビュー

### 9.3 監視/アラート

- Sentry: フロント/バックエラー
- Cloudflare Analytics: トラフィック、レイテンシ
- カスタムメトリクス: AI 利用、課金イベント
- アラート: PagerDuty (Phase 6+)

### 9.4 Status Page

- Instatus 等で公開
- インシデント時に告知
- API/WS/AI Proxy の個別状態

### 9.5 サポート

- Free/Pro: コミュニティ Forum (Discord/Discourse)
- Team: メールサポート (24h)
- Business: チャット + 24h SLA
- Enterprise: 専任 CSM + Slack Connect

## 10. 競合との差別化

| 競合 | 差別化ポイント |
|---|---|
| **articy:server** | Web ネイティブ、Unity 統合深い、AI 標準、価格安い |
| **Notion** | ゲーム特化、相関図/年表/分岐、ローカル可 |
| **GitHub + spreadsheet** | ライター UX 圧倒的、レビュー UI、AI integrated |
| **Liveblocks/Figma風 collab** | ドメイン特化、ノード型 + ナラティブ |

## 11. ローンチ戦略

### 11.1 pre-launch

- Phase 0–4 で OSS / 内製で品質を上げる
- Phase 4 完了時に **closed beta** 募集 (50 社)
- 早期顧客に discount または永久 Pro 提供

### 11.2 launch

- Phase 5 完了で **public launch** (Free/Pro)
- ProductHunt, GAME 業界メディア
- ノベルゲー/オープンワールド系コミュニティへ

### 11.3 growth

- Phase 6 で Team プラン推進
- カンファレンス出展 (CEDEC, GDC)
- 大学/専門学校の教育用途

### 11.4 enterprise

- Phase 7+ で SOC 2 Type 2 取得
- 営業組織立ち上げ (1〜2 名)
- 業界ベンダー (バンナム、スクエニ等) アプローチ

## 12. 商業面の懸念とリスク

| リスク | 対策 |
|---|---|
| 大手スタジオの「自社内製優先」文化 | OSS Core で価格抵抗を下げる、内製置換ROIを示す |
| AI コストの予測困難 | 月次 Quota、超過アラート、ローカル LLM 互換 |
| 競合の本格参入 (articy が SaaS 化等) | 早期に Unity/AI 統合差別化を確立 |
| プライバシー規制強化 (GDPR/JIS等) | コンプライアンス先行投資 |
| サブスク疲れ | 永久ライセンス (オフライン版) も併売検討 |
| Cloudflare 依存 | マルチクラウド対応の余地 (将来) |

## 13. データ移行と export

- 「クラウド → ローカル」を **常に可能** (= 顧客ロックイン回避)
- すべての YAML/メディアを ZIP で download
- API でのバルク export
- アカウント削除 = 30 日後完全消去 (バックアップ含む)

## 14. オンプレ/プライベートクラウド (Phase 7+)

大手スタジオ向けに **セルフホスト版** を提供:

- Docker compose 構成
- バックエンドは Node/Bun (Cloudflare Workers 互換ランタイム)
- DB: Postgres
- Storage: S3 互換 (MinIO 等)
- ライセンス: Enterprise 契約に含む or 別売

## 15. 法務関連 (要法務確認)

- 利用規約 (ToS)
- プライバシーポリシー
- DPA
- AUP (許容利用ポリシー: AI 経由の不適切コンテンツ生成禁止 等)
- AI 出力の権利帰属、利用規約への明記
- 出資企業/プラットフォーム側 (Anthropic 等) のポリシー反映
- 免責 / SLA / 補償上限
