import { describe, expect, it } from "vite-plus/test";

import {
  collectFindRanges,
  findQueryOffsets,
  formatFindStatus,
  selectedFindQuery,
  stepFindIndex,
} from "./findInPage";

describe("findQueryOffsets", () => {
  it("finds overlapping case-insensitive matches", () => {
    expect(findQueryOffsets("AaaA", "aa")).toEqual([0, 1, 2]);
  });

  it("honors case sensitivity", () => {
    expect(findQueryOffsets("Foo foo FOO", "foo", true)).toEqual([4]);
  });

  it("returns nothing for an empty query", () => {
    expect(findQueryOffsets("hello", "")).toEqual([]);
  });
});

describe("stepFindIndex", () => {
  it("wraps forward and backward", () => {
    expect(stepFindIndex(2, 3, 1)).toBe(0);
    expect(stepFindIndex(0, 3, -1)).toBe(2);
    expect(stepFindIndex(1, 3, 1)).toBe(2);
  });

  it("stays at zero with no matches", () => {
    expect(stepFindIndex(4, 0, 1)).toBe(0);
  });
});

describe("formatFindStatus", () => {
  it("uses 1-based match counts", () => {
    expect(formatFindStatus(0, 4)).toBe("1 of 4");
    expect(formatFindStatus(3, 4)).toBe("4 of 4");
    expect(formatFindStatus(0, 0)).toBe("No results");
  });
});

describe("selectedFindQuery", () => {
  it("uses a single-line selection", () => {
    expect(selectedFindQuery("  Agents  ")).toBe("Agents");
  });

  it("ignores multiline or empty selections", () => {
    expect(selectedFindQuery("one\ntwo")).toBe("");
    expect(selectedFindQuery("   ")).toBe("");
  });
});

describe("collectFindRanges", () => {
  it("walks visible text and skips the find bar", () => {
    if (typeof document === "undefined") return;

    const root = document.createElement("div");
    root.innerHTML = `
      <p>Watching live agents</p>
      <div data-find-bar="true">Watching live agents</div>
      <p hidden>Watching live agents</p>
    `;
    document.body.append(root);
    try {
      const ranges = collectFindRanges(root, "live");
      expect(ranges).toHaveLength(1);
      expect(ranges[0]?.toString()).toBe("live");
    } finally {
      root.remove();
    }
  });
});
