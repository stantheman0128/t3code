import type { CodexAccountUsageSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  formatCodexAccountLine,
  formatCodexWindowLabel,
  formatOptionalUsd,
  formatUsd,
} from "./usageFormat.ts";

describe("formatOptionalUsd", () => {
  it("formats a known cost", () => {
    expect(formatOptionalUsd(1.5)).toBe(formatUsd(1.5));
  });

  it("does not report missing provider spend as $0", () => {
    expect(formatOptionalUsd(undefined)).toBe("—");
  });
});

describe("formatCodexWindowLabel", () => {
  it("labels the Plus 5h and weekly windows", () => {
    expect(formatCodexWindowLabel(300)).toBe("5h");
    expect(formatCodexWindowLabel(10_080)).toBe("weekly");
    expect(formatCodexWindowLabel(60)).toBe("1h");
    expect(formatCodexWindowLabel(45)).toBe("45m");
    expect(formatCodexWindowLabel(null)).toBeNull();
  });
});

describe("formatCodexAccountLine", () => {
  it("formats Plus 5h and weekly windows", () => {
    const snapshot: CodexAccountUsageSnapshot = {
      status: "ok",
      planType: "plus",
      primaryUsedPercent: 42,
      primaryWindowMinutes: 300,
      primaryResetsAt: 1,
      secondaryUsedPercent: 18,
      secondaryWindowMinutes: 10_080,
      secondaryResetsAt: 2,
      lifetimeTokens: 12_000_000,
      message: null,
    };
    expect(formatCodexAccountLine(snapshot)).toBe("plus · 5h 42% used · weekly 18% used");
  });
});
