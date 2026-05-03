# 16. セキュリティ設計

> ブラウザ公開と SaaS 化を前提に、セキュリティを **設計の初期から** 組み込む。
> ユーザは「未公開のシナリオ」「ボイス収録前の脚本」「翻訳前のキー素材」を扱う。漏洩は事業価値に直結する。

## 設計の核

1. **ローカルファースト** — クラウドを使わない選択肢を常に残す。SaaS は opt-in
2. **最小権限** — UI/Adapter/Backend が必要最小限のアクセスしか持たない
3. **多層防御** (Defense in depth) — 1 層破られても被害が広がらない
4. **可視性** — 「いま AI に何を送ったか」「どのファイルを読んだか」がユーザに見える
5. **暗号化** — 在庫 (at-rest) と通信 (in-transit) で常に暗号化
6. **無垢な依存を信用しない** — npm/cargo/Unity Asset の脆弱性を継続監査

## 1. 脅威モデル (STRIDE 簡易)

| 脅威 | 想定攻撃 | 対策 (要約) |
|---|---|---|
| **Spoofing** (なりすまし) | 共有 URL の盗用、セッション乗っ取り | OAuth + httpOnly Secure Cookie + SameSite=Strict、招待トークン署名 |
| **Tampering** (改竄) | プロジェクトファイル/翻訳の不正書き換え | Git 由来の hash、Server-side バリデーション、署名 |
| **Repudiation** (否認) | 「自分はこの版を承認していない」 | Audit log、署名付きコミット |
| **Information Disclosure** (漏洩) | クラウド誤公開、API キー流出、AI 履歴漏洩 | RBAC、暗号化、ログマスキング、CSP |
| **Denial of Service** | 大量アップロード/AI コール | レート制限、Quota、WAF |
| **Elevation of Privilege** | 一般ユーザが管理権限を取得 | RBAC ガード、サーバ側強制、テスト |

## 2. ブラウザ単独 (Local-only) のセキュリティ

### 2.1 Content Security Policy (CSP)

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';      # eval, inline 禁止
  style-src 'self' 'unsafe-inline';            # CSS-in-JS が必要なら nonce へ移行
  img-src 'self' data: blob:;
  connect-src 'self' https://api.anthropic.com https://api.openai.com;
  font-src 'self' data:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';                       # iframe 埋込み禁止
  upgrade-insecure-requests;
```

- 開発時のみ `script-src` に `'unsafe-eval'` 追加 (HMR)、本番は厳格化
- `'unsafe-inline'` を最終的に排除する方向 (style は nonce へ)
- WASM を使うため `'wasm-unsafe-eval'` は許可

### 2.2 Subresource Integrity (SRI)

- CDN 配信のサードパーティ JS には `integrity="sha384-..."` 付与
- 自身の Vite ビルドはバンドルされるため SRI は内部 hash で担保

### 2.3 HTTPS / HSTS

- 本番は HTTPS 必須
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `localhost` は HTTPS 不要 (Tauri 含む)

### 2.4 入力サニタイズ

- ユーザ入力 (シナリオテキスト、メモ、ノード名) を **HTML として描画する箇所** はゼロにする
- Markdown レンダラに **DOMPurify** を必ずかける
- ユーザ提供の URL を `<a href>` に出すときは `rel="noreferrer noopener"` + プロトコル制限

### 2.5 File System Access API の権限

- ユーザがフォルダを選択するまで一切アクセス不可 (ブラウザ仕様)
- 取得したハンドルは IndexedDB に保存しても、リロード後に再要求 (ブラウザ仕様)
- 書き込み時のみ別途許可ダイアログ (writeable mode)
- Path traversal は API レベルで防止される (絶対パス指定不可)

### 2.6 OPFS / IndexedDB のオリジン分離

- 各ブラウザでオリジン単位に隔離
- 本ツールは独自 origin (例: `scenario.actoratect.dev`) で配信
- サブドメイン共有しない

### 2.7 AI API キーの保管

| 方式 | リスク | 採用フェーズ |
|---|---|---|
| `localStorage` 平文 | XSS で全奪取 | **採用しない** |
| `IndexedDB` 平文 | 同上 (IndexedDB も script から読める) | **採用しない** |
| `IndexedDB` + パスフレーズ暗号化 (WebCrypto AES-GCM) | 復号には pass 必要、メモリ滞留時間に注意 | MVP〜β で採用 |
| `IndexedDB` + 端末固有 key (WebCrypto) | XSS で簡単に復号できてしまう | **採用しない** (擬似セキュリティ) |
| サーバ側保管 (SaaS proxy) | 流出ポイントが減る | Phase 5+ |

→ **MVP**: パスフレーズ暗号化、入力時のみ 30 分メモリ滞留、自動破棄
→ **Phase 5+**: SaaS 利用者は server-side proxy を強く推奨

#### 実装例

```typescript
import { encrypt, decrypt } from "./crypto";

async function saveApiKey(key: string, passphrase: string) {
  const cipher = await encrypt(key, passphrase);
  await idb.put("secret", { id: "anthropic", cipher });
}

