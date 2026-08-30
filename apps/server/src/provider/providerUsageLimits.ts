/**
 * Normalize each provider's native quota payload onto ProviderUsageLimits.
 *
 * @module providerUsageLimits
 */
import type { ProviderUsageLimitWindow, ProviderUsageLimits } from "@t3tools/contracts";
import { formatCodexWindowLabel } from "@t3tools/shared/usageFormat";

export function clampUsagePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function remainingFromUsed(usedPercent: number | null | undefined): number | undefined {
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) {
    return undefined;
  }
  return clampUsagePercent(100 - usedPercent);
}

function remainingFromUtilization(utilization: number | null | undefined): number | undefined {
  if (typeof utilization !== "number" || !Number.isFinite(utilization)) {
    return undefined;
  }
  const used = utilization <= 1 ? utilization * 100 : utilization;
  return clampUsagePercent(100 - used);
}

function isoFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    const trimmed = value.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return isoFromUnknown(Number(trimmed));
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1_000;
    return new Date(millis).toISOString();
  }
  return null;
}

/** Skip live quota HTTP in Vitest so provider status tests never use the operator's token. */
export function remoteUsageProbesEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.T3_DISABLE_PROVIDER_USAGE_PROBES === "1") {
    return false;
  }
  if (environment.VITEST || environment.VITEST_WORKER_ID) {
    return false;
  }
  return true;
}

function usageWindow(
  id: string,
  label: string,
  remainingPercent: number | undefined,
  resetsAt: unknown,
  durationMinutes?: number,
): ProviderUsageLimitWindow | undefined {
  if (remainingPercent === undefined) {
    return undefined;
  }
  return {
    id,
    label,
    remainingPercent,
    resetsAt: isoFromUnknown(resetsAt),
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
  };
}

export function availableUsageLimits(input: {
  readonly planLabel?: string;
  readonly observedAt: string;
  readonly windows: ReadonlyArray<ProviderUsageLimitWindow | undefined>;
}): ProviderUsageLimits {
  const windows = input.windows.filter(
    (window): window is ProviderUsageLimitWindow => window !== undefined,
  );
  return {
    status: windows.length > 0 ? "available" : "unavailable",
    ...(input.planLabel ? { planLabel: input.planLabel } : {}),
    observedAt: input.observedAt,
    windows,
  };
}

export function unsupportedUsageLimits(): ProviderUsageLimits {
  return { status: "unsupported", windows: [] };
}

export function mapCodexRateLimits(
  response: {
    readonly planType?: string | null;
    readonly rateLimits?: {
      readonly planType?: string | null;
      readonly primary?: {
        readonly usedPercent?: number | null;
        readonly windowDurationMins?: number | null;
        readonly resetsAt?: number | null;
      } | null;
      readonly secondary?: {
        readonly usedPercent?: number | null;
        readonly windowDurationMins?: number | null;
        readonly resetsAt?: number | null;
      } | null;
    };
    readonly rateLimitsByLimitId?: Record<
      string,
      {
        readonly planType?: string | null;
        readonly primary?: {
          readonly usedPercent?: number | null;
          readonly windowDurationMins?: number | null;
          readonly resetsAt?: number | null;
        } | null;
        readonly secondary?: {
          readonly usedPercent?: number | null;
          readonly windowDurationMins?: number | null;
          readonly resetsAt?: number | null;
        } | null;
      }
    >;
  },
  observedAt: string,
  planLabel?: string,
): ProviderUsageLimits {
  const fallbackBucket = response.rateLimitsByLimitId
    ? (response.rateLimitsByLimitId.codex ?? Object.values(response.rateLimitsByLimitId)[0])
    : undefined;
  const rateLimits =
    response.rateLimits?.primary || response.rateLimits?.secondary
      ? response.rateLimits
      : (fallbackBucket ?? response.rateLimits);
  const primaryMinutes = rateLimits?.primary?.windowDurationMins ?? undefined;
  const secondaryMinutes = rateLimits?.secondary?.windowDurationMins ?? undefined;
  return availableUsageLimits({
    planLabel: planLabel ?? rateLimits?.planType ?? response.planType ?? undefined,
    observedAt,
    windows: [
      usageWindow(
        "primary",
        formatCodexWindowLabel(primaryMinutes ?? null) ?? "5h",
        remainingFromUsed(rateLimits?.primary?.usedPercent),
        rateLimits?.primary?.resetsAt,
        primaryMinutes,
      ),
      usageWindow(
        "secondary",
        formatCodexWindowLabel(secondaryMinutes ?? null) ?? "weekly",
        remainingFromUsed(rateLimits?.secondary?.usedPercent),
        rateLimits?.secondary?.resetsAt,
        secondaryMinutes,
      ),
    ],
  });
}

