// @effect-diagnostics globalFetchInEffect:off
// @effect-diagnostics globalErrorInEffectCatch:off
// @effect-diagnostics globalErrorInEffectFailure:off
/**
 * Cursor remaining quota from the same DashboardService the Agent CLI uses.
 *
 * Tokens stay on disk. This only copies remaining windows onto the provider
 * snapshot so Settings can show subscription leftover the same way Claude
 * and Codex do.
 *
 * @module cursorUsage
 */
import { join } from "node:path";
import type { ProviderUsageLimits } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { mapCursorPeriodUsage, remoteUsageProbesEnabled } from "./providerUsageLimits.ts";

const decodeUnknownJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

const CURSOR_PERIOD_USAGE_URL =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
const CURSOR_USAGE_TIMEOUT_MS = 3_000;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function cursorAccessTokenFromDocument(document: unknown): string | undefined {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return undefined;
  }
  const record = document as Record<string, unknown>;
  return (
    nonEmptyString(record.accessToken) ??
    nonEmptyString(record.access_token) ??
    nonEmptyString(record.token)
  );
}

export function cursorAuthFileCandidates(
  homeDir: string,
  environment: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<string> {
  const files = [
    join(homeDir, ".cursor", "auth.json"),
    join(homeDir, ".config", "cursor", "auth.json"),
    join(homeDir, "Library", "Application Support", "Cursor", "auth.json"),
  ];
  const appData = nonEmptyString(environment.APPDATA);
  if (appData) {
    files.push(join(appData, "Cursor", "auth.json"));
  }
  const xdg = nonEmptyString(environment.XDG_CONFIG_HOME);
  if (xdg) {
    files.push(join(xdg, "cursor", "auth.json"));
  }
  return files;
}

const readCursorAccessToken = (environment: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const homeDir = nonEmptyString(environment.HOME) ?? nonEmptyString(environment.USERPROFILE);
    if (!homeDir) {
      return undefined;
    }
    for (const filePath of cursorAuthFileCandidates(homeDir, environment)) {
      const raw = yield* fileSystem
        .readFileString(filePath)
        .pipe(Effect.orElseSucceed((): string | null => null));
      if (raw === null || raw.trim().length === 0) {
        continue;
      }
      const document = yield* decodeUnknownJson(raw).pipe(Effect.orElseSucceed(() => null));
      const token = cursorAccessTokenFromDocument(document);
      if (token) {
        return token;
      }
    }
    return undefined;
  });

const fetchCursorCurrentPeriodUsage = (token: string) =>
  Effect.tryPromise({
    try: async () => {
      // @effect-diagnostics globalFetch:off
      const response = await fetch(CURSOR_PERIOD_USAGE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
        },
        body: "{}",
        signal: AbortSignal.timeout(CURSOR_USAGE_TIMEOUT_MS),
      });
      if (!response.ok) {
        return undefined;
      }
      return (await response.json()) as unknown;
    },
    catch: () => new Error("cursor-usage-fetch-failed"),
  }).pipe(Effect.orElseSucceed((): unknown => undefined));

export const readCursorUsageLimits = (input: {
  readonly environment?: NodeJS.ProcessEnv;
  readonly planLabel?: string;
}): Effect.Effect<ProviderUsageLimits | undefined, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const environment = input.environment ?? process.env;
    if (!remoteUsageProbesEnabled(environment)) {
      return undefined;
    }
    const token = yield* readCursorAccessToken(environment);
    if (!token) {
      return undefined;
    }
    const document = yield* fetchCursorCurrentPeriodUsage(token);
    const usageLimits = mapCursorPeriodUsage(document, new Date().toISOString(), input.planLabel);
    return usageLimits.status === "available" ? usageLimits : undefined;
  });
