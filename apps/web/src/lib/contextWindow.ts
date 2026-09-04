import type { OrchestrationThreadActivity, ThreadTokenUsageSnapshot } from "@t3tools/contracts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

type NullableContextWindowUsage = {
  readonly [Key in keyof ThreadTokenUsageSnapshot]: undefined extends ThreadTokenUsageSnapshot[Key]
    ? Exclude<ThreadTokenUsageSnapshot[Key], undefined> | null
    : ThreadTokenUsageSnapshot[Key];
};

export type ContextWindowSnapshot = NullableContextWindowUsage & {
  readonly remainingTokens: number | null;
  readonly usedPercentage: number | null;
  readonly remainingPercentage: number | null;
  readonly updatedAt: string;
};

export function deriveLatestContextWindowSnapshot(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ContextWindowSnapshot | null {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== "context-window.updated") {
      continue;
    }

    const payload = asRecord(activity.payload);
    const usedTokens = asFiniteNumber(payload?.usedTokens);
    if (usedTokens === null || usedTokens < 0) {
      continue;
    }

    const maxTokens = asFiniteNumber(payload?.maxTokens);
    const usedPercentage =
      maxTokens !== null && maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : null;
    const remainingTokens =
      maxTokens !== null ? Math.max(0, Math.round(maxTokens - usedTokens)) : null;
    const remainingPercentage = usedPercentage !== null ? Math.max(0, 100 - usedPercentage) : null;

    return {
      usedTokens,
      totalProcessedTokens: asFiniteNumber(payload?.totalProcessedTokens),
      maxTokens,
      remainingTokens,
      usedPercentage,
      remainingPercentage,
      inputTokens: asFiniteNumber(payload?.inputTokens),
      cachedInputTokens: asFiniteNumber(payload?.cachedInputTokens),
      outputTokens: asFiniteNumber(payload?.outputTokens),
      reasoningOutputTokens: asFiniteNumber(payload?.reasoningOutputTokens),
      lastUsedTokens: asFiniteNumber(payload?.lastUsedTokens),
      lastInputTokens: asFiniteNumber(payload?.lastInputTokens),
      lastCachedInputTokens: asFiniteNumber(payload?.lastCachedInputTokens),
      lastOutputTokens: asFiniteNumber(payload?.lastOutputTokens),
      lastReasoningOutputTokens: asFiniteNumber(payload?.lastReasoningOutputTokens),
      toolUses: asFiniteNumber(payload?.toolUses),
      durationMs: asFiniteNumber(payload?.durationMs),
      compactsAutomatically: asBoolean(payload?.compactsAutomatically) ?? false,
      autoCompactThreshold: asFiniteNumber(payload?.autoCompactThreshold),
      updatedAt: activity.createdAt,
    };
  }

  return null;
}

export const CONTEXT_WINDOW_SEGMENT_COLORS = {
  input: "#3B82F6",
  cached: "#F97316",
  output: "#22C55E",
  reasoning: "#EAB308",
  used: "#3B82F6",
  remaining: "color-mix(in oklab, var(--color-muted-foreground) 38%, transparent)",
} as const;

export interface ContextWindowBreakdownRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly tokens: number | null;
  readonly percent: number | null;
  readonly color: string | null;
  readonly inBar: boolean;
}

export interface ContextWindowBarSegment {
  readonly id: string;
  readonly percent: number;
  readonly color: string;
}

function tokenPercent(tokens: number, maxTokens: number | null): number | null {
  if (maxTokens === null || maxTokens <= 0) {
    return null;
  }
  return Math.max(0, (tokens / maxTokens) * 100);
}

export function formatContextWindowPercent(percent: number | null): string | null {
  if (percent === null || !Number.isFinite(percent)) {
    return null;
  }
  if (percent > 0 && percent < 0.1) {
    return "<0.1%";
  }
  return `${percent.toFixed(1)}%`;
}

function pushCategoryRow(
  rows: ContextWindowBreakdownRow[],
  input: {
    readonly id: string;
    readonly label: string;
    readonly tokens: number | null;
    readonly maxTokens: number | null;
    readonly color: string | null;
    readonly inBar: boolean;
    readonly skipZero?: boolean;
  },
): void {
  if (input.tokens === null) {
    return;
  }
  if (input.skipZero && input.tokens === 0) {
    return;
  }
  rows.push({
    id: input.id,
    label: input.label,
    value: formatContextWindowTokens(input.tokens),
    tokens: input.tokens,
    percent: tokenPercent(input.tokens, input.maxTokens),
    color: input.color,
    inBar: input.inBar && input.tokens > 0,
  });
}

