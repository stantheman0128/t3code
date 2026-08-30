import { describe, expect, it } from "vite-plus/test";

import {
  applyPerformanceBarLayout,
  clampPerformanceBarHeightPx,
  PERFORMANCE_BAR_HEIGHT_CSS_VAR,
} from "./performanceBarLayout";

function fakeRoot() {
  const properties = new Map<string, string>();
  return {
    dataset: {} as Record<string, string | undefined>,
    style: {
      setProperty: (name: string, value: string) => {
        properties.set(name, value);
      },
      removeProperty: (name: string) => {
        properties.delete(name);
      },
      getPropertyValue: (name: string) => properties.get(name) ?? "",
    },
  };
}

describe("applyPerformanceBarLayout", () => {
  it("marks the document when the bar is shown and clears it when hidden", () => {
    const root = fakeRoot();

    applyPerformanceBarLayout(root as unknown as HTMLElement, true, 48);
    expect(root.dataset.performanceBar).toBe("true");
    expect(root.style.getPropertyValue(PERFORMANCE_BAR_HEIGHT_CSS_VAR)).toBe("48px");

    applyPerformanceBarLayout(root as unknown as HTMLElement, false);
    expect(root.dataset.performanceBar).toBeUndefined();
    expect(root.style.getPropertyValue(PERFORMANCE_BAR_HEIGHT_CSS_VAR)).toBe("");
  });
});

describe("clampPerformanceBarHeightPx", () => {
  it("keeps the bar between 28 and 120 px", () => {
    expect(clampPerformanceBarHeightPx(12)).toBe(28);
    expect(clampPerformanceBarHeightPx(200)).toBe(120);
    expect(clampPerformanceBarHeightPx(47.6)).toBe(48);
  });
});
