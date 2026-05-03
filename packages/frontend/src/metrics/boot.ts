// 起動時間計測 (M8)。
// MVP 受け入れ基準: PWA 既開時 2 秒、初回 5 秒。
// performance.now() ベース、performance.mark で navigation start からの経過を記録、
// localStorage に履歴を残してドッグフード時に確認可能に。
// 詳細: ../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

export const BOOT_MARK_DOM_READY = 'scenario-studio:dom-ready';
export const BOOT_MARK_PROJECT_OPEN = 'scenario-studio:project-open';

const STORAGE_KEY = 'scenario-studio:boot-metrics';
const MAX_SAMPLES = 20;

interface BootSample {
  mark: string;
  ms: number;
  ts: number;
}

export function measureBootMark(name: string): number | undefined {
  if (typeof performance === 'undefined') return undefined;
  const ms = performance.now();
  try {
    performance.mark(name);
  } catch {
    // mark 名重複等は無視
  }
  recordSample({ mark: name, ms, ts: Date.now() });
  console.info(`[boot] ${name}: ${ms.toFixed(1)}ms`);
  return ms;
}

export function getBootSamples(): readonly BootSample[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBootSample);
  } catch {
    return [];
  }
}

function recordSample(sample: BootSample): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const all = [...getBootSamples(), sample];
    const trimmed = all.slice(-MAX_SAMPLES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota / private mode 等は無視
  }
}

function isBootSample(v: unknown): v is BootSample {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as BootSample).mark === 'string' &&
    typeof (v as BootSample).ms === 'number' &&
    typeof (v as BootSample).ts === 'number'
  );
}
