import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import { InvalidPathError } from '@scenario-studio/core';
import { NodeFileSystemAdapter } from './NodeFileSystemAdapter.js';

describe('NodeFileSystemAdapter', () => {
  let root: string;
  const adapter = new NodeFileSystemAdapter();

  beforeEach(async () => {
    root = await mkdtemp(nodePath.join(tmpdir(), 'ss-fs-'));
    // 試験用フィクスチャ
    await mkdir(nodePath.join(root, 'Nodes', 'Character'), { recursive: true });
    await writeFile(nodePath.join(root, 'Nodes', 'Character', 'tarou.yaml'), 'kind: node\n');
    await writeFile(nodePath.join(root, 'Nodes', 'Character', 'hanako.yaml'), 'kind: node\n');
    await writeFile(nodePath.join(root, 'Nodes', 'top.yaml'), 'kind: node\n');
    await writeFile(nodePath.join(root, 'README.md'), '# test\n');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('list — flat glob matches files in a single directory', async () => {
    const handle = adapter.register(root, 'test');
    const files = await adapter.list(handle, 'Nodes/*.yaml');
    expect(files).toEqual(['Nodes/top.yaml']);
  });

  it('list — `**` matches recursively', async () => {
    const handle = adapter.register(root, 'test');
    const files = await adapter.list(handle, 'Nodes/**/*.yaml');
    expect(files).toEqual([
      'Nodes/Character/hanako.yaml',
      'Nodes/Character/tarou.yaml',
      'Nodes/top.yaml',
    ]);
  });

  it('read returns UTF-8 string content', async () => {
    const handle = adapter.register(root, 'test');
    const content = await adapter.read(handle, 'Nodes/Character/tarou.yaml');
    expect(content).toBe('kind: node\n');
  });

  it('readBytes returns Uint8Array', async () => {
    const handle = adapter.register(root, 'test');
    const bytes = await adapter.readBytes(handle, 'Nodes/Character/tarou.yaml');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe('kind: node\n');
  });

  it('write creates parent directories and persists data', async () => {
    const handle = adapter.register(root, 'test');
    await adapter.write(handle, 'Nodes/Item/sword.yaml', 'kind: node\nslug: sword\n');
    const content = await adapter.read(handle, 'Nodes/Item/sword.yaml');
    expect(content).toBe('kind: node\nslug: sword\n');
  });

  it('writeBytes round-trips binary content', async () => {
    const handle = adapter.register(root, 'test');
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    await adapter.writeBytes(handle, 'media/x.bin', bytes);
    const got = await adapter.readBytes(handle, 'media/x.bin');
    expect(Array.from(got)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it('exists reflects file presence', async () => {
    const handle = adapter.register(root, 'test');
    expect(await adapter.exists(handle, 'Nodes/Character/tarou.yaml')).toBe(true);
    expect(await adapter.exists(handle, 'Nodes/Character/missing.yaml')).toBe(false);
  });

  it('delete removes the file', async () => {
    const handle = adapter.register(root, 'test');
    await adapter.delete(handle, 'Nodes/Character/tarou.yaml');
    expect(await adapter.exists(handle, 'Nodes/Character/tarou.yaml')).toBe(false);
  });

  it('rejects path traversal attempts', async () => {
    const handle = adapter.register(root, 'test');
    await expect(adapter.read(handle, '../etc/passwd')).rejects.toBeInstanceOf(InvalidPathError);
    await expect(adapter.read(handle, '/abs/path')).rejects.toBeInstanceOf(InvalidPathError);
    await expect(adapter.read(handle, 'Nodes\\Character')).rejects.toBeInstanceOf(InvalidPathError);
  });

  it('throws on unknown handle', async () => {
    const fakeHandle = Object.freeze({ id: 'nonexistent', name: 'fake' });
    await expect(adapter.read(fakeHandle, 'README.md')).rejects.toThrow(/Unknown ProjectHandle/);
  });
});
