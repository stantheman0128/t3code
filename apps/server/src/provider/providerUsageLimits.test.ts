import { describe, expect, it } from "vite-plus/test";

import {
  mapClaudeUsageLimits,
  mapCodexRateLimits,
  mapCursorPeriodUsage,
  mapGenericSubscriptionDocument,
  mapGrokBillingDocument,
  remoteUsageProbesEnabled,
} from "./providerUsageLimits.ts";

const observedAt = "2026-08-27T12:00:00.000Z";

describe("mapCodexRateLimits", () => {
  it("turns used percent into remaining windows", () => {
    expect(
      mapCodexRateLimits(
        {
          planType: "plus",
          rateLimits: {
            primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 1_777_000_000 },
            secondary: { usedPercent: 10, windowDurationMins: 10_080, resetsAt: 1_777_100_000 },
          },
        },
        observedAt,
        "Plus Subscription",
      ),
    ).toMatchObject({
      status: "available",
      planLabel: "Plus Subscription",
      windows: [
        { id: "primary", remainingPercent: 58, durationMinutes: 300 },
        { id: "secondary", remainingPercent: 90, durationMinutes: 10080 },
      ],
    });
  });
});

describe("mapClaudeUsageLimits", () => {
  it("maps five-hour and weekly utilization", () => {
    expect(
      mapClaudeUsageLimits(
        {
          subscription_type: "max",
          rate_limits_available: true,
          rate_limits: {
            five_hour: { utilization: 0.25, resets_at: "2026-08-27T17:00:00.000Z" },
            seven_day: { utilization: 0.4 },
          },
        },
        observedAt,
        "Max",
      ),
    ).toMatchObject({
      status: "available",
      planLabel: "Max",
      windows: [
        { id: "five_hour", label: "5h", remainingPercent: 75 },
        { id: "seven_day", label: "Week", remainingPercent: 60 },
      ],
    });
  });

  it("marks Claude usage unsupported when the SDK omits rate limits", () => {
    expect(mapClaudeUsageLimits({ rate_limits_available: false }, observedAt, "Pro")).toEqual({
      status: "unsupported",
      planLabel: "Pro",
      windows: [],
    });
  });
});

describe("mapGenericSubscriptionDocument", () => {
  it("reads remaining percent from Grok-style settings", () => {
    expect(
      mapGenericSubscriptionDocument(
        { remaining_percent: 37, resets_at: "2026-08-28T00:00:00.000Z" },
        observedAt,
        "SuperGrok",
      ),
    ).toMatchObject({
      status: "available",
      planLabel: "SuperGrok",
      windows: [{ id: "primary", remainingPercent: 37 }],
    });
  });

  it("does not invent numbers for a plan-only Cursor about payload", () => {
    expect(mapGenericSubscriptionDocument({ subscriptionTier: "pro" }, observedAt, "Pro")).toEqual({
      status: "unsupported",
      planLabel: "Pro",
      windows: [],
    });
  });
});

describe("mapGrokBillingDocument", () => {
  it("turns weekly creditUsagePercent into remaining", () => {
    expect(
      mapGrokBillingDocument(
        {
          config: {
            creditUsagePercent: 22.4,
            currentPeriod: {
              type: "USAGE_PERIOD_TYPE_WEEKLY",
              end: "2026-08-31T00:00:00.000Z",
            },
            onDemandUsed: { val: 5 },
            onDemandCap: { val: 20 },
          },
        },
        observedAt,
        "SuperGrok",
      ),
    ).toMatchObject({
      status: "available",
      planLabel: "SuperGrok",
      windows: [
        { id: "weekly", label: "Week", remainingPercent: 78 },
        { id: "on_demand", label: "On-demand", remainingPercent: 75 },
      ],
    });
  });

  it("does not invent remaining when billing has no usage fields", () => {
    expect(
      mapGrokBillingDocument({ subscription_tier_display: "SuperGrok" }, observedAt, "SuperGrok"),
    ).toEqual({
      status: "unavailable",
      planLabel: "SuperGrok",
      observedAt,
      windows: [],
    });
  });
});

describe("mapCursorPeriodUsage", () => {
  it("maps included remaining plus Auto and API pools", () => {
    expect(
      mapCursorPeriodUsage(
        {
          billingCycleEnd: "1784958141000",
          planUsage: {
            remaining: 47,
            limit: 100,
            autoPercentUsed: 0.2,
            apiPercentUsed: 40,
          },
        },
        observedAt,
        "Cursor Pro Subscription",
      ),
    ).toMatchObject({
      status: "available",
      planLabel: "Cursor Pro Subscription",
      windows: [
        { id: "included", label: "Included", remainingPercent: 47 },
        { id: "auto", label: "Auto", remainingPercent: 80 },
        { id: "api", label: "API", remainingPercent: 60 },
      ],
    });
  });

  it("falls back to totalPercentUsed when remaining/limit are absent", () => {
    expect(
      mapCursorPeriodUsage({ planUsage: { totalPercentUsed: 53 } }, observedAt, "Pro"),
    ).toMatchObject({
      status: "available",
      windows: [{ id: "included", remainingPercent: 47 }],
    });
  });
});

describe("remoteUsageProbesEnabled", () => {
  it("stays off in Vitest so status checks never spend the operator token", () => {
    expect(remoteUsageProbesEnabled({ VITEST: "true" })).toBe(false);
    expect(remoteUsageProbesEnabled({ T3_DISABLE_PROVIDER_USAGE_PROBES: "1" })).toBe(false);
    expect(remoteUsageProbesEnabled({})).toBe(true);
  });
});
