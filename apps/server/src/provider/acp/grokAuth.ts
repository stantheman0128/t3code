// @effect-diagnostics globalFetchInEffect:off
// @effect-diagnostics globalErrorInEffectCatch:off
// @effect-diagnostics globalErrorInEffectFailure:off
/**
 * Grok login identity from `~/.grok/auth.json`.
 *
 * Tokens stay on disk. This only copies email and a coarse plan label so
 * Settings can show Authenticated as the same way Claude and Codex do.
 *
 * @module grokAuth
 */
import type { ProviderUsageLimits, ServerProviderAuth } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { mapGrokBillingDocument, remoteUsageProbesEnabled } from "../providerUsageLimits.ts";

const decodeUnknownJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

export interface GrokAuthRecord {
  readonly email?: unknown;
  readonly team_id?: unknown;
  readonly principal_type?: unknown;
  readonly auth_mode?: unknown;
  readonly key?: unknown;
  readonly subscription_tier?: unknown;
  readonly subscription_tier_display?: unknown;
  readonly plan?: unknown;
}

const GROK_SETTINGS_URL = "https://cli-chat-proxy.grok.com/v1/settings";
const GROK_BILLING_CREDITS_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
const GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing";
const GROK_SETTINGS_TIMEOUT_MS = 2_000;

function grokProxyHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "x-xai-token-auth": "xai-grok-cli",
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function grokPlanLabelFromUnknown(value: unknown): string | undefined {
  const raw = nonEmptyString(value);
  if (!raw) {
    return undefined;
  }
  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized.includes("heavy")) {
    return "SuperGrok Heavy";
  }
  if (normalized.includes("plus")) {
    return "SuperGrok Plus";
  }
  if (normalized.includes("lite")) {
    return "SuperGrok Lite";
  }
  if (normalized.includes("supergrok") || normalized === "pro" || normalized === "paid") {
    return "SuperGrok";
  }
  if (normalized === "free") {
    return "Free";
  }
  if (normalized === "team" || normalized.includes("team")) {
    return "Grok Team";
  }
  return raw;
}

export function grokAuthLabel(record: GrokAuthRecord): string {
  const mode = nonEmptyString(record.auth_mode)?.toLowerCase();
  if (mode === "api_key" || mode === "api-key") {
    return "XAI_API_KEY";
  }
  const plan =
    grokPlanLabelFromUnknown(record.subscription_tier_display) ??
    grokPlanLabelFromUnknown(record.subscription_tier) ??
    grokPlanLabelFromUnknown(record.plan);
  if (plan) {
    return plan;
  }
  // grok.com OIDC always has a team_id, including personal User accounts.
  const principal = nonEmptyString(record.principal_type)?.toLowerCase();
  if (principal !== undefined && principal !== "user") {
    return "Grok Team";
  }
  return "grok.com";
}

export function grokBearerToken(document: unknown): string | undefined {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return undefined;
  }
  for (const value of Object.values(document as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const token = nonEmptyString((value as GrokAuthRecord).key);
    if (token) {
      return token;
    }
  }
  return undefined;
}

function grokPlanLabelFromSettingsDocument(document: unknown): string | undefined {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return undefined;
  }
  const record = document as Record<string, unknown>;
  return (
    grokPlanLabelFromUnknown(record.subscription_tier_display) ??
    grokPlanLabelFromUnknown(record.subscriptionTierDisplay) ??
    grokPlanLabelFromUnknown(record.subscription_tier) ??
    grokPlanLabelFromUnknown(record.subscriptionTier)
  );
}

const fetchGrokJson = (url: string, token: string) =>
  Effect.tryPromise({
    try: async () => {
      // @effect-diagnostics globalFetch:off
      const response = await fetch(url, {
        headers: grokProxyHeaders(token),
        signal: AbortSignal.timeout(GROK_SETTINGS_TIMEOUT_MS),
      });
      if (!response.ok) {
        return undefined;
      }
      return (await response.json()) as unknown;
    },
    catch: () => new Error("grok-proxy-fetch-failed"),
  }).pipe(Effect.orElseSucceed((): unknown => undefined));

const fetchGrokSettingsDocument = (token: string) => fetchGrokJson(GROK_SETTINGS_URL, token);

const fetchGrokBillingDocument = (token: string) =>
  Effect.gen(function* () {
    const [credits, billing] = yield* Effect.all(
      [fetchGrokJson(GROK_BILLING_CREDITS_URL, token), fetchGrokJson(GROK_BILLING_URL, token)],
      { concurrency: "unbounded" },
    );
    // Unified-billing SuperGrok accounts return an empty credits payload with
    // no remaining percent. Prefer whichever document actually maps to bars.
    const creditsLimits = mapGrokBillingDocument(credits, new Date(0).toISOString());
    if (creditsLimits.status === "available") {
      return credits;
    }
    return billing ?? credits;
  });

export function parseGrokAuthFile(document: unknown): ServerProviderAuth | null {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return null;
  }
  for (const value of Object.values(document as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const record = value as GrokAuthRecord;
    const email = nonEmptyString(record.email);
    if (!email || !email.includes("@")) {
      continue;
    }
    return {
      status: "authenticated",
      type: "session",
      label: grokAuthLabel(record),
      email,
    };
  }
  return null;
}

export interface GrokAuthSnapshot {
  readonly auth: ServerProviderAuth;
  readonly usageLimits?: ProviderUsageLimits;
}

export const readGrokAuthSnapshotFromHome = (homeDir: string | undefined) =>
  Effect.gen(function* () {
    const resolvedHome = homeDir?.trim();
    if (!resolvedHome) return null;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const raw = yield* fileSystem
      .readFileString(path.join(resolvedHome, ".grok", "auth.json"))
      .pipe(Effect.orElseSucceed((): string | null => null));
    if (raw === null || raw.trim().length === 0) {
      return null;
    }
    const document = yield* decodeUnknownJson(raw).pipe(Effect.orElseSucceed(() => null));
    if (document === null) {
      return null;
    }
    const parsed = parseGrokAuthFile(document);
    if (parsed === null) {
      return null;
    }
    const token = grokBearerToken(document);
    if (!token || parsed.label === "XAI_API_KEY" || !remoteUsageProbesEnabled()) {
      return { auth: parsed } satisfies GrokAuthSnapshot;
    }
    const [settings, billing] = yield* Effect.all(
      [fetchGrokSettingsDocument(token), fetchGrokBillingDocument(token)],
      { concurrency: "unbounded" },
    );
    const plan = grokPlanLabelFromSettingsDocument(settings) ?? parsed.label;
    const observedAt = new Date().toISOString();
    const usageLimits = mapGrokBillingDocument(billing, observedAt, plan);
    return {
      auth: { ...parsed, label: plan },
      ...(usageLimits.status === "available" ? { usageLimits } : {}),
    } satisfies GrokAuthSnapshot;
  });

export const readGrokAuthFromHome = (homeDir: string | undefined) =>
  readGrokAuthSnapshotFromHome(homeDir).pipe(Effect.map((snapshot) => snapshot?.auth ?? null));
