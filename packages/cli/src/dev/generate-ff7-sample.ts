// FF7 風サンプルプロジェクト生成スクリプト (PR-J、ドッグフード兼)。
// 既知 IP の構造を借りて Scenario Studio の各機能を一通り使えるサンプルを作る。
// 著作権配慮: キャラ名 / 場所名 は周知の固有名詞だが、台詞 / シーン構成は
// このプロジェクト固有の創作 (FF7 本編とは別物の演出デモ)。
//
// 使い方:
//   pnpm -F @scenario-studio/cli build
//   node packages/cli/dist/dev/generate-ff7-sample.js sample-projects/ff7
//
// 生成後、Browser で「既存プロジェクトを開く」→ そのフォルダを選択。

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
  createRelation,
  eraId,
  initializeProject,
  nodeId,
  FsNodeRepository,
  FsRelationsRepository,
  FsScenarioRepository,
  FsGlossaryRepository,
  FsEraRepository,
  type GlossaryTerm,
  type NodeId,
} from '@scenario-studio/core';

interface GenOptions {
  outDir: string;
  /** 既に内容が入っているフォルダを上書きする許可。CI / テスト用 false。 */
  force?: boolean;
}

export async function generateFf7Sample(opts: GenOptions): Promise<void> {
  const abs = nodePath.resolve(opts.outDir);
  await mkdir(abs, { recursive: true });

  const adapter = new NodeFileSystemAdapter();
  const handle = adapter.register(abs, nodePath.basename(abs));
  await initializeProject(adapter, handle, { name: 'FF7 サンプル — メテオへの旅' });

  const templates = new TemplateRegistry();
  const nodeRepo = new FsNodeRepository(adapter, handle, templates);
  const scenarioRepo = new FsScenarioRepository(adapter, handle);
  const glossaryRepo = new FsGlossaryRepository(adapter, handle);
  const relationsRepo = new FsRelationsRepository(adapter, handle);
  const eraRepo = new FsEraRepository(adapter, handle);

  // === Eras ===
  // 階層: 物語世界 → 各時期。Inspector の Era スライダで切替できる。
  await eraRepo.save({
    id: eraId('era.world'),
    label: '物語世界',
  });
  await eraRepo.save({
    id: eraId('era.pre_crisis'),
    label: 'ニブルヘイム事件以前',
    parent: eraId('era.world'),
    yearRange: [-5, -1],
  });
  await eraRepo.save({
    id: eraId('era.crisis'),
    label: 'ニブルヘイム事件',
    parent: eraId('era.world'),
    yearRange: [0, 0],
  });
  await eraRepo.save({
    id: eraId('era.present'),
    label: '本編 (メテオ襲来期)',
    parent: eraId('era.world'),
    yearRange: [5, 5],
  });

  // === Factions ===
  const factions = await Promise.all([
    saveFaction(nodeRepo, templates, {
      slug: 'shinra',
      display: '神羅カンパニー',
      reading: 'しんら',
      dev: 'Shinra',
      founded: 1950,
      desc: '魔晄エネルギー独占で世界を支配する巨大企業。本社はミッドガル神羅ビル。',
    }),
    saveFaction(nodeRepo, templates, {
      slug: 'avalanche',
      display: 'アバランチ',
      reading: 'あばらんち',
      dev: 'Avalanche',
      founded: 5,
      desc: '魔晄エネルギーへの反対を掲げる反神羅組織。バレットを中心としたミッドガル支部。',
    }),
    saveFaction(nodeRepo, templates, {
      slug: 'soldier',
      display: 'ソルジャー',
      reading: 'そるじゃー',
      dev: 'Soldier',
      founded: 1980,
      desc: '神羅の精鋭部隊。魔晄注入で身体能力を強化された兵士から成る。',
    }),
    saveFaction(nodeRepo, templates, {
      slug: 'cetra',
      display: '古代種',
      reading: 'せとら',
      dev: 'Cetra',
      founded: -2000,
      desc: '星と語り、ライフストリームを導く太古の民。エアリスは最後の生き残り。',
    }),
    saveFaction(nodeRepo, templates, {
      slug: 'turks',
      display: 'タークス',
      reading: 'たーくす',
      dev: 'Turks',
      founded: 1990,
      desc: '神羅総務部直属の特殊工作部隊。',
    }),
  ]);
  const fId = (slug: string): NodeId => nodeId(factions.find((f) => f.slug === slug)!.id);

  // === Characters ===
  const cloud = await nodeRepo
    .save(
      createNode(templates, {
        templateId: CHARACTER_TEMPLATE.id,
        slug: 'cloud',
        fields: {
          display_name: 'クラウド・ストライフ',
          reading: 'くらうど・すとらいふ',
          dev_name: 'Cloud',
          birth_year: 0,
          gender: 'male',
          height: 173,
          appearance: '逆立った金髪、青い瞳。背中に巨大なバスターソード。',
          personality: 'クールに振る舞うが内面は脆い。記憶の改竄に苦しむ。',
          first_person: '俺',
          tone: 'rough',
          faction: fId('soldier'),
        },
      }),
    )
    .then((_) => loadBack(nodeRepo, 'cloud', CHARACTER_TEMPLATE.id));

  const tifa = await saveChar(nodeRepo, templates, {
    slug: 'tifa',
    display: 'ティファ・ロックハート',
    reading: 'てぃふぁ・ろっくはーと',
    dev: 'Tifa',
    birth: 0,
    gender: 'female',
    height: 167,
    appearance: '黒髪をリボンで束ねた長身。革のグローブと黒のミニスカート。',
    personality: '優しく強い拳闘家。クラウドの幼馴染で、彼の記憶の鍵を握る。',
    first_person: '私',
    tone: 'casual',
    factionSlug: 'avalanche',
    factions,
  });

  const aerith = await saveChar(nodeRepo, templates, {
    slug: 'aerith',
    display: 'エアリス・ゲインズブール',
    reading: 'えありす・げいんずぶーる',
    dev: 'Aerith',
    birth: -2,
    gender: 'female',
    height: 163,
    appearance: 'ピンクのリボンで髪を結った優しい瞳の少女。古代種最後の生き残り。',
    personality: '太陽のように朗らかで芯が強い。星の声を聞く力を持つ。',
    first_person: 'わたし',
    tone: 'casual',
    factionSlug: 'cetra',
    factions,
  });

  const barret = await saveChar(nodeRepo, templates, {
    slug: 'barret',
    display: 'バレット・ウォーレス',
    reading: 'ばれっと・うぉーれす',
    dev: 'Barret',
    birth: -10,
    gender: 'male',
    height: 198,
    appearance: '右腕にガトリング銃を装着した大柄な戦士。サングラス。',
    personality: '熱血漢で口が悪いが情に厚い。アバランチ ミッドガル支部リーダー。',
    first_person: '俺様',
    tone: 'rough',
    factionSlug: 'avalanche',
    factions,
  });

  const sephiroth = await saveChar(nodeRepo, templates, {
    slug: 'sephiroth',
    display: 'セフィロス',
    reading: 'せふぃろす',
    dev: 'Sephiroth',
    birth: -5,
    gender: 'male',
    height: 187,
    appearance: '銀色の長髪、緑の瞳。漆黒のコートに刀「正宗」。',
    personality: 'かつての伝説のソルジャー。自身の出自を知り星への憎しみに堕ちた。',
    first_person: '私',
    tone: 'formal',
    factionSlug: 'soldier',
    factions,
  });

  const zack = await saveChar(nodeRepo, templates, {
    slug: 'zack',
    display: 'ザックス・フェア',
    reading: 'ざっくす・ふぇあ',
    dev: 'Zack',
    birth: -3,
    gender: 'male',
    height: 185,
    appearance: '逆立った黒髪、明るい青の瞳。バスターソードを背負う。',
    personality: '陽気で正義感の強いソルジャー1st。クラウドの親友。',
    first_person: '俺',
    tone: 'casual',
    factionSlug: 'soldier',
    factions,
  });

  const vincent = await saveChar(nodeRepo, templates, {
    slug: 'vincent',
    display: 'ヴィンセント・ヴァレンタイン',
    reading: 'う゛ぃんせんと・う゛ぁれんたいん',
    dev: 'Vincent',
    birth: -30,
    gender: 'male',
    height: 184,
    appearance: '紅いマント、左腕の金属義手。元タークスの罪を背負う男。',
    personality: '寡黙で内省的。自らを呪いと呼ぶが、仲間のためなら戦う。',
    first_person: '俺',
    tone: 'formal',
    factionSlug: 'turks',
    factions,
  });

  const rufus = await saveChar(nodeRepo, templates, {
    slug: 'rufus',
    display: 'ルーファウス神羅',
    reading: 'るーふぁうす・しんら',
    dev: 'Rufus',
    birth: -2,
    gender: 'male',
    height: 185,
    appearance: '若き神羅次期社長。白いコートとショットガン。',
    personality: '父より冷酷で合理的な独裁主義者。',
    first_person: '私',
    tone: 'formal',
    factionSlug: 'shinra',
    factions,
  });

  // === Locations ===
  const midgar = await saveLoc(nodeRepo, templates, {
    slug: 'midgar',
    display: 'ミッドガル',
    reading: 'みっどがる',
    region: '東部大陸',
    climate: 'temperate',
    population: 5000000,
    desc: '神羅が築いた巨大都市。プレートの上に上層街、下にスラム。',
  });
  const _midgarSlum8 = await saveLoc(nodeRepo, templates, {
    slug: 'midgar_slum_8',
    display: 'ミッドガル八番街',
    reading: 'みっどがる はちばんがい',
    region: 'ミッドガル下層',
    climate: 'temperate',
    desc: '本作冒頭の魔晄炉爆破から物語が始まる場所。',
    parent: midgar.id,
  });
  const _nibelheim = await saveLoc(nodeRepo, templates, {
    slug: 'nibelheim',
    display: 'ニブルヘイム',
    reading: 'にぶるへいむ',
    region: '西部大陸',
    climate: 'cold',
    population: 200,
    desc: 'クラウドとティファの故郷。神羅の魔晄炉が山頂にある寒村。',
  });
  const _cosmoCanyon = await saveLoc(nodeRepo, templates, {
    slug: 'cosmo_canyon',
    display: 'コスモキャニオン',
    reading: 'こすもきゃにおん',
    region: '西部大陸',
    climate: 'arid',
    desc: '星の知恵を集める学究の村。長老ブーゲンハーゲンが暮らす。',
  });
  const _ancientCapital = await saveLoc(nodeRepo, templates, {
    slug: 'ancient_capital',
    display: '古代種の都',
    reading: 'こだいしゅのみやこ',
    region: '北の大空洞',
    climate: 'magical',
    desc: '失われた古代種の都市。ホーリーマテリアの祈りの場所。',
  });

  // === Items ===
  await saveItem(nodeRepo, templates, {
    slug: 'buster_sword',
    display: 'バスターソード',
    reading: 'ばすたーそーど',
    category: 'weapon',
    rarity: 'unique',
    desc: 'ザックスから受け継がれたクラウドの大剣。記憶を運ぶ刃。',
    ownerId: cloud.id,
  });
  await saveItem(nodeRepo, templates, {
    slug: 'masamune',
    display: '正宗',
    reading: 'まさむね',
    category: 'weapon',
    rarity: 'unique',
    desc: 'セフィロスの長刀。常人には扱えぬ常識外れの長さ。',
    ownerId: sephiroth.id,
  });
  await saveItem(nodeRepo, templates, {
    slug: 'holy_materia',
    display: 'ホーリーマテリア',
    reading: 'ほーりーまてりあ',
    category: 'key_item',
    rarity: 'legendary',
    desc: 'メテオに対抗するための白マテリア。古代種の祈りで起動する。',
    ownerId: aerith.id,
  });
  await saveItem(nodeRepo, templates, {
    slug: 'phoenix_down',
    display: 'フェニックスの尾',
    reading: 'ふぇにっくすのお',
    category: 'consumable',
    rarity: 'common',
    desc: '戦闘不能を回復する不死鳥の羽。冒険の必需品。',
  });

  // === Faction leaders (再書込で leader を後付け) ===
  await rewriteWithLeader(nodeRepo, templates, factions, 'shinra', rufus.id);
  await rewriteWithLeader(nodeRepo, templates, factions, 'avalanche', barret.id);
  await rewriteWithLeader(nodeRepo, templates, factions, 'soldier', sephiroth.id);
  await rewriteWithLeader(nodeRepo, templates, factions, 'cetra', aerith.id);

  // === Glossary ===
  const glossary: GlossaryTerm[] = [
    {
      term: 'マテリア',
      aliases: ['Materia'],
      forbidden: ['まてりあ'],
      description: '魔法を発動させる結晶。武器・防具に装着して使う。',
    },
    {
      term: 'ライフストリーム',
      aliases: ['Lifestream', '星の生命'],
      forbidden: [],
      description: '星全体を巡る生命エネルギーの流れ。死者の魂はここに還る。',
    },
    {
      term: '魔晄',
      aliases: ['Mako'],
      forbidden: ['まこう'],
      description: '神羅が抽出するライフストリームの濃縮形。電力 / 燃料の主流。',
    },
    {
      term: 'ジェノバ',
      aliases: ['Jenova', '災厄'],
      forbidden: [],
      description: '宇宙から飛来した古代の怪物。古代種を滅ぼした災厄。',
    },
    {
      term: 'メテオ',
      aliases: ['Meteor'],
      forbidden: [],
      description: '究極黒魔法。星に巨大な隕石を落とし破壊する。',
    },
  ];
  await glossaryRepo.save(glossary);

  // === Relations (Shift+drag を介さず一気に作成) ===
  const relations = [
    createRelation({
      source: nodeId(cloud.id),
      target: nodeId(tifa.id),
      type: 'friend',
      label: '幼馴染',
    }),
    createRelation({
      source: nodeId(cloud.id),
      target: nodeId(zack.id),
      type: 'friend',
      label: '親友・恩人',
    }),
    createRelation({
      source: nodeId(cloud.id),
      target: nodeId(sephiroth.id),
      type: 'enemy',
      label: '宿敵',
    }),
    createRelation({ source: nodeId(cloud.id), target: nodeId(aerith.id), type: 'friend' }),
    createRelation({
      source: nodeId(aerith.id),
      target: nodeId(sephiroth.id),
      type: 'enemy',
      label: '運命の相手',
    }),
    createRelation({
      source: nodeId(zack.id),
      target: nodeId(sephiroth.id),
      type: 'friend',
      label: '元戦友',
    }),
    createRelation({
      source: nodeId(barret.id),
      target: nodeId(tifa.id),
      type: 'friend',
      label: '同志',
    }),
    createRelation({
      source: nodeId(vincent.id),
      target: nodeId(sephiroth.id),
      type: 'parent',
      label: '生物学的な…',
    }),
    createRelation({ source: nodeId(rufus.id), target: nodeId(barret.id), type: 'enemy' }),
    createRelation({ source: nodeId(rufus.id), target: nodeId(cloud.id), type: 'enemy' }),
  ];
  await relationsRepo.save(relations);

  // === Scenarios (chapter + scene) ===
  // ch01: ミッドガル八番街 — 冒頭エピソード (魔晄炉爆破)
  await scenarioRepo.addChapter({
    slug: 'ch01_midgar_bombing',
    title: '第 1 章: 八番魔晄炉',
    summary: 'AVALANCHE による魔晄炉爆破。元ソルジャー クラウドが傭兵として参加する。',
  });
  await writeScene(
    adapter,
    handle,
    'ch01_midgar_bombing',
    's01_train_arrival',
    '列車到着',
    SCRIPT_S01,
  );
  await writeScene(
    adapter,
    handle,
    'ch01_midgar_bombing',
    's02_reactor_infiltration',
    '魔晄炉潜入',
    SCRIPT_S02,
  );
  await writeScene(adapter, handle, 'ch01_midgar_bombing', 's03_escape', '脱出', SCRIPT_S03);

  // ch02: ニブルヘイム回想
  await scenarioRepo.addChapter({
    slug: 'ch02_nibelheim_memory',
    title: '第 2 章: ニブルヘイム回想',
    summary: '5 年前。クラウドとセフィロスがニブルヘイムを訪れた事件の記憶。',
  });
  await writeScene(
    adapter,
    handle,
    'ch02_nibelheim_memory',
    's01_arrival',
    '故郷へ',
    SCRIPT_NIB_S01,
  );
  await writeScene(
    adapter,
    handle,
    'ch02_nibelheim_memory',
    's02_reactor',
    '魔晄炉の真実',
    SCRIPT_NIB_S02,
  );

  // _project.yaml の chapter 順を保存
  await scenarioRepo.saveProjectIndex([
    { slug: 'ch01_midgar_bombing' },
    { slug: 'ch02_nibelheim_memory' },
  ]);

  // プロジェクト synopsis
  const synopsis = `# FF7 サンプル — メテオへの旅

これは Scenario Studio の機能を一通り試すための **デモプロジェクト** です。

## 主要キャラクター

- **クラウド** — 元ソルジャーを名乗る傭兵。
- **ティファ** — クラウドの幼馴染。AVALANCHE のメンバー。
- **エアリス** — 古代種最後の生き残り。
- **バレット** — AVALANCHE リーダー。
- **セフィロス** — 伝説の元ソルジャー、宿敵。

## 章構成

1. **第 1 章: 八番魔晄炉** — ミッドガル爆破ミッション
2. **第 2 章: ニブルヘイム回想** — 5 年前の事件

## 試してほしい機能

- Outline で章 / シーンを **ドラッグで並べ替え**
- Graph で **Shift+drag** して新規関係作成
- **Cmd+K** で「セフィロス」検索 → ジャンプ
- Inspector で性格を編集 → 自動保存
- **Era** スライダで時系列を切替

著作権: キャラ名・場所名は固有名詞だが、台詞・シーン構成は本プロジェクト固有の創作。
`;
  await scenarioRepo.saveSynopsis(synopsis);
}