type ClaudeRateWindow = {
  readonly utilization?: number;
  readonly resets_at?: unknown;
  readonly resetsAt?: unknown;
  readonly display_name?: string;
  readonly displayName?: string;
};

function claudeWindow(
  limits: Record<string, unknown>,
  snake: string,
  camel: string,
): ClaudeRateWindow | undefined {
  return asRecord(limits[snake] ?? limits[camel]) as ClaudeRateWindow | undefined;
}

function claudeUtilization(window: ClaudeRateWindow | undefined): number | undefined {
  const record = window as Record<string, unknown> | undefined;
  return numberField(
    window?.utilization ??
      record?.used_percentage ??
      record?.usedPercentage ??
      record?.used_percent ??
      record?.usedPercent,
  );
}

function claudeResetsAt(window: ClaudeRateWindow | undefined): unknown {
  return window?.resets_at ?? window?.resetsAt;
}

function claudeHasTopLevelWindows(record: Record<string, unknown>): boolean {
  return Boolean(
    record.five_hour ??
    record.fiveHour ??
    record.seven_day ??
    record.sevenDay ??
    record.seven_day_oauth_apps ??
    record.sevenDayOauthApps ??
    record.seven_day_opus ??
    record.sevenDayOpus ??
    record.seven_day_sonnet ??
    record.sevenDaySonnet ??
    record.extra_usage ??
    record.extraUsage,
  );
}

function claudeExtraRemaining(limits: Record<string, unknown>): number | undefined {
  const extra = asRecord(limits.extra_usage ?? limits.extraUsage);
  if (!extra || extra.is_enabled === false || extra.isEnabled === false) {
    return undefined;
  }
  const fromUtilization = remainingFromUtilization(claudeUtilization(extra as ClaudeRateWindow));
  if (fromUtilization !== undefined) {
    return fromUtilization;
  }
  const used = unwrapNumeric(recordField(extra, "used_credits", "usedCredits"));
  const limit = unwrapNumeric(recordField(extra, "monthly_limit", "monthlyLimit", "limit"));
  if (used === undefined || limit === undefined || limit <= 0) {
    return undefined;
  }
  return remainingFromUsed((used / limit) * 100);
}

export function mapClaudeUsageLimits(
  response: unknown,
  observedAt: string,
  planLabel?: string,
): ProviderUsageLimits {
  const record = asRecord(response) ?? {};
  const nested = asRecord(record.data) ?? asRecord(record.usage) ?? record;
  const available = nested.rate_limits_available ?? nested.rateLimitsAvailable;
  const wrapped = asRecord(nested.rate_limits ?? nested.rateLimits);
  const limits = wrapped ?? (claudeHasTopLevelWindows(nested) ? nested : undefined);
  if (!limits) {
    return {
      status: available === false ? "unsupported" : "unavailable",
      ...(planLabel ? { planLabel } : {}),
      windows: [],
    };
  }
  const modelScoped = limits.model_scoped ?? limits.modelScoped;
  return availableUsageLimits({
    planLabel,
    observedAt,
    windows: [
      usageWindow(
        "five_hour",
        "5h",
        remainingFromUtilization(claudeUtilization(claudeWindow(limits, "five_hour", "fiveHour"))),
        claudeResetsAt(claudeWindow(limits, "five_hour", "fiveHour")),
      ),
      usageWindow(
        "seven_day",
        "Week",
        remainingFromUtilization(claudeUtilization(claudeWindow(limits, "seven_day", "sevenDay"))),
        claudeResetsAt(claudeWindow(limits, "seven_day", "sevenDay")),
      ),
      usageWindow(
        "seven_day_oauth_apps",
        "OAuth apps",
        remainingFromUtilization(
          claudeUtilization(claudeWindow(limits, "seven_day_oauth_apps", "sevenDayOauthApps")),
        ),
        claudeResetsAt(claudeWindow(limits, "seven_day_oauth_apps", "sevenDayOauthApps")),
      ),
      usageWindow(
        "seven_day_opus",
        "Opus",
        remainingFromUtilization(
          claudeUtilization(claudeWindow(limits, "seven_day_opus", "sevenDayOpus")),
        ),
        claudeResetsAt(claudeWindow(limits, "seven_day_opus", "sevenDayOpus")),
      ),
      usageWindow(
        "seven_day_sonnet",
        "Sonnet",
        remainingFromUtilization(
          claudeUtilization(claudeWindow(limits, "seven_day_sonnet", "sevenDaySonnet")),
        ),
        claudeResetsAt(claudeWindow(limits, "seven_day_sonnet", "sevenDaySonnet")),
      ),
      usageWindow(
        "extra_usage",
        "Extra",
        claudeExtraRemaining(limits),
        recordField(
          asRecord(limits.extra_usage ?? limits.extraUsage) ?? {},
          "resets_at",
          "resetsAt",
        ),
      ),
      ...(Array.isArray(modelScoped) ? modelScoped : []).map((window, index) => {
        const scoped = asRecord(window) as ClaudeRateWindow | undefined;
        return usageWindow(
          `model_${index}`,
          scoped?.display_name ?? scoped?.displayName ?? `Model ${index + 1}`,
          remainingFromUtilization(claudeUtilization(scoped)),
          claudeResetsAt(scoped),
        );
      }),
    ],
  });
}

