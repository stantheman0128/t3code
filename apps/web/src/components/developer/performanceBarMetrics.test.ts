import { describe, expect, it } from "vite-plus/test";

import {
  derivePerformanceBarSnapshot,
  formatPerformanceBarFps,
  formatPerformanceBarHeap,
  formatPerformanceBarJank,
  formatPerformanceBarMs,
  isPerformanceBarDelayHot,
  isPerformanceBarJankHot,
  readRendererHeapBytes,
  trimFrameTimes,
} from "./performanceBarMetrics";

describe("derivePerformanceBarSnapshot", () => {
  it("reports fps, delay, and no jank for a steady 16 ms cadence", () => {
    const frameTimes = Array.from({ length: 32 }, (_, index) => index * 16);
    const snapshot = derivePerformanceBarSnapshot({
      frameTimes,
      now: 31 * 16,
      heapBytes: 12 * 1024 * 1024,
    });

    expect(snapshot.fps).toBeCloseTo(62.5, 1);
    expect(snapshot.delayMs).toBe(16);
    expect(snapshot.jankRatio).toBe(0);
    expect(snapshot.heapBytes).toBe(12 * 1024 * 1024);
    expect(isPerformanceBarDelayHot(snapshot.delayMs)).toBe(false);
    expect(isPerformanceBarJankHot(snapshot.jankRatio)).toBe(false);
  });

  it("flags a stalled frame as delay and jank", () => {
    const snapshot = derivePerformanceBarSnapshot({
      frameTimes: [0, 16, 32, 120, 136],
      now: 136,
    });

    expect(snapshot.delayMs).toBe(88);
    expect(snapshot.jankRatio).toBeGreaterThan(0);
    expect(isPerformanceBarDelayHot(snapshot.delayMs)).toBe(true);
    expect(isPerformanceBarJankHot(snapshot.jankRatio)).toBe(true);
    expect(snapshot.sparklineGapsMs).toEqual([16, 16, 88, 16]);
  });

  it("keeps only the last 500 ms of frames for fps", () => {
    const snapshot = derivePerformanceBarSnapshot({
      frameTimes: [0, 16, 1000, 1016, 1032],
      now: 1032,
    });

    expect(snapshot.fps).toBeCloseTo(62.5, 1);
    expect(snapshot.delayMs).toBe(16);
  });
});

describe("performance bar formatters", () => {
  it("rounds fps, delay, jank, and heap for the toolbar", () => {
    expect(formatPerformanceBarFps(59.6)).toBe("60");
    expect(formatPerformanceBarMs(49.2)).toBe("49ms");
    expect(formatPerformanceBarJank(0.123)).toBe("12%");
    expect(formatPerformanceBarHeap(12 * 1024 * 1024)).toBe("12.0 MB");
  });

  it("trims frame times older than the history window", () => {
    expect(trimFrameTimes([0, 100, 1_500, 2_100], 2_100)).toEqual([100, 1_500, 2_100]);
  });

  it("reads Chromium heap when performance.memory is present", () => {
    expect(readRendererHeapBytes({ memory: { usedJSHeapSize: 4096 } })).toBe(4096);
    expect(readRendererHeapBytes({})).toBeNull();
  });
});
