// ドッグフード用テストプロジェクト生成スクリプト (M8)。
// 50 ノード / 30 シーン / 5,000 行の脚本を持つプロジェクトを実 FS に書き出す。
//
// 使い方:
//   pnpm -F @scenario-studio/cli build
//   node packages/cli/dist/dev/generate-dogfood.js ./out-dogfood
//
// CI で smoke として叩くのではなく、ライターが手動でドッグフードする時に使う。
// 詳細: ../../../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

import { mkdir } from 'node:fs/promises';
import * as nodePath from 'node:path';
import { NodeFileSystemAdapter } from '@scenario-studio/adapter-node';
import {
  CHARACTER_TEMPLATE,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  LOCATION_TEMPLATE,
  TemplateRegistry,
  createNode,
  initializeProject,
  FsNodeRepository,
  FsScenarioRepository,
} from '@scenario-studio/core';

interface GenOptions {
  outDir: string;
  characters?: number;
  locations?: number;
  items?: number;
  factions?: number;
  chapters?: number;
  scenesPerChapter?: number;
  linesPerScene?: number;
}

const DEFAULT: Required<GenOptions> = {
  outDir: '',
  characters: 30,
  locations: 10,
  items: 5,
  factions: 5, // total 50 nodes
  chapters: 6,
  scenesPerChapter: 5, // total 30 scenes
  linesPerScene: 167, // 30 * 167 ≈ 5,010 lines
};

export async function generateDogfoodProject(opts: GenOptions): Promise<void> {
  const o = { ...DEFAULT, ...opts };
  if (!o.outDir) throw new Error('outDir is required');

  const abs = nodePath.resolve(o.outDir);
  await mkdir(abs, { recursive: true });

  const adapter = new NodeFileSystemAdapter();
  const handle = adapter.register(abs, nodePath.basename(abs));
  await initializeProject(adapter, handle, { name: 'Dogfood Project' });

  const templates = new TemplateRegistry();
  const nodeRepo = new FsNodeRepository(adapter, handle, templates);
  const scenarioRepo = new FsScenarioRepository(adapter, handle);

  // === Nodes ===
  for (let i = 0; i < o.characters; i++) {
    const slug = `char_${pad(i)}`;
    await nodeRepo.save(
      createNode(templates, {
        templateId: CHARACTER_TEMPLATE.id,
        slug,
        fields: {
          display_name: `キャラ${i}`,
          reading: `きゃら${i}`,
          dev_name: `Character${i}`,
          birth_year: 1990 + i,
          gender: i % 2 === 0 ? 'female' : 'male',
        },
      }),
    );
  }
  for (let i = 0; i < o.locations; i++) {
    await nodeRepo.save(
      createNode(templates, {
        templateId: LOCATION_TEMPLATE.id,
        slug: `loc_${pad(i)}`,
        fields: {
          display_name: `場所${i}`,
          region: 'East Region',
          climate: 'temperate',
        },
      }),
    );
  }
  for (let i = 0; i < o.items; i++) {
    await nodeRepo.save(
      createNode(templates, {
        templateId: ITEM_TEMPLATE.id,
        slug: `item_${pad(i)}`,
        fields: {
          display_name: `アイテム${i}`,
          category: 'weapon',
          rarity: 'common',
        },
      }),
    );
  }
  for (let i = 0; i < o.factions; i++) {
    await nodeRepo.save(
      createNode(templates, {
        templateId: FACTION_TEMPLATE.id,
        slug: `faction_${pad(i)}`,
        fields: {
          display_name: `勢力${i}`,
          founded_year: 1700 + i * 10,
        },
      }),
    );
  }

  // === Chapters + Scenes + Script ===
  const chapterSlugs: string[] = [];
  for (let c = 0; c < o.chapters; c++) {
    const chSlug = `ch${pad(c)}_${chapterTitleSlug(c)}`;
    chapterSlugs.push(chSlug);
    await scenarioRepo.addChapter({
      slug: chSlug,
      title: `第${c + 1}章: ${chapterTitleJa(c)}`,
      summary: `${c + 1}章の要約 (M8 dogfood fixture)。`,
    });
    for (let s = 0; s < o.scenesPerChapter; s++) {
      const scSlug = `s${pad(s)}_scene`;
      const script = buildScript(o.linesPerScene, c, s);
      await adapter.write(handle, `Scenarios/${chSlug}/${scSlug}.scn.yaml`, script);
    }
  }
  await scenarioRepo.saveProjectIndex(chapterSlugs.map((slug) => ({ slug })));
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

const TITLES = ['出会い', '別離', '帰郷', '戦', '和解', '結末'];
function chapterTitleJa(c: number): string {
  return TITLES[c % TITLES.length]!;
}
function chapterTitleSlug(c: number): string {
  const slugs = ['meeting', 'parting', 'return', 'battle', 'truce', 'finale'];
  return slugs[c % slugs.length]!;
}

function buildScript(lines: number, chapterIndex: number, sceneIndex: number): string {
  const head = `schemaVersion: 1
sceneId: scene.ch${pad(chapterIndex)}_s${pad(sceneIndex)}
plot:
  title: ch${pad(chapterIndex)}-s${pad(sceneIndex)}
  pov: character.char_00
  cast: []

script:
`;
  const out: string[] = [];
  for (let i = 0; i < lines; i++) {
    if (i % 5 === 0) {
      out.push(`  - { kind: stage, text: "ステージ ${chapterIndex}-${sceneIndex}-${i}" }`);
    } else if (i % 5 === 1) {
      out.push(`  - { who: char_${pad(i % 30)}, text: "セリフ ${i}: 何か言う。" }`);
    } else if (i % 5 === 2) {
      out.push(`  - { who: char_${pad((i + 1) % 30)}, text: "返答 ${i}: 何か返す。" }`);
    } else if (i % 5 === 3) {
      out.push(`  - { kind: aside, text: "心の声 ${i}" }`);
    } else {
      out.push(`  - { kind: sfx, name: "ambient_${i % 7}" }`);
    }
  }
  return head + out.join('\n') + '\n';
}

// CLI 起動: node generate-dogfood.js <outDir>
const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  const outDir = process.argv[2];
  if (!outDir) {
    process.stderr.write('Usage: node generate-dogfood.js <outDir>\n');
    process.exit(2);
  }
  generateDogfoodProject({ outDir }).then(
    () => {
      process.stdout.write(`Generated dogfood project at: ${outDir}\n`);
    },
    (e) => {
      process.stderr.write(`Failed: ${e instanceof Error ? e.stack : String(e)}\n`);
      process.exit(1);
    },
  );
}
