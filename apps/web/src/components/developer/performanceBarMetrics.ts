export const PERFORMANCE_BAR_WINDOW_MS = 500;
export const PERFORMANCE_BAR_DELAY_WARN_MS = 50;
export const PERFORMANCE_BAR_JANK_WARN_RATIO = 0.1;
export const PERFORMANCE_BAR_SPARKLINE_SAMPLES = 16;
export const PERFORMANCE_BAR_HISTORY_MS = 2_000;

export interface PerformanceBarSnapshot {
  readonly fps: number;
  readonly delayMs: number;
  readonly jankRatio: number;
  readonly heapBytes: number | null;
  readonly sparklineGapsMs: ReadonlyArray<number>;
}

export function derivePerformanceBarSnapshot(input: {
  readonly frameTimes: ReadonlyArray<number>;
  readonly now: number;
  readonly heapBytes?: number | null;
}): PerformanceBarSnapshot {
  const cutoff = input.now - PERFORMANCE_BAR_WINDOW_MS;
  const windowTimes = input.frameTimes.filter((time) => time >= cutoff && time <= input.now);
  const gaps: number[] = [];
  for (let index = 1; index < windowTimes.length; index += 1) {
    gaps.push(windowTimes[index]! - windowTimes[index - 1]!);
  }
  const delayMs = gaps.length === 0 ? 0 : Math.max(...gaps);
  const durationMs =
    windowTimes.length >= 2 ? windowTimes[windowTimes.length - 1]! - windowTimes[0]! : 0;
  const fps = durationMs > 0 ? ((windowTimes.length - 1) / durationMs) * 1_000 : 0;
  const jankCount = gaps.filter((gap) => gap >= PERFORMANCE_BAR_DELAY_WARN_MS).length;
  const jankRatio = gaps.length === 0 ? 0 : jankCount / gaps.length;
  const sparklineGapsMs: number[] = [];
  for (let index = 1; index < input.frameTimes.length; index += 1) {
    sparklineGapsMs.push(input.frameTimes[index]! - input.frameTimes[index - 1]!);
  }

  return {
    fps,
    delayMs,
    jankRatio,
    heapBytes: input.heapBytes ?? null,
    sparklineGapsMs: sparklineGapsMs.slice(-PERFORMANCE_BAR_SPARKLINE_SAMPLES),
  };
}

export function trimFrameTimes(frameTimes: ReadonlyArray<number>, now: number): number[] {
  const cutoff = now - PERFORMANCE_BAR_HISTORY_MS;
  return frameTimes.filter((time) => time >= cutoff);
}

export function isPerformanceBarDelayHot(delayMs: number): boolean {
  return delayMs >= PERFORMANCE_BAR_DELAY_WARN_MS;
}

export function isPerformanceBarJankHot(jankRatio: number): boolean {
  return jankRatio >= PERFORMANCE_BAR_JANK_WARN_RATIO;
}

export function formatPerformanceBarFps(fps: number): string {
  return String(Math.round(fps));
}

export function formatPerformanceBarMs(ms: number): string {
  return `${Math.round(ms)}ms`;
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

export function readRendererHeapBytes(
  performanceLike: {
    readonly memory?: { readonly usedJSHeapSize?: number };
  } = globalThis.performance,
): number | null {
  const used = performanceLike.memory?.usedJSHeapSize;
  return typeof used === "number" && Number.isFinite(used) ? used : null;
}
