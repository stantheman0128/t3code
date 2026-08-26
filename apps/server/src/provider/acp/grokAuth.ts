/**
 * Grok login identity from `~/.grok/auth.json`.
 *
 * Tokens stay on disk. This only copies email and a coarse plan label so
 * Settings can show Authenticated as the same way Claude and Codex do.
 *
 * @module grokAuth
 */
import type { ServerProviderAuth } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const decodeUnknownJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

export interface GrokAuthRecord {
  readonly email?: unknown;
  readonly team_id?: unknown;
  readonly principal_type?: unknown;
  readonly auth_mode?: unknown;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function grokAuthLabel(record: GrokAuthRecord): string {
  const mode = nonEmptyString(record.auth_mode)?.toLowerCase();
  if (mode === "api_key" || mode === "api-key") {
    return "XAI_API_KEY";
  }
  // grok.com OIDC always has a team_id, including personal User accounts.
  const principal = nonEmptyString(record.principal_type)?.toLowerCase();
  if (principal !== undefined && principal !== "user") {
    return "Grok Team";
  }
  return "grok.com";
}

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

export const readGrokAuthFromHome = (homeDir: string | undefined) =>
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
    return document === null ? null : parseGrokAuthFile(document);
  });