// ===== ヘルパー =====

interface CharInput {
  slug: string;
  display: string;
  reading: string;
  dev: string;
  birth: number;
  gender: string;
  height: number;
  appearance: string;
  personality: string;
  first_person: string;
  tone: string;
  factionSlug: string;
  factions: ReadonlyArray<{ slug: string; id: string }>;
}

async function saveChar(
  repo: FsNodeRepository,
  templates: TemplateRegistry,
  c: CharInput,
): ReturnType<typeof loadBack> {
  const fac = c.factions.find((f) => f.slug === c.factionSlug);
  await repo.save(
    createNode(templates, {
      templateId: CHARACTER_TEMPLATE.id,
      slug: c.slug,
      fields: {
        display_name: c.display,
        reading: c.reading,
        dev_name: c.dev,
        birth_year: c.birth,
        gender: c.gender,
        height: c.height,
        appearance: c.appearance,
        personality: c.personality,
        first_person: c.first_person,
        tone: c.tone,
        ...(fac ? { faction: fac.id } : {}),
      },
    }),
  );
  return loadBack(repo, c.slug, CHARACTER_TEMPLATE.id);
}

interface FactionInput {
  slug: string;
  display: string;
  reading: string;
  dev: string;
  founded: number;
  desc: string;
}

async function saveFaction(
  repo: FsNodeRepository,
  templates: TemplateRegistry,
  f: FactionInput,
): Promise<{ slug: string; id: string }> {
  await repo.save(
    createNode(templates, {
      templateId: FACTION_TEMPLATE.id,
      slug: f.slug,
      fields: {
        display_name: f.display,
        reading: f.reading,
        dev_name: f.dev,
        founded_year: f.founded,
        description: f.desc,
        is_active: true,
      },
    }),
  );
  const back = await loadBack(repo, f.slug, FACTION_TEMPLATE.id);
  return { slug: f.slug, id: back.id };
}

