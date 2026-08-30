export const PERFORMANCE_BAR_WINDOW_MS = 500;
export const PERFORMANCE_BAR_DELAY_WARN_MS = 33;
export const PERFORMANCE_BAR_DELAY_HOT_MS = 50;
export const PERFORMANCE_BAR_JANK_WARN_RATIO = 0.1;
export const PERFORMANCE_BAR_SPARKLINE_SAMPLES = 60;
export const PERFORMANCE_BAR_SPARKLINE_WIDTH = 88;
export const PERFORMANCE_BAR_SPARKLINE_HEIGHT = 22;
export const PERFORMANCE_BAR_SPARKLINE_MIN_SPAN = 20;
export const PERFORMANCE_BAR_FPS_WARN = 50;
export const PERFORMANCE_BAR_FPS_BAD = 30;
export const PERFORMANCE_BAR_HISTORY_MS = 2_000;
export const PERFORMANCE_BAR_NUMBER_INTERVAL_MS = 80;

export type PerformanceBarTone = "good" | "warn" | "bad";

export interface PerformanceBarSnapshot {
  readonly fps: number;
  readonly delayMs: number;
  readonly jankRatio: number;
  readonly heapBytes: number | null;
  readonly sparklineFps: ReadonlyArray<number>;
}

export interface PerformanceBarSparklineRange {
  readonly min: number;
  readonly max: number;
}

export interface PerformanceBarSparklinePoint {
  readonly x: number;
  readonly y: number;
}

export function derivePerformanceBarSnapshot(input: {
  readonly frameTimes: ReadonlyArray<number>;
  readonly now: number;
  readonly heapBytes?: number | null;
}): PerformanceBarSnapshot {
  const cutoff = input.now - PERFORMANCE_BAR_WINDOW_MS;
  const windowTimes = input.frameTimes.filter((time) => time >= cutoff && time <= input.now);
  const windowGaps: number[] = [];
  for (let index = 1; index < windowTimes.length; index += 1) {
    windowGaps.push(windowTimes[index]! - windowTimes[index - 1]!);
  }

  const lastGap =
    input.frameTimes.length >= 2
      ? input.frameTimes[input.frameTimes.length - 1]! -
        input.frameTimes[input.frameTimes.length - 2]!
      : 0;
  const delayMs = lastGap > 0 ? lastGap : 0;
  const fps = delayMs > 0 ? 1_000 / delayMs : 0;
  const jankCount = windowGaps.filter((gap) => gap >= PERFORMANCE_BAR_DELAY_HOT_MS).length;
  const jankRatio = windowGaps.length === 0 ? 0 : jankCount / windowGaps.length;

  const sparklineFps: number[] = [];
  const start = Math.max(1, input.frameTimes.length - PERFORMANCE_BAR_SPARKLINE_SAMPLES);
  for (let index = start; index < input.frameTimes.length; index += 1) {
    const gap = input.frameTimes[index]! - input.frameTimes[index - 1]!;
    sparklineFps.push(gap > 0 ? 1_000 / gap : 0);
  }

  return {
    fps,
    delayMs,
    jankRatio,
    heapBytes: input.heapBytes ?? null,
    sparklineFps,
  };
}

export function trimFrameTimes(frameTimes: ReadonlyArray<number>, now: number): number[] {
  const cutoff = now - PERFORMANCE_BAR_HISTORY_MS;
  return frameTimes.filter((time) => time >= cutoff);
}

export function performanceBarDelayTone(delayMs: number): PerformanceBarTone {
  if (delayMs >= PERFORMANCE_BAR_DELAY_HOT_MS) return "bad";
  if (delayMs >= PERFORMANCE_BAR_DELAY_WARN_MS) return "warn";
  return "good";
}

export function performanceBarFpsTone(fps: number): PerformanceBarTone {
  if (fps <= 0) return "good";
  if (fps < PERFORMANCE_BAR_FPS_BAD) return "bad";
  if (fps < PERFORMANCE_BAR_FPS_WARN) return "warn";
  return "good";
}

export function performanceBarJankTone(jankRatio: number): PerformanceBarTone {
  if (jankRatio >= PERFORMANCE_BAR_JANK_WARN_RATIO) return "bad";
  if (jankRatio > 0) return "warn";
  return "good";
}

export function isPerformanceBarDelayHot(delayMs: number): boolean {
  return performanceBarDelayTone(delayMs) === "bad";
}

export function isPerformanceBarJankHot(jankRatio: number): boolean {
  return performanceBarJankTone(jankRatio) === "bad";
}

export function formatPerformanceBarFps(fps: number): string {
  return String(Math.round(fps));
}

export function formatPerformanceBarMs(ms: number): string {
  if (ms >= 100) {
    return `${Math.round(ms)}ms`;
  }
  return `${ms.toFixed(1)}ms`;
}

export function formatPerformanceBarJank(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function formatPerformanceBarHeap(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  const digits = value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export function sparklineFpsRange(
  samples: ReadonlyArray<number>,
  minSpan: number = PERFORMANCE_BAR_SPARKLINE_MIN_SPAN,
): PerformanceBarSparklineRange {
  if (samples.length === 0) {
    return { min: 0, max: minSpan };
  }
  let min = Math.min(...samples);
  let max = Math.max(...samples);
  if (max - min < minSpan) {
    const mid = (min + max) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  if (min < 0) {
    max -= min;
    min = 0;
  }
  return { min, max };
}

export function mapSparklinePoints(
  samples: ReadonlyArray<number>,
  width: number,
  height: number,
): ReadonlyArray<PerformanceBarSparklinePoint> {
  const range = sparklineFpsRange(samples);
  const span = Math.max(range.max - range.min, 1);
  const last = Math.max(samples.length - 1, 1);
  return samples.map((fps, index) => {
    const t = (fps - range.min) / span;
    return {
      x: samples.length <= 1 ? 0 : (index / last) * width,
      y: height - Math.min(1, Math.max(0, t)) * height,
    };
  });
}

export function readRendererHeapBytes(
  performanceLike: {
    readonly memory?: { readonly usedJSHeapSize?: number };
  } = globalThis.performance,
): number | null {
  const used = performanceLike.memory?.usedJSHeapSize;
  return typeof used === "number" && Number.isFinite(used) ? used : null;
}
