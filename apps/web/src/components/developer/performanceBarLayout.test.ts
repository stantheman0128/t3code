import { describe, expect, it } from "vite-plus/test";

import { applyPerformanceBarLayout } from "./performanceBarLayout";

describe("applyPerformanceBarLayout", () => {
  it("marks the document when the bar is shown and clears it when hidden", () => {
    const root = { dataset: {} as Record<string, string | undefined> };

    applyPerformanceBarLayout(root as HTMLElement, true);
    expect(root.dataset.performanceBar).toBe("true");

    applyPerformanceBarLayout(root as HTMLElement, false);
    expect(root.dataset.performanceBar).toBeUndefined();
  });
});
