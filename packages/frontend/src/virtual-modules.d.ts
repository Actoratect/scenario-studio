// PR-AE: vite plugin が emit する virtual module の型宣言。
// 詳細: ../vite.config.ts ff7SamplePlugin

declare module 'virtual:ff7-sample' {
  export type FF7SampleEntry = { kind: 'text'; text: string } | { kind: 'binary'; base64: string };
  export interface FF7SampleManifest {
    files: { [relativePath: string]: FF7SampleEntry };
  }
  export const FF7_SAMPLE: FF7SampleManifest;
}
