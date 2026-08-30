// @effect-diagnostics globalFetchInEffect:off
// @effect-diagnostics globalErrorInEffectCatch:off
// @effect-diagnostics globalErrorInEffectFailure:off
/**
 * Claude remaining quota from the same oauth/usage endpoint Claude Code uses,
 * with a fallback to ~/.claude/usage-state.json when the access token is empty.
 *
 * Tokens stay on disk. This never refreshes them, so it cannot race Claude
 * Code's single-use refresh token.
 *
 * @module claudeUsage
 */
import { join } from "node:path";
import type { ProviderUsageLimits } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import {
  mapClaudeUsageLimits,
  mapClaudeUsageStateDocument,
  remoteUsageProbesEnabled,
} from "./providerUsageLimits.ts";

const decodeUnknownJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

const CLAUDE_OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_OAUTH_USAGE_BETA = "oauth-2025-04-20";
const CLAUDE_USAGE_TIMEOUT_MS = 3_000;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function claudeAccessTokenFromDocument(
  document: unknown,
  nowMs: number = Date.now(),
): string | undefined {
  const root = asRecord(document);
  if (!root) {
    return undefined;
  }
  const oauth =
    asRecord(root.claudeAiOauth) ?? asRecord(root.claude_ai_oauth) ?? asRecord(root.oauth) ?? root;
  const token =
    nonEmptyString(oauth.accessToken) ??
    nonEmptyString(oauth.access_token) ??
    nonEmptyString(root.accessToken) ??
    nonEmptyString(root.access_token);
  if (!token) {
    return undefined;
  }
  const expiresAt = oauth.expiresAt ?? oauth.expires_at ?? root.expiresAt ?? root.expires_at;
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > 0) {
    const expiresMs = expiresAt < 1_000_000_000_000 ? expiresAt * 1_000 : expiresAt;
    if (expiresMs <= nowMs) {
      return undefined;
    }
  }
  return token;
}

export function claudeCredentialsFileCandidates(
  homeDir: string,
  environment: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<string> {
  const files = [join(homeDir, ".credentials.json"), join(homeDir, ".claude", ".credentials.json")];
  const configDir = nonEmptyString(environment.CLAUDE_CONFIG_DIR);
  if (configDir) {
    files.push(join(configDir, ".credentials.json"));
  }
  const userHome = nonEmptyString(environment.HOME) ?? nonEmptyString(environment.USERPROFILE);
  if (userHome) {
    files.push(join(userHome, ".claude", ".credentials.json"));
  }
  return [...new Set(files)];
}

export function claudeUsageStateFileCandidates(
  homeDir: string,
  environment: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<string> {
  const files = [join(homeDir, "usage-state.json"), join(homeDir, ".claude", "usage-state.json")];
  const configDir = nonEmptyString(environment.CLAUDE_CONFIG_DIR);
  if (configDir) {
    files.push(join(configDir, "usage-state.json"));
  }
  const userHome = nonEmptyString(environment.HOME) ?? nonEmptyString(environment.USERPROFILE);
  if (userHome) {
    files.push(join(userHome, ".claude", "usage-state.json"));
  }
  return [...new Set(files)];
}

const readClaudeAccessToken = (input: {
  readonly homeDir: string;
  readonly environment: NodeJS.ProcessEnv;
}) =>
  Effect.gen(function* () {
    const fromEnv = nonEmptyString(input.environment.CLAUDE_CODE_OAUTH_TOKEN);
    if (fromEnv) {
      return fromEnv;
    }
    const fileSystem = yield* FileSystem.FileSystem;
    for (const filePath of claudeCredentialsFileCandidates(input.homeDir, input.environment)) {
      const raw = yield* fileSystem
        .readFileString(filePath)
        .pipe(Effect.orElseSucceed((): string | null => null));
      if (raw === null || raw.trim().length === 0) {
        continue;
      }
      const document = yield* decodeUnknownJson(raw).pipe(Effect.orElseSucceed(() => null));
      const token = claudeAccessTokenFromDocument(document);
      if (token) {
        return token;
      }
    }
    return undefined;
  });

const fetchClaudeOauthUsage = (token: string) =>
  Effect.tryPromise({
    try: async () => {
      // @effect-diagnostics globalFetch:off
      const response = await fetch(CLAUDE_OAUTH_USAGE_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "anthropic-beta": CLAUDE_OAUTH_USAGE_BETA,
        },
        signal: AbortSignal.timeout(CLAUDE_USAGE_TIMEOUT_MS),
      });
      if (!response.ok) {
        return undefined;
      }
      return (await response.json()) as unknown;
    },
    catch: () => new Error("claude-usage-fetch-failed"),
  }).pipe(Effect.orElseSucceed((): unknown => undefined));

const readClaudeUsageStateLimits = (input: {
  readonly homeDir: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly planLabel?: string;
}) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    for (const filePath of claudeUsageStateFileCandidates(input.homeDir, input.environment)) {
      const raw = yield* fileSystem
        .readFileString(filePath)
        .pipe(Effect.orElseSucceed((): string | null => null));
      if (raw === null || raw.trim().length === 0) {
        continue;
      }
      const document = yield* decodeUnknownJson(raw).pipe(Effect.orElseSucceed(() => null));
      const usageLimits = mapClaudeUsageStateDocument(
        document,
        new Date().toISOString(),
        input.planLabel,
      );
      if (usageLimits.status === "available") {
        return usageLimits;
      }
    }
    return undefined;
  });

export const readClaudeUsageLimits = (input: {
  readonly homeDir: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly planLabel?: string;
}): Effect.Effect<ProviderUsageLimits | undefined, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const environment = input.environment ?? process.env;
    if (!remoteUsageProbesEnabled(environment)) {
      return undefined;
    }
    const token = yield* readClaudeAccessToken({
      homeDir: input.homeDir,
      environment,
    });
    if (token) {
      const document = yield* fetchClaudeOauthUsage(token);
      const usageLimits = mapClaudeUsageLimits(document, new Date().toISOString(), input.planLabel);
      if (usageLimits.status === "available") {
        return usageLimits;
      }
    }
    return yield* readClaudeUsageStateLimits({
      homeDir: input.homeDir,
      environment,
      planLabel: input.planLabel,
    });
  });
