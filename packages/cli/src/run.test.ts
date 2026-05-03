import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import { NodeFileSystemAdapter } from '@scenario-studio/adapter-node';
import {
  CHARACTER_TEMPLATE,
  createNode,
  initializeProject,
  TemplateRegistry,
  FsNodeRepository,
} from '@scenario-studio/core';
import { run } from './run.js';

// CLI integration test: tmp project に initializeProject + 1 ノード書き込み →
// validate / export / stats を run() 経由で叩いて exit code + 出力を検証。

interface CapturedIo {
  stdout: string[];
  stderr: string[];
  io: { stdout: (l: string) => void; stderr: (l: string) => void };
}

function capture(): CapturedIo {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (l) => stdout.push(l),
      stderr: (l) => stderr.push(l),
    },
  };
}

describe('CLI run()', () => {
  let projectDir: string;
  let nodeIdValue: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(nodePath.join(tmpdir(), 'scenario-cli-'));
    const adapter = new NodeFileSystemAdapter();
    const handle = adapter.register(projectDir, 'cli-test');
    await initializeProject(adapter, handle, { name: 'cli-test' });

    const templates = new TemplateRegistry();
    const repo = new FsNodeRepository(adapter, handle, templates);
    const node = createNode(templates, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: 'tarou',
      fields: { full_name: { ja: '太郎', en: 'Tarou' } },
    });
    nodeIdValue = node.id;
    await repo.save(node);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('--help prints usage', async () => {
    const cap = capture();
    const code = await run(['--help'], cap.io);
    expect(code).toBe(0);
    expect(cap.stdout.join('\n')).toMatch(/Usage:/);
  });

  it('validate returns 0 when only info-level issues are present', async () => {
    // 1 char without incoming refs → orphan-node (info)。エラーが無いので exit 0。
    const cap = capture();
    const code = await run(['validate', projectDir], cap.io);
    expect(code).toBe(0);
    expect(cap.stdout.join('\n')).toMatch(/0 error/);
  });

  it('validate --format json emits machine-readable issues array', async () => {
    const cap = capture();
    const code = await run(['validate', projectDir, '--format', 'json'], cap.io);
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.stdout.join('\n')) as { issues: unknown[] };
    expect(Array.isArray(parsed.issues)).toBe(true);
  });

  it('export --node <id> writes the node to stdout', async () => {
    const cap = capture();
    const code = await run(['export', projectDir, '--node', nodeIdValue], cap.io);
    expect(code).toBe(0);
    expect(cap.stdout.join('\n')).toMatch(/slug: tarou/);
  });

  it('export --node <unknown> returns 1', async () => {
    const cap = capture();
    const code = await run(['export', projectDir, '--node', 'does-not-exist'], cap.io);
    expect(code).toBe(1);
    expect(cap.stderr.join('\n')).toMatch(/Node not found/);
  });

  it('export --format json emits valid JSON', async () => {
    const cap = capture();
    const code = await run(
      ['export', projectDir, '--node', nodeIdValue, '--format', 'json'],
      cap.io,
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.stdout.join('\n')) as { slug: string };
    expect(parsed.slug).toBe('tarou');
  });

  it('stats reports node + character count + untranslated', async () => {
    const cap = capture();
    const code = await run(['stats', projectDir, '--format', 'json'], cap.io);
    expect(code).toBe(0);
    const report = JSON.parse(cap.stdout.join('\n')) as {
      nodeCount: number;
      sceneCount: number;
      glossaryTermCount: number;
      totalCharacters: number;
    };
    expect(report.nodeCount).toBe(1);
    expect(report.sceneCount).toBe(0);
    expect(report.glossaryTermCount).toBe(0);
    expect(report.totalCharacters).toBeGreaterThan(0); // 太郎/Tarou
  });

  it('unknown command returns 2', async () => {
    const cap = capture();
    const code = await run(['nope'], cap.io);
    expect(code).toBe(2);
    expect(cap.stderr.join('\n')).toMatch(/Unknown command/);
  });

  it('missing positional returns 2', async () => {
    const cap = capture();
    const code = await run(['validate'], cap.io);
    expect(code).toBe(2);
    expect(cap.stderr.join('\n')).toMatch(/missing/);
  });
});
