import {
  assertSafePath,
  type FileSystemAdapter,
  type ProjectHandle,
  type WatchHandler,
} from '@scenario-studio/core';

// Unity Editor Bridge 用 Adapter (HTTP / SSE クライアント)。
//
// 対 Unity 側 BridgeServer の REST 仕様:
//   GET    /api/files?glob=...           → string[]
//   GET    /api/file?path=...            → text/plain
//   GET    /api/file_bytes?path=...      → application/octet-stream
//   PUT    /api/file?path=...            → 204
//   DELETE /api/file?path=...            → 204
//   GET    /api/exists?path=...          → { exists: boolean }
//   GET    /api/sse/changes              → text/event-stream (WatchEvent JSON)
//
// PoC-C 範囲: TS 側クライアントの実装と HMAC token 添付パターン。
//   Bridge サーバ実体は **Phase 2** で `com.actoratect.editor-tools` に C# で実装する。
//
// 詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §7,
//       ../../../Documentation/ScenarioEditor/16_security.md §4 (localhost 限定 + ランダムトークン),
//       ../../../Documentation/ScenarioEditor/18_unity-integration.md

export interface UnityBridgeConfig {
  /** Unity Editor が起動する Bridge サーバの基底 URL (例: `http://127.0.0.1:17321`)。 */
  baseUrl: string;
  /** Bridge 起動時に発行されるランダムシークレット。Authorization ヘッダで送る。 */
  token: string;
  /** 任意のカスタム fetch (テスト時のスタブ用)。デフォルトはグローバルの fetch。 */
  fetchImpl?: typeof fetch;
}

export class UnityFileSystemAdapter implements FileSystemAdapter {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: UnityBridgeConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.token = config.token;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async list(handle: ProjectHandle, glob: string): Promise<readonly string[]> {
    const res = await this.request(`/api/files?glob=${encodeURIComponent(glob)}`, handle);
    return (await res.json()) as readonly string[];
  }

  async read(handle: ProjectHandle, path: string): Promise<string> {
    assertSafePath(path);
    const res = await this.request(`/api/file?path=${encodeURIComponent(path)}`, handle);
    return res.text();
  }

  async readBytes(handle: ProjectHandle, path: string): Promise<Uint8Array> {
    assertSafePath(path);
    const res = await this.request(`/api/file_bytes?path=${encodeURIComponent(path)}`, handle);
    return new Uint8Array(await res.arrayBuffer());
  }

  async write(handle: ProjectHandle, path: string, data: string): Promise<void> {
    assertSafePath(path);
    await this.request(`/api/file?path=${encodeURIComponent(path)}`, handle, {
      method: 'PUT',
      body: data,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  async writeBytes(handle: ProjectHandle, path: string, data: Uint8Array): Promise<void> {
    assertSafePath(path);
    // SharedArrayBuffer-backed Uint8Array でも安全に渡せるよう ArrayBuffer に複製
    const owned = new ArrayBuffer(data.byteLength);
    new Uint8Array(owned).set(data);
    await this.request(`/api/file?path=${encodeURIComponent(path)}`, handle, {
      method: 'PUT',
      body: new Blob([owned], { type: 'application/octet-stream' }),
    });
  }

  async delete(handle: ProjectHandle, path: string): Promise<void> {
    assertSafePath(path);
    await this.request(`/api/file?path=${encodeURIComponent(path)}`, handle, { method: 'DELETE' });
  }

  async exists(handle: ProjectHandle, path: string): Promise<boolean> {
    assertSafePath(path);
    const res = await this.request(`/api/exists?path=${encodeURIComponent(path)}`, handle);
    const body = (await res.json()) as { exists: boolean };
    return body.exists;
  }

  /**
   * SSE で `/api/sse/changes` を購読し、Bridge から流れる WatchEvent を転送する。
   * Bridge 切断時の再接続戦略は Phase 2 で詰める (現状は単発接続)。
   */
  watch(_handle: ProjectHandle, onEvent: WatchHandler): () => void {
    const url = `${this.baseUrl}/api/sse/changes?token=${encodeURIComponent(this.token)}`;
    const source = new EventSource(url);
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as {
          kind: 'add' | 'change' | 'delete';
          path: string;
        };
        onEvent(data);
      } catch {
        // 壊れたペイロードは黙って無視 (Bridge 側 bug を front に伝搬しない)
      }
    };
    return () => source.close();
  }

  private async request(
    pathAndQuery: string,
    handle: ProjectHandle,
    init?: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('X-Project-Handle', handle.id);
    const res = await this.fetchImpl(`${this.baseUrl}${pathAndQuery}`, { ...init, headers });
    if (!res.ok) {
      throw new Error(`Unity Bridge ${res.status}: ${pathAndQuery}`);
    }
    return res;
  }
}