async function loadApiKey(passphrase: string): Promise<string> {
  const { cipher } = await idb.get("secret", "anthropic");
  return decrypt(cipher, passphrase);
}
```

WebCrypto は AES-GCM 256bit + PBKDF2 (200k iter) を使う。

### 2.8 AI 送信内容の最小化と可視化

- 送信ボタン押下前に「Show prompt」ダイアログで全文プレビュー
- ノードに `ai: { allow: false }` フラグで明示禁止
- ログを IndexedDB に保存、ユーザが任意削除可能

### 2.9 第三者依存の監査

- `npm audit --omit=dev` を CI で実行、High 以上で失敗
- `cargo audit` (Tauri Rust 側)
- **Renovate / Dependabot** で常時更新
- SBOM (CycloneDX) を release ごとに添付
- 重要パッケージは pinned バージョン (Renovate 経由で更新)

### 2.10 Service Worker の取扱い

- スコープは `/` 限定 (他 origin に影響しない)
- 自動更新時は `skipWaiting()` ではなく**ユーザ確認後**に切替
- API レスポンスをキャッシュしない (機密漏洩防止)

## 3. Tauri (Desktop) のセキュリティ

### 3.1 OS キーチェーン

- AI API キーは `keyring` クレート経由で OS 標準ストアへ
  - Win: Credential Manager
  - macOS: Keychain
  - Linux: Secret Service (gnome-keyring/kwallet)
- アプリ固有のサービス名で分離

### 3.2 Tauri 権限スコープ

- `tauri.conf.json` の `app.security` で権限を最小化
- `allowlist` で必要な FS/Shell/HTTP のみ許可
- `dialog.open` 等は user-gesture からのみ呼び出し可

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; ...",
      "freezePrototype": true
    }
  },
  "plugins": {
    "fs": {
      "scope": ["$DOCUMENT/**", "$HOME/scenario_projects/**"]
    },
    "shell": { "open": true }
  }
}
```

### 3.3 自動更新の署名

- リリース成果物 (msi/dmg/AppImage) を Ed25519 で署名
- Tauri Updater が公開鍵で検証
- 改竄バイナリの実行を阻止

### 3.4 OS 別コード署名

- Win: Authenticode (EV cert 推奨、SmartScreen 警告回避)
- macOS: Apple Developer ID + Notarization (Gatekeeper 通過)
- Linux: GPG 署名 (一般慣行)

### 3.5 Deep Link の検証

- `actoratect://open?path=...` は受信側で path を検証
- `..` を含むパス、シンボリックリンク経由を拒否

## 4. Unity Bridge のセキュリティ

### 4.1 localhost 限定 + ランダムシークレット

- HTTP Listener は `127.0.0.1` のみバインド (LAN 公開しない)
- 起動時にランダム 32B トークン生成、URL クエリ `?token=...` で授受
- すべての API 呼び出しでトークン照合 (HMAC ヘッダ推奨)

### 4.2 CORS

- `Access-Control-Allow-Origin` は `https://scenario.actoratect.dev` (本番) と `http://localhost:5173` (開発) のみ
- `*` 禁止
- ブラウザ拡張からのアクセスは拒否

### 4.3 ファイル操作のサンドボックス

- `Assets/` 配下にのみアクセスを許可
- `..` を含むパスは Reject
- シンボリックリンクは追跡しない
- `*.meta` の書込は禁止 (Unity の自動生成のみ)

### 4.4 起動時の検証

- 別プロセスがすでにポート使用中なら別ポート (range 17321-17329)
- Unity Editor の起動 PID 確認 (古いセッションが残らないよう)

## 5. SaaS のセキュリティ (Phase X / 棚上げ)

> SaaS は **棚上げ (Phase X)**。本章は将来着手する際の参考スナップショット。
> Phase 0〜4 のローカルツール実装には不要。詳細は `17_saas.md` (棚上げ扱い)。

### 5.1 認証

- **OAuth** (GitHub, Google) を主、メール+パスフレーズを副
- **MFA** 必須 (Team/Enterprise プラン)、任意 (Pro)
- Session: httpOnly + Secure + SameSite=Strict クッキー
- セッション有効期限: 30 日 (sliding)、感度操作 (請求等) は再認証
- Passkey (WebAuthn) 対応 (Phase 6+)

### 5.2 認可 (RBAC)

ロールと権限:

| ロール | プロジェクト権限 |
|---|---|
| **Owner** | すべて、削除、メンバー管理、課金 |
| **Admin** | メンバー管理 (削除/課金除く) |
| **Editor** | ノード/シナリオ全編集、エクスポート |
| **Translator** | Localization 専用編集、本文 read-only |
| **Reviewer** | Read + Comment + Lint 実行 |
| **Viewer** | Read のみ |

サーバ側で権限ガード、UI 側でも該当機能を hide。

### 5.3 マルチテナント分離

