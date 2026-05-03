import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';

describe('parseArgs', () => {
  it('returns empty command when argv is empty', () => {
    expect(parseArgs([])).toEqual({ command: '', positional: [], flags: {} });
  });

  it('captures command + positional args', () => {
    expect(parseArgs(['validate', './my-project'])).toEqual({
      command: 'validate',
      positional: ['./my-project'],
      flags: {},
    });
  });

  it('parses --flag value form', () => {
    const a = parseArgs(['export', './p', '--node', 'abc', '--format', 'json']);
    expect(a.flags).toEqual({ node: 'abc', format: 'json' });
    expect(a.positional).toEqual(['./p']);
  });

  it('parses --flag=value form', () => {
    const a = parseArgs(['stats', './p', '--format=json']);
    expect(a.flags).toEqual({ format: 'json' });
  });

  it('treats trailing --flag as boolean', () => {
    const a = parseArgs(['cmd', '--verbose']);
    expect(a.flags).toEqual({ verbose: true });
  });

  it('treats --flag followed by another --flag as boolean', () => {
    const a = parseArgs(['cmd', '--verbose', '--format', 'json']);
    expect(a.flags).toEqual({ verbose: true, format: 'json' });
  });
});
