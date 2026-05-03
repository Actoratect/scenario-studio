import { describe, expect, it } from 'vitest';
import { decryptApiKey, encryptApiKey } from './key-vault.js';

// vitest は Node 20+ で globalThis.crypto (WebCrypto) をネイティブで提供する。
describe('AI key vault', () => {
  it('encrypt → decrypt round-trips the API key', async () => {
    const blob = await encryptApiKey('sk-secret-12345', 'correct horse battery staple');
    const recovered = await decryptApiKey(blob, 'correct horse battery staple');
    expect(recovered).toBe('sk-secret-12345');
  });

  it('different passphrases throw on decrypt (AES-GCM tag mismatch)', async () => {
    const blob = await encryptApiKey('sk-secret', 'correct passphrase');
    await expect(decryptApiKey(blob, 'wrong passphrase')).rejects.toBeDefined();
  });

  it('produces different ciphertext for same input + passphrase (random salt+iv)', async () => {
    const a = await encryptApiKey('sk-x', 'pp');
    const b = await encryptApiKey('sk-x', 'pp');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
  });

  it('blob iterations field is recorded for forward compat', async () => {
    const blob = await encryptApiKey('sk', 'pp');
    expect(blob.iterations).toBeGreaterThanOrEqual(100_000);
  });

  it('round-trips long unicode passphrase + API key', async () => {
    const passphrase = 'ヒミツの🔑パス';
    const apiKey = 'sk-abc-' + 'X'.repeat(500);
    const blob = await encryptApiKey(apiKey, passphrase);
    expect(await decryptApiKey(blob, passphrase)).toBe(apiKey);
  });
});
