import { describe, expect, it } from "vite-plus/test";
import { EventId, type OrchestrationThreadActivity, TurnId } from "@t3tools/contracts";

import {
  contextWindowBreakdown,
  contextWindowBreakdownRows,
  deriveLatestContextWindowSnapshot,
  formatContextWindowTokens,
} from "./contextWindow";

function makeActivity(id: string, kind: string, payload: unknown): OrchestrationThreadActivity {
  return {
    id: EventId.make(id),
    tone: "info",
    kind,
    summary: kind,
    payload,
    turnId: TurnId.make("turn-1"),
    createdAt: "2026-03-23T00:00:00.000Z",
  };
}

describe("contextWindow", () => {
  it("derives the latest valid context window snapshot", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      makeActivity("activity-1", "context-window.updated", {
        usedTokens: 1000,
      }),
      makeActivity("activity-2", "tool.started", {}),
      makeActivity("activity-3", "context-window.updated", {
        usedTokens: 14_000,
        maxTokens: 258_000,
        compactsAutomatically: true,
        autoCompactThreshold: 200_000,
      }),
    ]);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.usedTokens).toBe(14_000);
    expect(snapshot?.totalProcessedTokens).toBeNull();
    expect(snapshot?.maxTokens).toBe(258_000);
    expect(snapshot?.compactsAutomatically).toBe(true);
    expect(snapshot?.autoCompactThreshold).toBe(200_000);
  });

  it("ignores malformed payloads", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      makeActivity("activity-1", "context-window.updated", {}),
    ]);

    expect(snapshot).toBeNull();
  });

  it("keeps valid zero-usage snapshots", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      makeActivity("activity-1", "context-window.updated", {
        usedTokens: 0,
        maxTokens: 100_000,
      }),
    ]);

    expect(snapshot).toMatchObject({
      usedTokens: 0,
      maxTokens: 100_000,
      remainingTokens: 100_000,
      usedPercentage: 0,
      remainingPercentage: 100,
    });
  });

  it("formats compact token counts", () => {
    expect(formatContextWindowTokens(999)).toBe("999");
    expect(formatContextWindowTokens(1400)).toBe("1.4k");
    expect(formatContextWindowTokens(14_000)).toBe("14k");
    expect(formatContextWindowTokens(258_000)).toBe("258k");
    expect(formatContextWindowTokens(9_200_000)).toBe("9.2m");
  });

  it("builds a Claude-style English context breakdown with percents", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      makeActivity("activity-1", "context-window.updated", {
        usedTokens: 81_659,
        maxTokens: 258_400,
        inputTokens: 70_000,
        cachedInputTokens: 10_000,
        outputTokens: 1_500,
        reasoningOutputTokens: 200,
        lastUsedTokens: 2_000,
        toolUses: 4,
      }),
    ]);

    const rows = contextWindowBreakdownRows(snapshot!);
    expect(rows.map((row) => ({ id: row.id, label: row.label, value: row.value }))).toEqual([
      { id: "input", label: "Input", value: "60k" },
      { id: "cached", label: "Cached", value: "10k" },
      { id: "output", label: "Output", value: "1.5k" },
      { id: "reasoning", label: "Reasoning", value: "200" },
      { id: "used", label: "Other", value: "10k" },
      { id: "remaining", label: "Free space", value: "176.7k" },
      { id: "tools", label: "Tools", value: "4" },
    ]);
    expect(rows.find((row) => row.id === "input")?.inBar).toBe(true);
    expect(rows.find((row) => row.id === "input")?.color).toBe("#3B82F6");
    expect(rows.find((row) => row.id === "tools")?.inBar).toBe(false);

    const { barSegments } = contextWindowBreakdown(snapshot!);
    const barTotal = barSegments.reduce((sum, segment) => sum + segment.percent, 0);
    expect(barTotal).toBeGreaterThan(99);
    expect(barTotal).toBeLessThan(101);
    expect(barSegments.some((segment) => segment.id === "remaining")).toBe(true);
  });

  it("includes total processed tokens when available", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      makeActivity("activity-1", "context-window.updated", {
        usedTokens: 81_659,
        totalProcessedTokens: 748_126,
        maxTokens: 258_400,
        lastUsedTokens: 81_659,
      }),
    ]);

    expect(snapshot?.usedTokens).toBe(81_659);
    expect(snapshot?.totalProcessedTokens).toBe(748_126);
  });
});
