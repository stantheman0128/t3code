// @effect-diagnostics globalFetchInEffect:off
// @effect-diagnostics globalErrorInEffectCatch:off
// @effect-diagnostics globalErrorInEffectFailure:off
/**
 * OpenCode Go remaining quota from the official zen/go usage endpoint.
 *
 * @module openCodeUsage
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderUsageLimits } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { mapOpenCodeGoUsage, remoteUsageProbesEnabled } from "./providerUsageLimits.ts";

const OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const OPENCODE_USAGE_TIMEOUT_MS = 3_000;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function openCodeGoApiKeyFromDocument(document: unknown): string | undefined {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return undefined;
  }
  const record = document as Record<string, unknown>;
  for (const slot of ["opencode-go", "opencode"] as const) {
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

export function openCodeAuthFileCandidates(
  homeDir: string,
  environment: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<string> {
  const files = [
    join(homeDir, ".local", "share", "opencode", "auth.json"),
    join(homeDir, ".config", "opencode", "auth.json"),
  ];
  const xdgData = nonEmptyString(environment.XDG_DATA_HOME);
  if (xdgData) {
    files.push(join(xdgData, "opencode", "auth.json"));
  }
  const localAppData = nonEmptyString(environment.LOCALAPPDATA);
  if (localAppData) {
    files.push(join(localAppData, "opencode", "auth.json"));
  }
  return files;
}

function readOpenCodeGoApiKey(environment: NodeJS.ProcessEnv): string | undefined {
  const fromEnv = nonEmptyString(environment.OPENCODE_API_KEY);
  if (fromEnv) {
    return fromEnv;
  }
  const homeDir =
    nonEmptyString(environment.HOME) ?? nonEmptyString(environment.USERPROFILE) ?? homedir();
  for (const filePath of openCodeAuthFileCandidates(homeDir, environment)) {
    try {
      const raw = readFileSync(filePath, "utf8");
      const key = openCodeGoApiKeyFromDocument(JSON.parse(raw) as unknown);
      if (key) {
        return key;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

const fetchOpenCodeGoUsage = (token: string) =>
  Effect.tryPromise({
    try: async () => {
      // @effect-diagnostics globalFetch:off
      const response = await fetch(OPENCODE_GO_USAGE_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(OPENCODE_USAGE_TIMEOUT_MS),
      });
      if (!response.ok) {
        return undefined;
      }
      return (await response.json()) as unknown;
    },
    catch: () => new Error("opencode-go-usage-fetch-failed"),
  }).pipe(Effect.orElseSucceed((): unknown => undefined));

export const readOpenCodeGoUsageLimits = (environment: NodeJS.ProcessEnv = process.env) =>
  Effect.gen(function* () {
    if (!remoteUsageProbesEnabled(environment)) {
      return undefined;
    }
    const token = readOpenCodeGoApiKey(environment);
    if (!token) {
      return undefined;
    }
    const document = yield* fetchOpenCodeGoUsage(token);
    const usageLimits = mapOpenCodeGoUsage(document, new Date().toISOString(), "OpenCode Go");
    return usageLimits.status === "available" ? usageLimits : undefined;
  });