async function rewriteWithLeader(
  repo: FsNodeRepository,
  templates: TemplateRegistry,
  factions: ReadonlyArray<{ slug: string; id: string }>,
  factionSlug: string,
  leaderId: string,
): Promise<void> {
  const fac = factions.find((f) => f.slug === factionSlug);
  if (!fac) return;
  const all = await repo.loadAll();
  const node = all.get(fac.id as never);
  if (!node) return;
  await repo.save({
    ...node,
    fields: { ...node.fields, leader: leaderId },
  });
  void templates;
}

interface LocInput {
  slug: string;
  display: string;
  reading: string;
  region: string;
  climate: string;
  population?: number;
  desc: string;
  parent?: string;
}

async function saveLoc(
  repo: FsNodeRepository,
  templates: TemplateRegistry,
  l: LocInput,
): ReturnType<typeof loadBack> {
  const fields: { [k: string]: import('@scenario-studio/core').YamlValue } = {
    display_name: l.display,
    reading: l.reading,
    region: l.region,
    climate: l.climate,
    description: l.desc,
  };
  if (l.population !== undefined) fields['population'] = l.population;
  if (l.parent !== undefined) fields['parent_location'] = l.parent;
  await repo.save(
    createNode(templates, {
      templateId: LOCATION_TEMPLATE.id,
      slug: l.slug,
      fields,
    }),
  );
  return loadBack(repo, l.slug, LOCATION_TEMPLATE.id);
}

