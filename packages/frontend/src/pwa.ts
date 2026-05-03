// PWA Service Worker 登録 (M8)。
// vite-plugin-pwa の `virtual:pwa-register` を経由して、SW 更新検知時に
// 「新版があります — リロードしますか?」を window.confirm で問い合わせる。
// MVP の最小 UX。Phase 2 で in-app トーストに置換。
// 詳細: ../../Documentation/ScenarioEditor/20_phase1_implementation_plan.md M8

export async function registerPwa(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // vite-plugin-pwa が virtual module で register API を提供する。
  // dev では VitePWA({ devOptions: { enabled: false } }) なので virtual module は no-op。
  try {
    const mod = (await import(/* @vite-ignore */ 'virtual:pwa-register')) as {
      registerSW: (opts: {
        onNeedRefresh?: () => void;
        onOfflineReady?: () => void;
      }) => (reload?: boolean) => Promise<void>;
    };
    const updateSW = mod.registerSW({
      onNeedRefresh: () => {
        if (
          window.confirm('Scenario Studio: 新しいバージョンがあります。今すぐ再読み込みしますか?')
        ) {
          void updateSW(true);
        }
      },
      onOfflineReady: () => {
        console.info('[Scenario Studio] PWA: ready for offline use');
      },
    });
  } catch (e) {
    // dev mode では virtual module 解決失敗。本番ビルドでのみ有効。
    if (import.meta.env.PROD) {
      console.warn('[Scenario Studio] PWA registration failed:', e);
    }
  }
}
