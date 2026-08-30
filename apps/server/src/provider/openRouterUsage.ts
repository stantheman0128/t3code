// @effect-diagnostics globalFetchInEffect:off
// @effect-diagnostics globalErrorInEffectCatch:off
// @effect-diagnostics globalErrorInEffectFailure:off
/**
 * OpenRouter remaining credits from GET /api/v1/key.
 *
 * @module openRouterUsage
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { ProviderUsageLimits } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { openCodeAuthFileCandidates } from "./openCodeUsage.ts";
import { mapOpenRouterKeyUsage, remoteUsageProbesEnabled } from "./providerUsageLimits.ts";

const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";
const OPENROUTER_USAGE_TIMEOUT_MS = 3_000;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function openRouterApiKeyFromDocument(document: unknown): string | undefined {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return undefined;
  }
  const record = document as Record<string, unknown>;
  for (const slot of ["openrouter", "OpenRouter"] as const) {
    const entry = record[slot];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const key = nonEmptyString((entry as { key?: unknown }).key);
    if (key) {
      return key;
    }
  }
  return undefined;
}

function readOpenRouterApiKey(environment: NodeJS.ProcessEnv): string | undefined {
  const fromEnv = nonEmptyString(environment.OPENROUTER_API_KEY);
  if (fromEnv) {
    return fromEnv;
  }
  const homeDir =
    nonEmptyString(environment.HOME) ?? nonEmptyString(environment.USERPROFILE) ?? homedir();
  for (const filePath of openCodeAuthFileCandidates(homeDir, environment)) {
    try {
      const raw = readFileSync(filePath, "utf8");
      const key = openRouterApiKeyFromDocument(JSON.parse(raw) as unknown);
      if (key) {
        return key;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

const fetchOpenRouterKeyUsage = (token: string) =>
  Effect.tryPromise({
    try: async () => {
      // @effect-diagnostics globalFetch:off
      const response = await fetch(OPENROUTER_KEY_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(OPENROUTER_USAGE_TIMEOUT_MS),
      });
      if (!response.ok) {
        return undefined;
      }
      return (await response.json()) as unknown;
    },
    catch: () => new Error("openrouter-usage-fetch-failed"),
  }).pipe(Effect.orElseSucceed((): unknown => undefined));

export const readOpenRouterUsageLimits = (environment: NodeJS.ProcessEnv = process.env) =>
  Effect.gen(function* () {
    if (!remoteUsageProbesEnabled(environment)) {
      return undefined;
    }
    const token = readOpenRouterApiKey(environment);
    if (!token) {
      return undefined;
    }
    const document = yield* fetchOpenRouterKeyUsage(token);
    const usageLimits = mapOpenRouterKeyUsage(document, new Date().toISOString(), "OpenRouter");
    return usageLimits.status === "available" ? usageLimits : undefined;
  });
