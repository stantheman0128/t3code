import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { PerformanceBarView } from "./PerformanceBar";
import { derivePerformanceBarSnapshot } from "./performanceBarMetrics";

describe("PerformanceBarView", () => {
  it("renders delay, fps, jank, and heap from the live snapshot", () => {
    const snapshot = derivePerformanceBarSnapshot({
      frameTimes: Array.from({ length: 20 }, (_, index) => index * 16),
      now: 19 * 16,
      heapBytes: 24 * 1024 * 1024,
    });
    const markup = renderToStaticMarkup(
      <PerformanceBarView
        snapshot={snapshot}
        fpsMode="bars"
        onCycleFpsMode={() => {}}
        onHide={() => {}}
      />,
    );

    expect(markup).toContain('data-component="t3-dev-performance-toolbar"');
    expect(markup).toContain("Delay");
    expect(markup).toContain("16ms");
    expect(markup).toContain("FPS");
    expect(markup).toContain("Jank");
    expect(markup).toContain("Heap");
    expect(markup).toContain("24.0 MB");
    expect(markup).toContain("What do these metrics mean?");
    expect(markup).toContain("Hide performance bar");
  });

  it("marks a stalled delay red and can show the wave indicator", () => {
    const snapshot = derivePerformanceBarSnapshot({
      frameTimes: [0, 16, 96, 112],
      now: 112,
    });
    const markup = renderToStaticMarkup(
      <PerformanceBarView
        snapshot={snapshot}
        fpsMode="wave"
        onCycleFpsMode={() => {}}
        onHide={() => {}}
      />,
    );

    expect(markup).toContain("80ms");
    expect(markup).toContain("text-destructive");
    expect(markup).toContain("<polyline");
  });
});