- DB レベルで Tenant ID を主キーに含める (Row-level isolation)
- すべての SQL に `WHERE tenant_id = ?` を強制 (ORM ミドルウェアで強制)
- Cloudflare D1 / Postgres RLS の活用
- Object Storage (R2) は `tenant/<id>/...` で prefix 分離 + 署名 URL

### 5.4 暗号化

| 部位 | 方式 |
|---|---|
| 通信 | TLS 1.3 強制、HSTS preload |
| DB at-rest | クラウドプロバイダの SSE (D1/R2) |
| メディア at-rest | R2 SSE-KMS |
| 機密フィールド (API キー等) | アプリレベルで AES-256-GCM 追加 |
| バックアップ | Server-Side Encryption + Off-site |

### 5.5 AI Proxy (重要)

- ユーザの API キーを **絶対にクライアントへ返さない**
- Proxy エンドポイントで Anthropic/OpenAI へ中継
- リクエスト/レスポンスを監査ログ (本文は秘匿)
- レート制限 (per-tenant, per-user)
- Quota (月次トークン上限)
- プロンプトキャッシュをサーバ側で集中管理 (コスト削減)

### 5.6 Audit Log

- 操作: 編集、共有、エクスポート、削除、メンバー管理
- 保持: 1 年 (Pro)、3 年 (Enterprise)
- IP / User-Agent / 時刻 / 対象リソース ID / 操作種別
- 改竄不能 (append-only, ハッシュチェーン)

### 5.7 ファイルアップロード

- メディア (画像/音声) は ClamAV 等でスキャン
- MIME と拡張子の整合性確認
- 最大サイズ制限 (Pro: 5GB/プロジェクト, Team: 50GB, Enterprise: 上限なし)

### 5.8 招待リンクと共有

- 招待トークンは HMAC 署名 + 有効期限 (7 日 default)
- 招待先メールに送付、または QR コード
- 共有 URL (Read-only) はトークン or 認証必須を選択可
- Audit log に「誰が誰を招待」記録

### 5.9 GDPR / 個人情報

- データエクスポート機能 (JSON/ZIP)
- アカウント削除 = 30 日後完全消去 (バックアップ含む)
- DPA (Data Processing Agreement) を Enterprise で提供
- データ所在の選択 (日本リージョン / グローバル)
- Cookie 同意バナー (EU 訪問者向け)

### 5.10 ペネトレーションテスト

- 1.0 リリース前に外部監査
- 年次更新
- バグバウンティプログラム検討 (Phase 6+)

## 6. 開発プロセスのセキュリティ

### 6.1 CI/CD

- GitHub Actions で:
  - `npm audit` / `cargo audit` / OWASP Dependency Check
  - SAST (Semgrep / CodeQL)
  - Container scan (Trivy)
  - Secret scanning (gitleaks)
- main ブランチ強制レビュー、署名コミット推奨
- Production deploy は 2 人承認 (Phase 5+)

### 6.2 シークレット管理

- リポジトリに API キーをコミットしない (gitleaks 検査)
- ローカル開発: `.env.local` を `.gitignore`
- CI/CD: GitHub Encrypted Secrets
- 本番: Cloudflare Secrets / 1Password

### 6.3 開発者アクセス制御

- SaaS production への SSH/DB アクセスは IP 制限 + MFA
- 監査ログを SIEM (将来) に転送

## 7. インシデント対応

### 7.1 検知

- Sentry (フロント/バックのエラー)
- Cloudflare Analytics (異常トラフィック)
- アラート: 失敗ログイン頻発、通常逸脱の AI 呼出量

### 7.2 初動

- 影響範囲特定 (どのテナント/プロジェクト/ユーザ)
- 必要に応じてサービス停止 (read-only モード)
- 関係者通知 (24 時間以内、GDPR 72 時間)

### 7.3 事後

- ポストモーテム公開
- 再発防止策と適用期限
- 必要なら脆弱性公表 (CVE)

## 8. コンプライアンスのロードマップ

| 認証/規格 | フェーズ |
|---|---|
| **GDPR** 対応基本機能 | Phase 5 SaaS リリース時 |
| **JIS Q 27001 (ISO 27001)** | Phase 6+ Enterprise 顧客向け |
| **SOC 2 Type 1** | Phase 6+ |
| **SOC 2 Type 2** | Phase 7+ |
| **HIPAA** | 該当ユース無し (見送り) |

## 9. ユーザに見えるセキュリティ機能

技術的な対策と並行して、UI でも安心感を与える:

- 「最後の同期: 5 分前 (暗号化済)」
- 「AI に送信: 直近 30 日で 124 回、コスト ¥1,234」
- 「未許可端末からアクセスがありました (削除)」
- 「あなたのプロジェクトは以下に保管: ローカルのみ / 暗号化されたクラウド」
- データエクスポート/削除のセルフサービスボタン

## 10. 監査と継続改善

- 半期ごとに脅威モデル見直し
- 年次外部 pen test (1.0 以降)
- セキュリティアドバイザリの公開 (`/security/advisories`)
- `.well-known/security.txt` 設置
- 脆弱性報告窓口 (security@actoratect.dev)
