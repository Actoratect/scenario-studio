import { describe, expect, it } from 'vitest';
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  defaultProjectSettings,
  parseProjectSettings,
  serializeProjectSettings,
} from './ProjectSettings.js';

describe('ProjectSettings', () => {
  it('defaultProjectSettings produces a valid round-trippable object', () => {
    const settings = defaultProjectSettings('Hello');
    expect(settings.name).toBe('Hello');
    expect(settings.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(settings.locales).toEqual(['ja', 'en']);

    const text = serializeProjectSettings(settings);
    const parsed = parseProjectSettings(text);
    expect(parsed).toEqual(settings);
  });

  it('parseProjectSettings tolerates missing optional fields with defaults', () => {
    const text = `schemaVersion: 1\nname: Minimal\n`;
    const settings = parseProjectSettings(text);
    expect(settings.name).toBe('Minimal');
    expect(settings.locales).toEqual(['ja']); // fallback
  });

  it('parseProjectSettings throws when top-level is not a mapping', () => {
    expect(() => parseProjectSettings('- foo\n- bar\n')).toThrow(/top-level must be a mapping/);
  });

  it('parseProjectSettings throws on schemaVersion newer than supported', () => {
    expect(() => parseProjectSettings(`schemaVersion: 999\nname: Future\n`)).toThrow(/newer/);
  });

  it('keeps ai object when present', () => {
    const text = `schemaVersion: 1
name: AI ready
ai:
  default: anthropic
  model: claude-opus-4-7
`;
    const settings = parseProjectSettings(text);
    expect(settings.ai?.['default']).toBe('anthropic');
    expect(settings.ai?.['model']).toBe('claude-opus-4-7');
  });

  it('keeps lastEra when present', () => {
    const text = `schemaVersion: 1
name: With era
lastEra: era.modern
`;
    const settings = parseProjectSettings(text);
    expect(settings.lastEra).toBe('era.modern');
  });
});
