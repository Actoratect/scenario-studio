import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { CliAgentRunner } from './CliAgentRunner.js';

describe('CliAgentRunner', () => {
  it('captures stdout and exitCode from a successful child', async () => {
    // node -e "process.stdout.write('hello'); process.exit(0)"
    const runner = new CliAgentRunner({
      id: 'test-echo',
      displayName: 'echo via node -e',
      command: process.execPath,
      buildArgs: () => ['-e', "process.stdout.write('hello'); process.exit(0)"],
    });

    const result = await runner.run({
      prompt: 'ignored',
      workingDirectory: tmpdir(),
      scope: { include: [], exclude: [] },
      dryRun: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.log).toContain('hello');
    expect(result.patches).toEqual([]);
  });

  it('captures non-zero exitCode and stderr', async () => {
    const runner = new CliAgentRunner({
      id: 'test-fail',
      displayName: 'fail via node -e',
      command: process.execPath,
      buildArgs: () => ['-e', "process.stderr.write('boom'); process.exit(7)"],
    });

    const result = await runner.run({
      prompt: 'ignored',
      workingDirectory: tmpdir(),
      scope: { include: [], exclude: [] },
      dryRun: true,
    });

    expect(result.exitCode).toBe(7);
    expect(result.log).toContain('boom');
  });

  it('passes envOverrides through to the child', async () => {
    const runner = new CliAgentRunner({
      id: 'test-env',
      displayName: 'echo env',
      command: process.execPath,
      buildArgs: () => ['-e', 'process.stdout.write(process.env.MY_TEST_VAR || "MISSING")'],
    });

    const result = await runner.run({
      prompt: 'ignored',
      workingDirectory: tmpdir(),
      scope: { include: [], exclude: [] },
      dryRun: true,
      envOverrides: { MY_TEST_VAR: 'injected' },
    });

    expect(result.exitCode).toBe(0);
    expect(result.log).toContain('injected');
  });
});
