import { describe, expect, it } from "vite-plus/test";

import { nextComposerListMarker, parseComposerListLine } from "./composer-list-line";

describe("parseComposerListLine", () => {
  it("reads a numbered line and the following marker", () => {
    const line = parseComposerListLine("1. first");
    expect(line?.kind).toBe("ordered");
    expect(line?.body).toBe("first");
    expect(nextComposerListMarker(line!)).toBe("2. ");
  });

  it("keeps indent and a parenthesis delimiter", () => {
    const line = parseComposerListLine("  3) nested");
    expect(line?.indent).toBe("  ");
    expect(nextComposerListMarker(line!)).toBe("  4) ");
  });

  it("continues a dash", () => {
    const line = parseComposerListLine("- item");
    expect(line?.kind).toBe("bullet");
    expect(nextComposerListMarker(line!)).toBe("- ");
  });

  it("ignores a number that is not a list marker", () => {
    expect(parseComposerListLine("1.5 is a value")).toBeNull();
    expect(parseComposerListLine("see 1. later")).toBeNull();
  });
});