/**
 * Claude Code statusline writes ~/.claude/usage-state.json with used
 * percentages. Use it when oauth/usage cannot run because the access token
 * lives in Claude Code's process, not the credentials file.
 */
export function mapClaudeUsageStateDocument(
  document: unknown,
  observedAt: string,
  planLabel?: string,
): ProviderUsageLimits {
  const root = asRecord(document);
  if (!root) {
    return {
      status: "unavailable",
      ...(planLabel ? { planLabel } : {}),
      windows: [],
    };
  }
  const fromTs = isoFromUnknown(root.ts);
  const effectiveObservedAt = fromTs ?? observedAt;
  const nowMs = Date.parse(effectiveObservedAt);
  const stateWindow = (id: string, label: string, raw: unknown) => {
    const record = asRecord(raw);
    if (!record) {
      return undefined;
    }
    const used = unwrapNumeric(record.pct ?? record.used_percentage ?? record.usedPercentage);
    const resetsAt = record.resets_at ?? record.resetsAt;
    const resetIso = isoFromUnknown(resetsAt);
    if (resetIso && Number.isFinite(nowMs) && Date.parse(resetIso) <= nowMs) {
      return undefined;
    }
    return usageWindow(id, label, remainingFromUsed(used), resetsAt);
  };
  return availableUsageLimits({
    planLabel,
    observedAt: effectiveObservedAt,
    windows: [
      stateWindow("five_hour", "5h", root.five_hour ?? root.fiveHour),
      stateWindow("seven_day", "Week", root.seven_day ?? root.sevenDay),
    ],
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function recordField(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

function numberField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function unwrapNumeric(value: unknown): number | undefined {
  const direct = numberField(value);
  if (direct !== undefined) {
    return direct;
  }
  const nested = asRecord(value);
  return nested ? numberField(nested.val ?? nested.value) : undefined;
}

function grokPeriodLabel(periodType: unknown): string {
  const raw = typeof periodType === "string" ? periodType.toUpperCase() : "";
  if (raw.includes("WEEK")) {
    return "Week";
  }
  if (raw.includes("MONTH")) {
    return "Month";
  }
  return "Quota";
}

function grokUsedPercent(cfg: Record<string, unknown>): number | undefined {
  const credit = unwrapNumeric(recordField(cfg, "creditUsagePercent", "credit_usage_percent"));
  if (credit !== undefined) {
    return credit;
  }

  const productUsage = recordField(cfg, "productUsage", "product_usage");
  if (Array.isArray(productUsage)) {
    const records = productUsage
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => item !== undefined);
    const grokBuild =
      records.find((item) => {
        const product = String(item.product ?? "").toLowerCase();
        return product.includes("grokbuild") || product.includes("grok_build");
      }) ?? records[0];
    const productPercent = unwrapNumeric(grokBuild?.usagePercent ?? grokBuild?.usage_percent);
    if (productPercent !== undefined) {
      return productPercent;
    }
  }

  const used =
    unwrapNumeric(recordField(cfg, "used", "totalUsed", "total_used")) ??
    unwrapNumeric(asRecord(cfg.usage)?.totalUsed ?? asRecord(cfg.usage)?.total_used);
  const limit = unwrapNumeric(recordField(cfg, "monthlyLimit", "monthly_limit", "limit"));
  if (used !== undefined && limit !== undefined && limit > 0) {
    return (used / limit) * 100;
  }
  const remainingCredits = unwrapNumeric(
    recordField(cfg, "remainingCredits", "remaining_credits", "prepaidBalance", "prepaid_balance"),
  );
  const totalCredits = unwrapNumeric(
    recordField(cfg, "totalCredits", "total_credits", "creditLimit", "credit_limit"),
  );
  if (remainingCredits !== undefined && totalCredits !== undefined && totalCredits > 0) {
    return (1 - remainingCredits / totalCredits) * 100;
  }
  return undefined;
}

/**
 * Best-effort remaining windows from Grok settings or Cursor about JSON.
 * Unknown shapes become unsupported instead of inventing numbers.
 */
export function mapGenericSubscriptionDocument(
  document: unknown,
  observedAt: string,
  planLabel?: string,
): ProviderUsageLimits {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return {
      status: "unsupported",
      ...(planLabel ? { planLabel } : {}),
      windows: [],
    };
  }
  const record = document as Record<string, unknown>;
  const remaining = numberField(
    recordField(record, "remainingPercent", "remaining_percent", "quotaRemainingPercent"),
  );
  const used = numberField(
    recordField(record, "usedPercent", "used_percent", "utilization", "percentUsed"),
  );
  const remainingPercent =
    remaining !== undefined
      ? clampUsagePercent(remaining <= 1 && remaining >= 0 ? remaining * 100 : remaining)
      : remainingFromUsed(used !== undefined && used <= 1 ? used * 100 : used);

  const nested =
    record.rate_limits ?? record.rateLimits ?? record.usage ?? record.quota ?? record.limits;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const nestedLimits = mapGenericSubscriptionDocument(nested, observedAt, planLabel);
    if (nestedLimits.status === "available") {
      return nestedLimits;
    }
  }

  if (remainingPercent === undefined) {
    return {
      status: "unsupported",
      ...(planLabel ? { planLabel } : {}),
      windows: [],
    };
  }

  return availableUsageLimits({
    planLabel,
    observedAt,
    windows: [
      usageWindow(
        "primary",
        "Quota",
        remainingPercent,
        recordField(record, "resetsAt", "resets_at", "resetAt", "reset_at"),
      ),
    ],
  });
}

/**
 * Grok Build remaining quota from `GET /v1/billing?format=credits`.
 * `creditUsagePercent` is 0–100 used of the shared weekly pool.
 */
export function mapGrokBillingDocument(
  document: unknown,
  observedAt: string,
  planLabel?: string,
): ProviderUsageLimits {
  const root = asRecord(document);
  if (!root) {
    return {
      status: "unsupported",
      ...(planLabel ? { planLabel } : {}),
      windows: [],
    };
  }
  const cfg = asRecord(root.config) ?? root;
  const period = asRecord(recordField(cfg, "currentPeriod", "current_period"));
  const usedPercent = grokUsedPercent(cfg);
  const remainingPercent = usedPercent === undefined ? undefined : remainingFromUsed(usedPercent);
  const resetsAt =
    period?.end ??
    recordField(cfg, "billingPeriodEnd", "billing_period_end", "resetsAt", "resets_at");

  const onDemandUsed = unwrapNumeric(recordField(cfg, "onDemandUsed", "on_demand_used"));
  const onDemandCap = unwrapNumeric(recordField(cfg, "onDemandCap", "on_demand_cap"));
  const onDemandRemaining =
    onDemandCap !== undefined && onDemandCap > 0
      ? clampUsagePercent(100 * (1 - (onDemandUsed ?? 0) / onDemandCap))
      : undefined;

  return availableUsageLimits({
    planLabel,
    observedAt,
    windows: [
      usageWindow("weekly", grokPeriodLabel(period?.type), remainingPercent, resetsAt),
      usageWindow("on_demand", "On-demand", onDemandRemaining, resetsAt),
    ],
  });
}

/**
 * Cursor remaining quota from DashboardService/GetCurrentPeriodUsage.
 * Auto and API are separate included pools; fall back to the combined percent.
 */
export function mapCursorPeriodUsage(
  document: unknown,
  observedAt: string,
  planLabel?: string,
): ProviderUsageLimits {
  const root = asRecord(document);
  if (!root) {
    return {
      status: "unsupported",
      ...(planLabel ? { planLabel } : {}),
      windows: [],
    };
  }
  const planUsage =
    asRecord(recordField(root, "planUsage", "plan_usage")) ??
    asRecord(recordField(root, "individualUsage", "individual_usage")) ??
    root;
  const resetsAt = recordField(
    root,
    "billingCycleEnd",
    "billing_cycle_end",
    "resetsAt",
    "resets_at",
  );

  const remainingCents = unwrapNumeric(recordField(planUsage, "remaining"));
  const limitCents = unwrapNumeric(recordField(planUsage, "limit"));
  const includedFromSpend =
    remainingCents !== undefined && limitCents !== undefined && limitCents > 0
      ? clampUsagePercent((remainingCents / limitCents) * 100)
      : remainingFromUtilization(
          unwrapNumeric(
            recordField(planUsage, "totalPercentUsed", "total_percent_used", "percentUsed"),
          ),
        );

  const autoRemaining = remainingFromUtilization(
    unwrapNumeric(recordField(planUsage, "autoPercentUsed", "auto_percent_used")),
  );
  const apiRemaining = remainingFromUtilization(
    unwrapNumeric(recordField(planUsage, "apiPercentUsed", "api_percent_used")),
  );

  return availableUsageLimits({
    planLabel,
    observedAt,
    windows: [
      usageWindow("included", "Included", includedFromSpend, resetsAt),
      usageWindow("auto", "Auto", autoRemaining, resetsAt),
      usageWindow("api", "API", apiRemaining, resetsAt),
    ],
  });
}

/**
 * OpenRouter remaining from GET /api/v1/key.
 * Unlimited keys (`limit` null) must not be shown as 100% remaining.
 */
export function mapOpenRouterKeyUsage(
  document: unknown,
  observedAt: string,
  planLabel?: string,
): ProviderUsageLimits {
  const root = asRecord(document);
  const data = asRecord(root?.data) ?? root;
  if (!data) {
    return {
      status: "unsupported",
      ...(planLabel ? { planLabel } : {}),
      windows: [],
    };
  }
  const limit = unwrapNumeric(recordField(data, "limit"));
  const remainingCredits = unwrapNumeric(recordField(data, "limit_remaining", "limitRemaining"));
  const usedCredits = unwrapNumeric(recordField(data, "usage", "usage_monthly", "usageMonthly"));
  let remainingPercent: number | undefined;
  if (limit !== undefined && limit > 0 && remainingCredits !== undefined) {
    remainingPercent = clampUsagePercent((remainingCredits / limit) * 100);
  } else if (limit !== undefined && limit > 0 && usedCredits !== undefined) {
    remainingPercent = remainingFromUsed((usedCredits / limit) * 100);
  } else {
    const totalCredits = unwrapNumeric(recordField(data, "total_credits", "totalCredits"));
    const totalUsage = unwrapNumeric(recordField(data, "total_usage", "totalUsage"));
    if (totalCredits !== undefined && totalCredits > 0 && totalUsage !== undefined) {
      remainingPercent = remainingFromUsed((totalUsage / totalCredits) * 100);
    }
  }
  return availableUsageLimits({
    planLabel,
    observedAt,
    windows: [
      usageWindow(
        "openrouter",
        "OpenRouter",
        remainingPercent,
        recordField(data, "limit_reset", "limitReset", "resets_at", "resetsAt"),
      ),
    ],
  });
}

/**
 * OpenCode Go remaining from GET /zen/go/v1/usage.
 * `percent` is used 0–100 for rolling (5h), weekly, and monthly windows.
 */
export function mapOpenCodeGoUsage(
  document: unknown,
  observedAt: string,
  planLabel?: string,
): ProviderUsageLimits {
  const root = asRecord(document);
  const usage = asRecord(root?.usage) ?? root;
  if (!usage) {
    return {
      status: "unsupported",
      ...(planLabel ? { planLabel } : {}),
      windows: [],
    };
  }
  const rolling = asRecord(recordField(usage, "rolling", "session", "fiveHour", "five_hour"));
  const weekly = asRecord(recordField(usage, "weekly", "week"));
  const monthly = asRecord(recordField(usage, "monthly", "month"));
  const windowRemaining = (record: Record<string, unknown> | undefined) =>
    remainingFromUsed(
      unwrapNumeric(recordField(record ?? {}, "percent", "usagePercent", "usage_percent")),
    );
  return availableUsageLimits({
    planLabel,
    observedAt,
    windows: [
      usageWindow(
        "rolling",
        "5h",
        windowRemaining(rolling),
        rolling?.resetsAt ?? rolling?.resets_at,
      ),
      usageWindow("weekly", "Week", windowRemaining(weekly), weekly?.resetsAt ?? weekly?.resets_at),
      usageWindow(
        "monthly",
        "Month",
        windowRemaining(monthly),
        monthly?.resetsAt ?? monthly?.resets_at,
      ),
    ],
  });
}