interface ItemInput {
  slug: string;
  display: string;
  reading: string;
  category: string;
  rarity: string;
  desc: string;
  ownerId?: string;
}

async function saveItem(
  repo: FsNodeRepository,
  templates: TemplateRegistry,
  i: ItemInput,
): Promise<void> {
  const fields: { [k: string]: import('@scenario-studio/core').YamlValue } = {
    display_name: i.display,
    reading: i.reading,
    category: i.category,
    rarity: i.rarity,
    description: i.desc,
  };
  if (i.ownerId !== undefined) fields['owner'] = i.ownerId;
  await repo.save(
    createNode(templates, {
      templateId: ITEM_TEMPLATE.id,
      slug: i.slug,
      fields,
    }),
  );
}

async function loadBack(
  repo: FsNodeRepository,
  slug: string,
  templateId: string,
): Promise<{ id: string; slug: string; templateId: string }> {
  const all = await repo.loadAll();
  for (const n of all.values()) {
    if (n.slug === slug && n.templateId === templateId) {
      return { id: n.id, slug: n.slug, templateId: n.templateId };
    }
  }
  throw new Error(`loadBack: not found ${templateId}/${slug}`);
}

async function writeScene(
  adapter: NodeFileSystemAdapter,
  handle: import('@scenario-studio/core').ProjectHandle,
  chapterSlug: string,
  sceneSlug: string,
  title: string,
  scriptYaml: string,
): Promise<void> {
  const path = `Scenarios/${chapterSlug}/${sceneSlug}.scn.yaml`;
  const yaml = `schemaVersion: 1
sceneId: scene.${sceneSlug}
plot:
  title: ${JSON.stringify(title)}
  cast: []

${scriptYaml}
`;
  await adapter.write(handle, path, yaml);
  // _scene_index に追記
  const indexPath = `Scenarios/${chapterSlug}/_scene_index.yaml`;
  let order: string[] = [];
  if (await adapter.exists(handle, indexPath)) {
    const text = await adapter.read(handle, indexPath);
    const m = text.match(/scenes:\s*\n((?:\s*-\s*\S+\n?)*)/);
    if (m && m[1]) {
      order = m[1]
        .split(/\n/)
        .map((l) => l.replace(/^\s*-\s*/, '').trim())
        .filter((s) => s !== '');
    }
  }
  if (!order.includes(sceneSlug)) order.push(sceneSlug);
  const indexYaml = `schemaVersion: 1
kind: scene_index
scenes:
${order.map((s) => `  - ${s}`).join('\n')}
`;
  await adapter.write(handle, indexPath, indexYaml);
}

