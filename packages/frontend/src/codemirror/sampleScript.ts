// PoC-D の脚本エディタ動作確認用サンプル。実 fixture は Phase 1 でプロジェクトファイルから読む。
// 詳細: ../../../../Documentation/ScenarioEditor/06_scenario-layers.md §5.1
export const SAMPLE_SCRIPT = `schemaVersion: 1
sceneId: s01_opening
plot:
  title: 嵐の城門
  pov: character.tarou
  location: location.castle_gate
  cast: [character.tarou, character.gatekeeper]
  beat: opening_image
  tension: 30

script:
  - { kind: stage,    text: "夜。雨。城門。" }
  - { kind: action,   who: tarou, text: ぼろ布を被り、ふらふらと門に近づく。 }
  - { kind: line,     who: gatekeeper, emotion: suspicious, text: "誰だ。身分証を見せろ。" }
  - { kind: line,     who: tarou,      emotion: tired,      text: "……旅の者だ。", aside: 弱々しく }
  - { kind: line,     who: gatekeeper, emotion: angry,      text: "ふざけるな!" }
  - { kind: line,     who: tarou,      emotion: sad,        text: "……すまない。" }
  - { kind: choice,   prompt: 主人公はどうする?
      options:
        - { text: 名乗る,   then: opening_reveal }
        - { text: 偽る,     then: opening_disguise } }
  - { kind: sfx,      cue: thunder_far, text: 遠雷 }
  - { kind: bgm,      cue: bgm_tense, fade: 2.0 }
`;
