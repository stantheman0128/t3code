/**
 * Maps Codex app-server account RPCs onto the Usage page snapshot.
 *
 * Transcript buckets stay the source of token cost. This snapshot is the
 * live Plus/Pro window the Codex app itself shows.
 *
 * @module codexAccountUsage
 */
import type { CodexAccountUsageSnapshot } from "@t3tools/contracts";

export interface CodexAccountWindowInput {
  readonly usedPercent?: number | null;
  readonly windowDurationMins?: number | null;
  readonly resetsAt?: number | null;
}

export interface CodexAccountUsageInput {
  readonly planType?: string | null;
  readonly lifetimeTokens?: number | null;
  readonly primary?: CodexAccountWindowInput | null;
  readonly secondary?: CodexAccountWindowInput | null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeInt(value: number | null | undefined): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? Math.trunc(parsed) : null;
}

export function unavailableCodexAccountUsage(message: string): CodexAccountUsageSnapshot {
  return {
    status: "unavailable",
    planType: null,
    primaryUsedPercent: null,
    primaryWindowMinutes: null,
    primaryResetsAt: null,
    secondaryUsedPercent: null,
    secondaryWindowMinutes: null,
    secondaryResetsAt: null,
    lifetimeTokens: null,
    message,
  };
}

export function mapCodexAccountUsage(input: CodexAccountUsageInput): CodexAccountUsageSnapshot {
  const primary = input.primary;
  const secondary = input.secondary;
  const planType = input.planType?.trim() || null;
  const hasWindow =
    finiteNumber(primary?.usedPercent) !== null || finiteNumber(secondary?.usedPercent) !== null;
  const lifetimeTokens = nonNegativeInt(input.lifetimeTokens);
  if (!hasWindow && lifetimeTokens === null && planType === null) {
    return unavailableCodexAccountUsage("Codex did not report account usage.");
  }
  return {
    status: "ok",
    planType,
    primaryUsedPercent: finiteNumber(primary?.usedPercent),
    primaryWindowMinutes: nonNegativeInt(primary?.windowDurationMins),
    primaryResetsAt: finiteNumber(primary?.resetsAt),
    secondaryUsedPercent: finiteNumber(secondary?.usedPercent),
    secondaryWindowMinutes: nonNegativeInt(secondary?.windowDurationMins),
    secondaryResetsAt: finiteNumber(secondary?.resetsAt),
    lifetimeTokens,
    message: null,
  };
}