// ===== Scripts =====

const SCRIPT_S01 = `script:
  - { kind: stage, text: "深夜のミッドガル八番街駅。蒸気と魔晄の匂い。" }
  - { kind: line, who: barret, emotion: angry, text: "おい新入り! ボサっとしてる暇はねえぞ!" }
  - { kind: line, who: cloud, emotion: calm, text: "...わかってる。" }
  - { kind: aside, text: "傭兵。それが今の俺の肩書きだ。" }
  - { kind: line, who: barret, emotion: angry, text: "金もらってんだろうが。さっさとついて来な。" }
  - { kind: stage, text: "改札を抜け、二人は魔晄炉へ向かう。" }
  - { kind: sfx, name: "ambient_steam" }`;

const SCRIPT_S02 = `script:
  - { kind: stage, text: "八番魔晄炉、奥深く。轟音と熱気。" }
  - { kind: line, who: barret, emotion: angry, text: "ここに爆弾を仕掛けりゃ、この魔晄炉も終わりだ。" }
  - { kind: line, who: cloud, emotion: calm, text: "...本当に必要なのか?" }
  - { kind: line, who: barret, emotion: suspicious, text: "あ? 神羅の手先か、てめえ?" }
  - { kind: line, who: cloud, emotion: tired, text: "ただ確認しただけだ。命令通りやる。" }
  - { kind: aside, text: "(この爆破で何人が死ぬのか、考えても仕方ない。)" }
  - { kind: bgm, cue: bgm_tense, fade: 1.0 }
  - { kind: choice, prompt: "爆弾を起爆するか?", options: [{ text: "起爆する", then: scene.s03_escape }, { text: "ためらう", then: scene.s03_hesitate }] }`;

