import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { EncryptedKeyBlob } from '@scenario-studio/core';

// AI API キー暗号化ブロブの IndexedDB 永続化 (M8)。
// 復号は AiService 側で WebCrypto を呼ぶ — ここは「読み書きだけ」。
// 詳細: ../../../../Documentation/ScenarioEditor/16_security.md §2.7,
//       ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M7, M8

const DB_NAME = 'scenario-studio-ai';
const DB_VERSION = 1;
const STORE = 'key_vault';

interface AiKeyStoreSchema extends DBSchema {
  key_vault: {
    key: string; // providerId
    value: {
      providerId: string;
      blob: EncryptedKeyBlob;
      updatedAt: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<AiKeyStoreSchema>> | undefined;

function db(): Promise<IDBPDatabase<AiKeyStoreSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<AiKeyStoreSchema>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'providerId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function loadKeyBlob(providerId: string): Promise<EncryptedKeyBlob | undefined> {
  const row = await (await db()).get(STORE, providerId);
  return row?.blob;
}

export async function saveKeyBlob(providerId: string, blob: EncryptedKeyBlob): Promise<void> {
  await (await db()).put(STORE, { providerId, blob, updatedAt: Date.now() });
}

export async function clearKeyBlob(providerId: string): Promise<void> {
  await (await db()).delete(STORE, providerId);
}

/** テスト用 in-memory リセット。 */
export function _resetForTesting(): void {
  dbPromise = undefined;
}
