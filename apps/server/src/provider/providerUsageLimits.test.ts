import { describe, expect, it } from "vite-plus/test";

import {
  mapClaudeUsageLimits,
  mapClaudeUsageStateDocument,
  mapCodexRateLimits,
  mapCursorPeriodUsage,
  mapGenericSubscriptionDocument,
  mapGrokBillingDocument,
  mapOpenRouterKeyUsage,
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
        { id: "primary", label: "5h", remainingPercent: 58, durationMinutes: 300 },
        { id: "secondary", label: "weekly", remainingPercent: 90, durationMinutes: 10080 },
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

  it("maps camelCase Claude usage payloads even if the available flag is missing", () => {
    expect(
      mapClaudeUsageLimits(
        {
          rateLimits: {
            fiveHour: { utilization: 0.1, resetsAt: "2026-08-28T17:00:00.000Z" },
            sevenDay: { utilization: 0.2 },
          },
        },
        observedAt,
        "Pro",
      ),
    ).toMatchObject({
      status: "available",
      planLabel: "Pro",
      windows: [
        { id: "five_hour", label: "5h", remainingPercent: 90 },
        { id: "seven_day", label: "Week", remainingPercent: 80 },
      ],
    });
  });

  it("maps the oauth/usage document Claude Code itself fetches", () => {
    expect(
      mapClaudeUsageLimits(
        {
          five_hour: { utilization: 35, resets_at: "2026-08-28T17:00:00.000Z" },
          seven_day: { utilization: 14, resets_at: "2026-09-03T20:00:00.000Z" },
          seven_day_sonnet: { used_percentage: 39 },
          extra_usage: { is_enabled: true, monthly_limit: 100, used_credits: 25 },
        },
        observedAt,
        "Pro",
      ),
    ).toMatchObject({
      status: "available",
      planLabel: "Pro",
      windows: [
        { id: "five_hour", label: "5h", remainingPercent: 65 },
        { id: "seven_day", label: "Week", remainingPercent: 86 },
        { id: "seven_day_sonnet", label: "Sonnet", remainingPercent: 61 },
        { id: "extra_usage", label: "Extra", remainingPercent: 75 },
      ],
    });
  });
});

describe("mapClaudeUsageStateDocument", () => {
  it("maps Claude Code statusline used percentages", () => {
    expect(
      mapClaudeUsageStateDocument(
        {
          five_hour: { pct: 47, resets_at: "2026-08-27T17:00:00.000Z" },
          seven_day: { pct: 52, resets_at: "2026-09-03T20:00:00.000Z" },
          ts: "2026-08-27T12:00:00.000Z",
        },
        observedAt,
        "Claude Pro",
      ),
    ).toMatchObject({
      status: "available",
      planLabel: "Claude Pro",
      observedAt: "2026-08-27T12:00:00.000Z",
      windows: [
        { id: "five_hour", label: "5h", remainingPercent: 53 },
        { id: "seven_day", label: "Week", remainingPercent: 48 },
      ],
    });
  });

  it("drops windows whose reset is already in the past", () => {
    expect(
      mapClaudeUsageStateDocument(
        {
          five_hour: { pct: 47, resets_at: "2026-08-27T11:00:00.000Z" },
          seven_day: { pct: 52, resets_at: "2026-09-03T20:00:00.000Z" },
        },
        observedAt,
        "Claude Pro",
      ),
    ).toMatchObject({
      status: "available",
      windows: [{ id: "seven_day", remainingPercent: 48 }],
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

  it("does not treat empty unified-billing credits as 100% remaining", () => {
    expect(
      mapGrokBillingDocument(
        {
          config: {
            isUnifiedBillingUser: true,
            prepaidBalance: { val: 0 },
            onDemandCap: { val: 0 },
            currentPeriod: { type: "USAGE_PERIOD_TYPE_WEEKLY" },
          },
        },
        observedAt,
        "SuperGrok Heavy",
      ),
    ).toMatchObject({ status: "unavailable", windows: [] });
  });
});

describe("mapOpenRouterKeyUsage", () => {
  it("maps a capped key to remaining percent", () => {
    expect(
      mapOpenRouterKeyUsage(
        { data: { limit: 20, limit_remaining: 5, usage: 15 } },
        observedAt,
        "OpenRouter",
      ),
    ).toMatchObject({
      status: "available",
      windows: [{ id: "openrouter", label: "OpenRouter", remainingPercent: 25 }],
    });
  });

  it("does not show unlimited keys as 100% remaining", () => {
    expect(
      mapOpenRouterKeyUsage(
        { data: { limit: null, limit_remaining: null, usage: 12.5 } },
        observedAt,
        "OpenRouter",
      ),
    ).toMatchObject({ status: "unavailable", windows: [] });
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
