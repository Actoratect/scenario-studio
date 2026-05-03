// AI API キーの安全保管 — ブラウザの WebCrypto AES-GCM + PBKDF2 でパスフレーズ起動。
// 16_security.md §2.7 「ユーザのパスフレーズで AES-GCM、IndexedDB に encrypted blob」を実装。
// IndexedDB I/O は frontend 側 (idb 経由) で行う想定: ここでは encrypt/decrypt の純粋ロジックだけ提供。
// 詳細: ../../../../Documentation/ScenarioEditor/16_security.md §2.7,
//       ../../../../Documentation/ScenarioEditor/11_ai-workflow.md §6.1,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7

const PBKDF2_ITER = 200_000;
const PBKDF2_HASH = 'SHA-256';
const KEY_LEN_BITS = 256;
const SALT_LEN = 16;
const IV_LEN = 12;

export interface EncryptedKeyBlob {
  /** PBKDF2 用 salt (base64)。 */
  salt: string;
  /** AES-GCM 用 IV (base64)。 */
  iv: string;
  /** 暗号文 (base64)。 */
  ciphertext: string;
  /** PBKDF2 反復回数。将来上方修正できるよう、blob に同梱。 */
  iterations: number;
}

/** UTF-8 文字列としての API キーをパスフレーズで暗号化。 */
export async function encryptApiKey(
  apiKey: string,
  passphrase: string,
  cryptoImpl: Crypto = crypto,
): Promise<EncryptedKeyBlob> {
  const salt = randomBytes(SALT_LEN, cryptoImpl);
  const iv = randomBytes(IV_LEN, cryptoImpl);
  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITER, cryptoImpl);
  const plaintext = new TextEncoder().encode(apiKey);
  // TS 5.7+ の Uint8Array<ArrayBufferLike> を WebCrypto の BufferSource (ArrayBuffer-backed)
  // に narrow するため、ローカル alloc はすべて ArrayBuffer-backed として扱う
  const ciphertext = await cryptoImpl.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    key,
    plaintext as Uint8Array<ArrayBuffer>,
  );
  return {
    salt: b64encode(salt),
    iv: b64encode(iv),
    ciphertext: b64encode(new Uint8Array(ciphertext)),
    iterations: PBKDF2_ITER,
  };
}

/**
 * 復号。パスフレーズが間違っていれば AES-GCM tag 検証エラーで throw。
 * 上位 UI は「パスフレーズが違います」を表示して再入力を促す。
 */
export async function decryptApiKey(
  blob: EncryptedKeyBlob,
  passphrase: string,
  cryptoImpl: Crypto = crypto,
): Promise<string> {
  const salt = b64decode(blob.salt);
  const iv = b64decode(blob.iv);
  const ciphertext = b64decode(blob.ciphertext);
  const key = await deriveAesKey(passphrase, salt, blob.iterations, cryptoImpl);
  const plaintext = await cryptoImpl.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    key,
    ciphertext as Uint8Array<ArrayBuffer>,
  );
  return new TextDecoder().decode(plaintext);
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  cryptoImpl: Crypto,
): Promise<CryptoKey> {
  const passphraseBytes = new TextEncoder().encode(passphrase);
  const baseKey = await cryptoImpl.subtle.importKey(
    'raw',
    passphraseBytes as Uint8Array<ArrayBuffer>,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return cryptoImpl.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations, hash: PBKDF2_HASH },
    baseKey,
    { name: 'AES-GCM', length: KEY_LEN_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

function randomBytes(len: number, cryptoImpl: Crypto): Uint8Array {
  const buf = new Uint8Array(len);
  cryptoImpl.getRandomValues(buf);
  return buf;
}

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
