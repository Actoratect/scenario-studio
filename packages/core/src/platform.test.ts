import { describe, expect, it } from 'vitest';
import { assertSafePath, compileGlob, InvalidPathError } from './platform.js';

describe('assertSafePath', () => {
  it.each([
    ['Nodes/Character/tarou.yaml'],
    ['scenes/ch01_s01.scn.yaml'],
    ['media/voice/tarou_001.wav'],
  ])('accepts safe POSIX relative path %s', (path) => {
    expect(() => assertSafePath(path)).not.toThrow();
  });

  it.each([
    ['', 'empty'],
    ['..', 'parent traversal'],
    ['Nodes/../etc/passwd', 'parent traversal mid-path'],
    ['/abs/path', 'absolute'],
    ['C:/foo', 'Windows drive letter'],
    ['c:\\foo', 'backslash + drive'],
    ['Nodes\\Character', 'backslash separator'],
    ['Nodes//Character', 'empty segment'],
    ['./Nodes', 'leading dot segment'],
    ['Nodes/./Character', 'mid dot segment'],
    ['Nodes/\0/x', 'null byte'],
  ])('rejects unsafe path %s (%s)', (path) => {
    expect(() => assertSafePath(path)).toThrow(InvalidPathError);
  });
});

describe('compileGlob', () => {
  it('matches `*` as single path component', () => {
    const m = compileGlob('Nodes/*.yaml');
    expect(m('Nodes/tarou.yaml')).toBe(true);
    expect(m('Nodes/Character/tarou.yaml')).toBe(false);
  });

  it('matches `**` across path components', () => {
    const m = compileGlob('Nodes/**/*.yaml');
    expect(m('Nodes/tarou.yaml')).toBe(true);
    expect(m('Nodes/Character/tarou.yaml')).toBe(true);
    expect(m('Nodes/Character/sub/tarou.yaml')).toBe(true);
    expect(m('Other/x.yaml')).toBe(false);
  });

  it('matches `?` as single non-slash char', () => {
    const m = compileGlob('s0?.yaml');
    expect(m('s01.yaml')).toBe(true);
    expect(m('s10.yaml')).toBe(false);
    expect(m('s0/1.yaml')).toBe(false);
  });

  it('escapes regex metacharacters in literal segments', () => {
    const m = compileGlob('a.b+c/*.yaml');
    expect(m('a.b+c/x.yaml')).toBe(true);
    expect(m('aXb+c/x.yaml')).toBe(false); // `.` should not match arbitrary char
  });
});
