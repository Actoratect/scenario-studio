import { createSignal } from 'solid-js';
import { parseYaml, type YamlValue } from '@scenario-studio/core';
import { ProjectService } from './ProjectService';

// PR (ux-overhaul): Inspector の「登場した章」表示用に、scene YAML をスキャンして
// 「キャラ識別子 (slug or dev_name) → 出現シーン一覧」の index を構築する。
// 重い (毎 scene を read + parseYaml) ので lazy + cache する。プロジェクトを開き直すか
// invalidate() を呼ぶまで再計算しない。
//
// 出現判定:
//   - script[].who が slug または dev_name に一致
//   - plot.cast[] に slug または dev_name が含まれる

export interface SceneAppearance {
  chapterSlug: string;
  chapterTitle: string;
  sceneSlug: string;
  sceneTitle: string;
  /** scene 内の発言数 (line + action)。多いほどメインキャラ。 */
  count: number;
}

const [byIdentifier, setByIdentifier] = createSignal<ReadonlyMap<string, SceneAppearance[]>>(
  new Map(),
);
const [building, setBuilding] = createSignal(false);
const [builtForHandle, setBuiltForHandle] = createSignal<string | undefined>(undefined);

async function rebuild(): Promise<void> {
  const ctx = ProjectService.currentProject();
  if (!ctx) return;
  setBuilding(true);
  try {
    const map = new Map<string, SceneAppearance[]>();
    for (const ch of ctx.project.scenario.chapters) {
      for (const sc of ch.scenes) {
        const path = `Scenarios/${ch.slug}/${sc.relativePath}`;
        if (!(await ctx.adapter.exists(ctx.handle, path))) continue;
        let text: string;
        try {
          text = await ctx.adapter.read(ctx.handle, path);
        } catch {
          continue;
        }
        let parsed: YamlValue;
        try {
          parsed = parseYaml(text).value;
        } catch {
          continue;
        }
        const v = isMapping(parsed) ? parsed : {};
        const counter = new Map<string, number>();
        // plot.cast (= 編集者が宣言したキャスト)
        const plot = isMapping(v['plot']) ? (v['plot'] as { [k: string]: YamlValue }) : undefined;
        if (plot && Array.isArray(plot['cast'])) {
          for (const c of plot['cast']) {
            if (typeof c === 'string' && c.trim()) counter.set(c, counter.get(c) ?? 0);
          }
        }
        // script[].who を集計
        const script = Array.isArray(v['script']) ? v['script'] : [];
        for (const item of script) {
          if (!isMapping(item)) continue;
          const who = item['who'];
          if (typeof who === 'string' && who.trim()) {
            counter.set(who, (counter.get(who) ?? 0) + 1);
          }
        }
        for (const [identifier, count] of counter) {
          const arr = map.get(identifier) ?? [];
          arr.push({
            chapterSlug: ch.slug,
            chapterTitle: ch.title,
            sceneSlug: sc.slug,
            sceneTitle: sc.title,
            count,
          });
          map.set(identifier, arr);
        }
      }
    }
    setByIdentifier(map);
    setBuiltForHandle(ctx.handle.id);
  } finally {
    setBuilding(false);
  }
}

export const SceneAppearanceIndex = {
  byIdentifier,
  building,

  /** 強制再計算 (project 変化検知用)。 */
  async refresh(): Promise<void> {
    await rebuild();
  },

  /** プロジェクトを開いた直後 / 何か scene が変わった可能性がある時。 */
  invalidate(): void {
    setBuiltForHandle(undefined);
  },

  /** 「初回 / project 変更後だけ」build する lazy entry。 */
  ensureBuilt(): void {
    const ctx = ProjectService.currentProject();
    if (!ctx) return;
    if (builtForHandle() === ctx.handle.id) return;
    void rebuild();
  },

  /** identifier (slug or dev_name) を key に、登場シーン群を返す。 */
  appearancesFor(...identifiers: string[]): readonly SceneAppearance[] {
    const idx = byIdentifier();
    const seen = new Set<string>();
    const out: SceneAppearance[] = [];
    for (const id of identifiers) {
      if (!id) continue;
      const arr = idx.get(id);
      if (!arr) continue;
      for (const a of arr) {
        const key = `${a.chapterSlug}/${a.sceneSlug}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(a);
      }
    }
    return out;
  },
};

function isMapping(v: unknown): v is { [k: string]: YamlValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