const SCRIPT_S03 = `script:
  - { kind: stage, text: "炎と崩壊。警報。" }
  - { kind: line, who: barret, emotion: angry, text: "走れ! 神羅の兵士が来やがる!" }
  - { kind: line, who: cloud, emotion: calm, text: "..." }
  - { kind: aside, text: "(ティファに会わなければ。約束だったから。)" }
  - { kind: sfx, name: "explosion" }
  - { kind: bgm, cue: bgm_chase, fade: 0.5 }`;

const SCRIPT_NIB_S01 = `script:
  - { kind: stage, text: "5 年前。寒村ニブルヘイム。山の魔晄炉点検任務。" }
  - { kind: line, who: sephiroth, emotion: calm, text: "...久しぶりの故郷というわけか、君の。" }
  - { kind: line, who: cloud, emotion: embarrassed, text: "は、はい。母は俺がソルジャーになったことを知らないんで…" }
  - { kind: line, who: sephiroth, emotion: calm, text: "私には故郷がない。母の名はジェノバ — そう聞かされて育った。" }
  - { kind: aside, text: "(セフィロスさんの目が、暗い。)" }`;

const SCRIPT_NIB_S02 = `script:
  - { kind: stage, text: "ニブル山の頂、神羅マ晄炉。秘密の研究室。" }
  - { kind: line, who: sephiroth, emotion: angry, text: "これは…ジェノバ・プロジェクト…私は実験動物か?" }
  - { kind: line, who: cloud, emotion: surprised, text: "セフィロスさん、落ち着いてください!" }
  - { kind: line, who: sephiroth, emotion: angry, text: "落ち着いて? 私の母は古代種だった、私は…" }
  - { kind: aside, text: "(その瞬間、伝説のソルジャーは何かに堕ちた。)" }
  - { kind: bgm, cue: bgm_one_winged_angel, fade: 2.0 }
  - { kind: stage, text: "ニブルヘイムは炎に包まれた。" }`;

// ===== CLI 起動 =====

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
    process.stderr.write('Usage: node generate-ff7-sample.js <outDir>\n');
    process.exit(2);
  }
  generateFf7Sample({ outDir }).then(
    () => {
      process.stdout.write(`Generated FF7 sample at: ${outDir}\n`);
    },
    (e) => {
      process.stderr.write(`Failed: ${e instanceof Error ? e.stack : String(e)}\n`);
      process.exit(1);
    },
  );
}
