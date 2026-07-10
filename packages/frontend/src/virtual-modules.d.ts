// P1: vite plugin が emit する virtual module の型宣言。
// 詳細: ../vite.config.ts merosSamplePlugin

declare module 'virtual:meros-sample' {
  export type MerosSampleEntry =
    | { kind: 'text'; text: string }
    | { kind: 'binary'; base64: string };
  export interface MerosSampleManifest {
    files: { [relativePath: string]: MerosSampleEntry };
  }
  export const MEROS_SAMPLE: MerosSampleManifest;
}
