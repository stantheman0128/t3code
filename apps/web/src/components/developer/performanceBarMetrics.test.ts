import { describe, expect, it } from "vite-plus/test";

import {
  derivePerformanceBarSnapshot,
  formatPerformanceBarFps,
  formatPerformanceBarHeap,
  formatPerformanceBarJank,
  formatPerformanceBarMs,
  isPerformanceBarDelayHot,
  isPerformanceBarJankHot,
  mapSparklinePoints,
  performanceBarDelayTone,
  performanceBarFpsTone,
  performanceBarSparklineSize,
  readRendererHeapBytes,
  sparklineFpsRange,
  trimFrameTimes,
} from "./performanceBarMetrics";

describe("derivePerformanceBarSnapshot", () => {
  it("uses the last frame for delay and fps so idle ticks instead of freezing", () => {
    const frameTimes = Array.from({ length: 32 }, (_, index) => index * 16);
    const snapshot = derivePerformanceBarSnapshot({
      frameTimes,
      now: 31 * 16,
      heapBytes: 12 * 1024 * 1024,
    });

    expect(snapshot.delayMs).toBe(16);
    expect(snapshot.fps).toBeCloseTo(62.5, 1);
    expect(snapshot.jankRatio).toBe(0);
    expect(snapshot.heapBytes).toBe(12 * 1024 * 1024);
    expect(snapshot.sparklineFps.at(-1)).toBeCloseTo(62.5, 1);
    expect(isPerformanceBarDelayHot(snapshot.delayMs)).toBe(false);
    expect(isPerformanceBarJankHot(snapshot.jankRatio)).toBe(false);
  });

  it("reports the last frame when a stall has already recovered", () => {
    const snapshot = derivePerformanceBarSnapshot({
      frameTimes: [0, 16, 32, 120, 136],
      now: 136,
    });

    expect(snapshot.delayMs).toBe(16);
    expect(snapshot.fps).toBeCloseTo(62.5, 1);
    expect(snapshot.jankRatio).toBeGreaterThan(0);
  });

  it("flags the current frame when it is the stall", () => {
    const snapshot = derivePerformanceBarSnapshot({
      frameTimes: [0, 16, 32, 48, 136],
      now: 136,
    });

    expect(snapshot.delayMs).toBe(88);
    expect(snapshot.fps).toBeCloseTo(11.36, 1);
    expect(isPerformanceBarDelayHot(snapshot.delayMs)).toBe(true);
    expect(performanceBarDelayTone(snapshot.delayMs)).toBe("bad");
    expect(performanceBarFpsTone(snapshot.fps)).toBe("bad");
  });

  it("keeps jank on the last 500 ms of frames", () => {
    const snapshot = derivePerformanceBarSnapshot({
      frameTimes: [0, 16, 1000, 1016, 1032],
      now: 1032,
    });

    expect(snapshot.delayMs).toBe(16);
    expect(snapshot.fps).toBeCloseTo(62.5, 1);
    expect(snapshot.jankRatio).toBe(0);
  });
});

describe("performance bar formatters", () => {
  it("keeps delay to one decimal so small frame gaps are visible", () => {
    expect(formatPerformanceBarFps(59.6)).toBe("60");
    expect(formatPerformanceBarMs(16.42)).toBe("16.4ms");
    expect(formatPerformanceBarMs(49.2)).toBe("49.2ms");
    expect(formatPerformanceBarMs(120.4)).toBe("120ms");
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

describe("sparklineFpsRange", () => {
  it("zooms around idle fps so 58-62 is a visible wiggle, not a flat line", () => {
    const range = sparklineFpsRange([58, 60, 62, 59]);
    expect(range.max - range.min).toBe(20);
    expect(range.min).toBeLessThan(58);
    expect(range.max).toBeGreaterThan(62);
  });

  it("widens when a stall drops fps", () => {
    const range = sparklineFpsRange([60, 60, 12, 60]);
    expect(range.min).toBe(12);
    expect(range.max).toBe(60);
  });
});

describe("performanceBarSparklineSize", () => {
  it("matches the default bar and grows when the bar is taller", () => {
    expect(performanceBarSparklineSize(36)).toEqual({ width: 88, height: 22 });
    expect(performanceBarSparklineSize(72).height).toBeGreaterThan(22);
    expect(performanceBarSparklineSize(72).width).toBeGreaterThan(88);
  });
});

describe("mapSparklinePoints", () => {
  it("puts higher fps nearer the top of the plot", () => {
    const points = mapSparklinePoints([40, 60], 80, 20);
    expect(points).toHaveLength(2);
    expect(points[0]?.x).toBe(0);
    expect(points[1]?.x).toBe(80);
    expect(points[1]!.y).toBeLessThan(points[0]!.y);
  });
});
