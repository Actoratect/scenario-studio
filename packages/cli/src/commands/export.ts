import * as nodePath from 'node:path';
import { NodeFileSystemAdapter } from '@scenario-studio/adapter-node';
import { loadProject } from '@scenario-studio/core';
import type { NodeId, ScenarioNode } from '@scenario-studio/core';

// `scenario export <project-path> --node <id> [--format yaml|json]`
// 単一ノードを stdout に書き出す。CI で「特定ノードの fields だけ抜き出す」用途。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

export interface ExportOptions {
  projectPath: string;
  nodeId: string;
  format?: 'yaml' | 'json';
}

export interface ExportResult {
  exitCode: 0 | 1;
  output: string;
}

export async function exportNode(options: ExportOptions): Promise<ExportResult> {
  const abs = nodePath.resolve(options.projectPath);
  const adapter = new NodeFileSystemAdapter();
  const handle = adapter.register(abs, nodePath.basename(abs));
  const loaded = await loadProject(adapter, handle);

  const node = loaded.project.nodes.get(options.nodeId as NodeId);
  if (!node) {
    return {
      exitCode: 1,
      output: `Node not found: ${options.nodeId}`,
    };
  }

  const format = options.format ?? 'yaml';
  return {
    exitCode: 0,
    output: format === 'json' ? renderJson(node) : renderYaml(node),
  };
}

function renderJson(node: ScenarioNode): string {
  return JSON.stringify(node, null, 2);
}

function renderYaml(node: ScenarioNode): string {
  // CLI 用の軽量 YAML レンダ。コメント保持や複雑な型は不要なので JSON→簡易整形。
  // 厳密 round-trip が必要な場合は core/yaml の serializeYaml を使う方針 (将来)。
  const lines: string[] = [];
  emitObject(node as unknown as Record<string, unknown>, 0, lines);
  return lines.join('\n');
}

function emitObject(obj: Record<string, unknown>, depth: number, out: string[]): void {
  const indent = '  '.repeat(depth);
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value === null) {
      out.push(`${indent}${key}: null`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        out.push(`${indent}${key}: []`);
      } else {
        out.push(`${indent}${key}:`);
        for (const item of value) {
          if (item !== null && typeof item === 'object') {
            out.push(`${indent}  -`);
            emitObject(item as Record<string, unknown>, depth + 2, out);
          } else {
            out.push(`${indent}  - ${formatScalar(item)}`);
          }
        }
      }
    } else if (typeof value === 'object') {
      out.push(`${indent}${key}:`);
      emitObject(value as Record<string, unknown>, depth + 1, out);
    } else {
      out.push(`${indent}${key}: ${formatScalar(value)}`);
    }
  }
}

function formatScalar(v: unknown): string {
  if (typeof v === 'string') {
    if (/^[A-Za-z0-9_./@:-]+$/.test(v) && v.length > 0) return v;
    return JSON.stringify(v);
  }
  return String(v);
}
