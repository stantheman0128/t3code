import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { PerformanceBarView } from "./PerformanceBar";
import { derivePerformanceBarSnapshot } from "./performanceBarMetrics";

describe("PerformanceBarView", () => {
  it("clusters live metrics on the right with a colored delay reading", () => {
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
    expect(markup).toContain("ml-auto");
    expect(markup).toContain("data-performance-toolbar-brand");
    expect(markup).toContain("Delay");
    expect(markup).toContain("16.0ms");
    expect(markup).toContain("text-foreground");
    expect(markup).toContain("FPS");
    expect(markup).toContain("data-performance-sparkline");
    expect(markup).toContain("<canvas");
    expect(markup).toContain("Jank");
    expect(markup).toContain("Heap");
    expect(markup).toContain("24.0 MB");
    expect(markup).toContain("What do these metrics mean?");
    expect(markup).toContain("Hide performance bar");
    expect(markup).toContain("Resize performance bar");
    expect(markup).toContain("cursor-row-resize");
  });

  it("marks a stalled current frame red", () => {
    const snapshot = derivePerformanceBarSnapshot({
      frameTimes: [0, 16, 32, 112],
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

    expect(markup).toContain("80.0ms");
    expect(markup).toContain("text-red-400");
    expect(markup).toContain('data-fps-mode="wave"');
  });
});
