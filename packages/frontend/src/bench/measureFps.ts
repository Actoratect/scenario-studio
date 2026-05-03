// rAF ベースの FPS 計測。動作中に kick(callback) を毎フレーム呼んで負荷をかけ、
// avg / min / p1 (最も遅い 1% フレーム時間) を返す。
// 詳細: ../../../../Documentation/ScenarioEditor/04_graph-editor.md, 13_roadmap.md PoC-B

export interface FpsResult {
  /** 計測した総フレーム数。 */
  frames: number;
  /** 計測時間 (ms)。 */
  durationMs: number;
  /** 平均 FPS (frames / duration)。 */
  avgFps: number;
  /** 計測した中で最も長いフレーム時間 (ms)。 */
  maxFrameMs: number;
  /** 上位 1% に長いフレーム時間 (ms) — タイル抜けの目安。 */
  p99FrameMs: number;
}

export interface MeasureFpsOptions {
  /** 各フレームの先頭で呼ばれる。負荷生成 (camera 動かす等) はここで。 */
  onFrame: (frameIndex: number) => void;
  /** 何 ms 走らせるか。デフォルト 3000。 */
  durationMs?: number;
}

export async function measureFps(options: MeasureFpsOptions): Promise<FpsResult> {
  const duration = options.durationMs ?? 3000;
  const frameTimes: number[] = [];
  let prevTs = performance.now();
  const start = prevTs;

  await new Promise<void>((resolve) => {
    let frame = 0;
    const tick = (ts: number): void => {
      frameTimes.push(ts - prevTs);
      prevTs = ts;
      try {
        options.onFrame(frame);
      } catch {
        // 負荷生成側のエラーは bench を止めない (一発失敗の影響を最小化)
      }
      frame++;
      if (ts - start < duration) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });

  const totalDuration = performance.now() - start;
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const p99Index = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99)));
  return {
    frames: frameTimes.length,
    durationMs: totalDuration,
    avgFps: (frameTimes.length / totalDuration) * 1000,
    maxFrameMs: sorted[sorted.length - 1] ?? 0,
    p99FrameMs: sorted[p99Index] ?? 0,
  };
}
