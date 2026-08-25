// @effect-diagnostics globalDate:off -- A fixed instant keeps calendar-window assertions deterministic.
import type { CodexAccountUsageSnapshot } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  enumerateHourStarts,
  formatCodexAccountLine,
  formatCodexWindowLabel,
  formatDateTimeShort,
  formatHourShort,
  formatOptionalUsd,
  formatRelativeHourShort,
  formatUsd,
  makeWindow,
} from "./usageFormat.ts";

describe("hourly usage formatting", () => {
  it("enumerates 24 fixed buckets across a rolling window", () => {
    const hours = enumerateHourStarts("2026-08-10T12:37:00.000Z", "2026-08-11T12:37:00.000Z");

    expect(hours).toHaveLength(24);
    expect(hours[0]).toBe("2026-08-10T12:37:00.000Z");
    expect(hours[23]).toBe("2026-08-11T11:37:00.000Z");
  });

  it("formats rolling instants in the requested time zone", () => {
    expect(formatHourShort("2026-08-11T00:37:00.000Z", "UTC")).toBe("12 AM");
    expect(formatHourShort("2026-08-11T12:37:00.000Z", "UTC")).toBe("12 PM");
    expect(formatDateTimeShort("2026-08-11T17:37:00.000Z", "UTC")).toBe("Aug 11, 5 PM");
  });

  it("disambiguates repeated hours during a fall-back transition", () => {
    expect(formatHourShort("2026-11-01T05:37:00.000Z", "America/New_York")).toBe("1 AM EDT");
    expect(formatHourShort("2026-11-01T06:37:00.000Z", "America/New_York")).toBe("1 AM EST");
  });

  it("makes hourly tooltip dates relative to the window in its requested time zone", () => {
    const windowEnd = "2026-08-11T14:37:00.000Z";

    expect(formatRelativeHourShort("2026-08-10T17:37:00.000Z", windowEnd, "UTC")).toBe(
      "5 PM yesterday",
    );
    expect(formatRelativeHourShort("2026-08-11T14:37:00.000Z", windowEnd, "UTC")).toBe(
      "2 PM today",
    );
    expect(
      formatRelativeHourShort(
        "2026-08-11T01:37:00.000Z",
        "2026-08-11T10:37:00.000Z",
        "America/Los_Angeles",
      ),
    ).toBe("6 PM yesterday");
  });

  it("builds an exact minute-aligned 24-hour request", () => {
    const window = makeWindow(1, new Date("2026-08-11T12:37:42.123Z"), "hour");

    expect(window.resolution).toBe("hour");
    expect(window.sinceTime).toBe("2026-08-10T12:37:00.000Z");
    expect(window.untilTime).toBe("2026-08-11T12:37:00.000Z");
  });

  it("degrades an unknown resolved zone to UTC instead of crashing", () => {
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    const resolvedOptions = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({ ...resolved, timeZone: "Etc/Unknown" });

    try {
      const now = new Date("2026-08-11T12:37:42.123Z");

      expect(makeWindow(1, now, "hour").timeZone).toBe("UTC");
      expect(makeWindow(30, now).timeZone).toBe("UTC");
    } finally {
      resolvedOptions.mockRestore();
    }
  });
});

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
