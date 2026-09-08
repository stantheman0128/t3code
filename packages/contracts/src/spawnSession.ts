import * as Schema from "effect/Schema";

import { EnvironmentId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

export const SpawnSessionProviderQuery = TrimmedNonEmptyString.check(Schema.isMaxLength(64));

export const SpawnSessionInput = Schema.Struct({
  provider: SpawnSessionProviderQuery,
  prompt: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(32_000))),
});
export type SpawnSessionInput = typeof SpawnSessionInput.Type;

export const SpawnSessionResult = Schema.Struct({
  threadId: ThreadId,
  title: TrimmedNonEmptyString,
  provider: ProviderDriverKind,
  displayName: TrimmedNonEmptyString,
  instanceId: ProviderInstanceId,
  model: TrimmedNonEmptyString,
  startedTurn: Schema.Boolean,
});
export type SpawnSessionResult = typeof SpawnSessionResult.Type;

export const SpawnSessionReadyProvider = Schema.Struct({
  provider: ProviderDriverKind,
  displayName: TrimmedNonEmptyString,
  instanceId: ProviderInstanceId,
  model: TrimmedNonEmptyString,
});
export type SpawnSessionReadyProvider = typeof SpawnSessionReadyProvider.Type;

export const SpawnSessionListResult = Schema.Struct({
  providers: Schema.Array(SpawnSessionReadyProvider),
});
export type SpawnSessionListResult = typeof SpawnSessionListResult.Type;

export const SpawnSessionErrorCode = Schema.Literals([
  "unavailable",
  "unknown_provider",
  "provider_not_ready",
  "no_project",
  "dispatch_failed",
]);
export type SpawnSessionErrorCode = typeof SpawnSessionErrorCode.Type;

export class SpawnSessionError extends Schema.TaggedError<SpawnSessionError>()(
  "SpawnSessionError",
  {
    code: SpawnSessionErrorCode,
    detail: TrimmedNonEmptyString,
    environmentId: EnvironmentId,
    sourceThreadId: ThreadId,
    providerSessionId: TrimmedNonEmptyString,
    providerInstanceId: ProviderInstanceId,
  },
) {
  override get message(): string {
    return this.detail;
  }
}