export function contextWindowBreakdownRows(
  usage: ContextWindowSnapshot,
): ReadonlyArray<ContextWindowBreakdownRow> {
  return contextWindowBreakdown(usage).rows;
}

export function contextWindowBreakdown(usage: ContextWindowSnapshot): {
  readonly rows: ReadonlyArray<ContextWindowBreakdownRow>;
  readonly barSegments: ReadonlyArray<ContextWindowBarSegment>;
} {
  const rows: ContextWindowBreakdownRow[] = [];
  const maxTokens = usage.maxTokens;
  const cached = usage.cachedInputTokens;
  const rawInput = usage.inputTokens;
  const uncachedInput =
    rawInput !== null && cached !== null ? Math.max(0, rawInput - cached) : rawInput;
  const occupancy = usage.usedTokens;
  const categorySum =
    (uncachedInput ?? 0) +
    (cached ?? 0) +
    (usage.outputTokens ?? 0) +
    (usage.reasoningOutputTokens ?? 0);
  const categoriesAreLifetime =
    (maxTokens !== null && maxTokens > 0 && categorySum > maxTokens + 1) ||
    (occupancy > 0 && categorySum > occupancy + 1);
  const categoriesInBar = !categoriesAreLifetime;

  pushCategoryRow(rows, {
    id: "input",
    label: "Input",
    tokens: uncachedInput,
    maxTokens,
    color: CONTEXT_WINDOW_SEGMENT_COLORS.input,
    inBar: categoriesInBar,
  });
  pushCategoryRow(rows, {
    id: "cached",
    label: "Cached",
    tokens: cached,
    maxTokens,
    color: CONTEXT_WINDOW_SEGMENT_COLORS.cached,
    inBar: categoriesInBar,
    skipZero: true,
  });
  pushCategoryRow(rows, {
    id: "output",
    label: "Output",
    tokens: usage.outputTokens,
    maxTokens,
    color: CONTEXT_WINDOW_SEGMENT_COLORS.output,
    inBar: categoriesInBar,
  });
  pushCategoryRow(rows, {
    id: "reasoning",
    label: "Reasoning",
    tokens: usage.reasoningOutputTokens,
    maxTokens,
    color: CONTEXT_WINDOW_SEGMENT_COLORS.reasoning,
    inBar: categoriesInBar,
    skipZero: true,
  });

  const categorizedTokens = rows.reduce((sum, row) => sum + (row.inBar ? (row.tokens ?? 0) : 0), 0);
  if (categoriesAreLifetime && occupancy > 0) {
    pushCategoryRow(rows, {
      id: "used",
      label: "Used",
      tokens: occupancy,
      maxTokens,
      color: CONTEXT_WINDOW_SEGMENT_COLORS.used,
      inBar: true,
    });
  } else if (categorizedTokens === 0 && occupancy > 0) {
    pushCategoryRow(rows, {
      id: "used",
      label: "Used",
      tokens: occupancy,
      maxTokens,
      color: CONTEXT_WINDOW_SEGMENT_COLORS.used,
      inBar: true,
    });
  } else if (occupancy > categorizedTokens + 1) {
    pushCategoryRow(rows, {
      id: "used",
      label: "Other",
      tokens: occupancy - categorizedTokens,
      maxTokens,
      color: CONTEXT_WINDOW_SEGMENT_COLORS.used,
      inBar: true,
    });
  }

  pushCategoryRow(rows, {
    id: "remaining",
    label: "Free space",
    tokens: usage.remainingTokens,
    maxTokens,
    color: CONTEXT_WINDOW_SEGMENT_COLORS.remaining,
    inBar: true,
  });

  if (usage.totalProcessedTokens !== null && usage.totalProcessedTokens > 0) {
    rows.push({
      id: "processed",
      label: "Total processed",
      value: formatContextWindowTokens(usage.totalProcessedTokens),
      tokens: usage.totalProcessedTokens,
      percent: null,
      color: null,
      inBar: false,
    });
  }

  if (usage.toolUses !== null && usage.toolUses > 0) {
    rows.push({
      id: "tools",
      label: "Tools",
      value: String(usage.toolUses),
      tokens: null,
      percent: null,
      color: null,
      inBar: false,
    });
  }

  const barSegments = rows
    .filter((row) => row.inBar && row.percent !== null && row.percent > 0 && row.color !== null)
    .map((row) => ({
      id: row.id,
      percent: row.percent ?? 0,
      color: row.color ?? CONTEXT_WINDOW_SEGMENT_COLORS.used,
    }));

  return { rows, barSegments };
}

export function formatContextWindowTokens(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "0";
  }
  if (value < 1_000) {
    return `${Math.round(value)}`;
  }
  if (value < 1_000_000) {
    const thousands = value / 1_000;
    return `${thousands.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}
