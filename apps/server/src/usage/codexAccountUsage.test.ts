import { describe, expect, it } from "vite-plus/test";

import { formatCodexAccountLine } from "@t3tools/shared/usageFormat";

import { mapCodexAccountUsage, unavailableCodexAccountUsage } from "./codexAccountUsage.ts";

describe("mapCodexAccountUsage", () => {
  it("maps Plus 5h and weekly windows", () => {
    const snapshot = mapCodexAccountUsage({
      planType: "plus",
      lifetimeTokens: 12_000_000,
      primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 1_700_000_000 },
      secondary: { usedPercent: 18, windowDurationMins: 10_080, resetsAt: 1_700_100_000 },
    });
    expect(snapshot).toMatchObject({
      status: "ok",
      planType: "plus",
      primaryUsedPercent: 42,
      primaryWindowMinutes: 300,
      secondaryUsedPercent: 18,
      secondaryWindowMinutes: 10_080,
      lifetimeTokens: 12_000_000,
      message: null,
    });
    expect(formatCodexAccountLine(snapshot)).toBe("plus · 5h 42% used · weekly 18% used");
  });

  it("is unavailable when Codex reports nothing", () => {
    expect(mapCodexAccountUsage({})).toEqual(
      unavailableCodexAccountUsage("Codex did not report account usage."),
    );
    expect(formatCodexAccountLine(unavailableCodexAccountUsage("offline"))).toBe("offline");
  });
});
