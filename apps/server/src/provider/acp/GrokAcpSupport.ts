import {
  type GrokSettings,
  type ModelCapabilities,
  type ModelSelection,
  type ProviderInteractionMode,
  ProviderDriverKind,
  type RuntimeMode,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as EffectAcpSchema from "effect-acp/schema";
import {
  createModelCapabilities,
  getModelSelectionBooleanOptionValue,
  getModelSelectionStringOptionValue,
  normalizeModelSlug,
} from "@t3tools/shared/model";

import type { AcpSessionMode, AcpSessionModeState } from "./AcpRuntimeModel.ts";
import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";
import { makeXAiPromptCompletionRuntime } from "./XAiAcpExtension.ts";

const GROK_API_KEY_ENV = "XAI_API_KEY";
const GROK_OAUTH2_REFERRER_ENV = "GROK_OAUTH2_REFERRER";
const T3_CODE_OAUTH_REFERRER = "t3code";
const GROK_AUTH_METHOD_API_KEY = "xai.api_key";
const GROK_AUTH_METHOD_CACHED_TOKEN = "cached_token";
const GROKBOT_AUTH_METHOD_AGENT = "agent";
const GROK_DRIVER_KIND = ProviderDriverKind.make("grok");

/** Composer option id for Grok reasoning effort. Same shape as Codex. */
export const GROK_REASONING_EFFORT_OPTION_ID = "reasoningEffort";
/** Composer option id for xAI priority / Fast Mode. Same id as Claude and Cursor. */
export const GROK_FAST_MODE_OPTION_ID = "fastMode";

const GROK_SPAWN_EFFORT_LEVELS = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);
const GROK_REASONING_EFFORT_TOKEN = /^[a-z0-9][a-z0-9._-]{0,31}$/i;

export function grokAcpSpawnArgs(runtimeMode?: RuntimeMode): ReadonlyArray<string> {
  switch (runtimeMode) {
    case "approval-required":
      return ["--permission-mode", "default", "agent", "stdio"];
    case "auto-accept-edits":
      return ["--permission-mode", "acceptEdits", "agent", "stdio"];
    case "auto":
      return ["--permission-mode", "auto", "agent", "stdio"];
    case "full-access":
      return ["agent", "--always-approve", "stdio"];
    default:
      return ["agent", "stdio"];
  }
}

export function isValidGrokReasoningEffortToken(value: string): boolean {
  return GROK_REASONING_EFFORT_TOKEN.test(value);
}

export function normalizeGrokReasoningEffort(value: string | undefined): string | undefined {
  const effort = value?.trim();
  return effort && isValidGrokReasoningEffortToken(effort) ? effort : undefined;
}

export const FALLBACK_GROK_REASONING_EFFORTS = [
  { id: "xhigh", label: "Extra High", description: "Highest effort and reasoning level" },
  { id: "high", label: "High", description: "Higher implementation quality", isDefault: true },
  { id: "medium", label: "Medium", description: "Balanced effort" },
  { id: "low", label: "Low", description: "Quick implementations" },
] as const;

type GrokAcpRuntimeGrokSettings = Pick<GrokSettings, "binaryPath"> &
  Partial<Pick<GrokSettings, "useGrokbotBackend" | "grokbotBinaryPath">>;

interface GrokAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly grokSettings: GrokAcpRuntimeGrokSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
  readonly reasoningEffort?: string;
  readonly runtimeMode?: RuntimeMode;
}

export interface GrokReasoningEffortChoice {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly isDefault?: boolean;
}

export interface GrokAcpModelMeta {
  readonly supportsReasoningEffort: boolean;
  readonly reasoningEffort?: string;
  readonly reasoningEfforts: ReadonlyArray<GrokReasoningEffortChoice>;
  readonly supportsFastMode: boolean;
  readonly fastMode?: boolean;
  readonly totalContextTokens?: number;
}

export interface GrokAcpSelection {
  readonly modelId: string | undefined;
  readonly reasoningEffort: string | undefined;
  readonly fastMode: boolean | undefined;
}

export function buildGrokAcpSpawnInput(
  grokSettings: GrokAcpRuntimeGrokSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
  runtimeMode?: RuntimeMode,
  reasoningEffort?: string,
): AcpSessionRuntime.AcpSpawnInput {
  if (grokSettings?.useGrokbotBackend) {
    return {
      command: grokSettings.grokbotBinaryPath || "omp",
      args: ["--models", "grokbot/*", "acp"],
      cwd,
      ...(environment ? { env: environment } : {}),
    };
  }
  const args = [...grokAcpSpawnArgs(runtimeMode)];
  const spawnEffort = spawnableGrokReasoningEffort(reasoningEffort);
  if (spawnEffort) {
    const stdioAt = args.lastIndexOf("stdio");
    if (stdioAt >= 0) {
      args.splice(stdioAt, 0, "--reasoning-effort", spawnEffort);
    } else {
      args.push("--reasoning-effort", spawnEffort);
    }
  }
  return {
    command: grokSettings?.binaryPath || "grok",
    args,
    cwd,
    env: {
      ...environment,
      [GROK_OAUTH2_REFERRER_ENV]: T3_CODE_OAUTH_REFERRER,
    },
  };
}

export function resolveGrokAuthMethodId(
  environment: NodeJS.ProcessEnv | undefined,
  useGrokbotBackend = false,
): string {
  if (useGrokbotBackend) {
    return GROKBOT_AUTH_METHOD_AGENT;
  }
  return environment?.[GROK_API_KEY_ENV]?.trim()
    ? GROK_AUTH_METHOD_API_KEY
    : GROK_AUTH_METHOD_CACHED_TOKEN;
}

export const makeGrokAcpRuntime = (
  input: GrokAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildGrokAcpSpawnInput(
          input.grokSettings,
          input.cwd,
          input.environment,
          input.runtimeMode,
          input.reasoningEffort,
        ),
        authMethodId: resolveGrokAuthMethodId(
          input.environment,
          input.grokSettings?.useGrokbotBackend,
        ),
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    const runtime = yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
    return yield* makeXAiPromptCompletionRuntime(runtime);
  });

export function resolveGrokAcpBaseModelId(model: string | null | undefined): string {
  const trimmed = model?.trim();
  const base = trimmed && trimmed.length > 0 ? trimmed : "grok-4.6";
  return normalizeModelSlug(base, GROK_DRIVER_KIND) ?? "grok-4.6";
}

/** T3 product slugs that Grok ACP `session/set_model` does not accept. */
const GROK_PRODUCT_MODEL_ALIASES = new Set([
  "grok-build",
  "grok-code",
  "grok-code-fast-1",
  "grok-4.6",
  "grok-4.5",
]);

const GROK_FAMILY_ACP_PREFIXES = [
  "grokbot/",
  "xai/",
  "xai-oauth/",
  "xai-grok-build/",
  "grok-cli/",
] as const;

/**
 * Grok Bot ids T3 will put in the picker. Live omp catalogs are huge and mix
 * unusable rows (Mistral, sand-cua, cursor-grok-*).
 */
const GROKBOT_PICKER_BARE_IDS = new Set([
  "sand-default",
  "sand-automation",
  "grok-4.6",
  "grok-4.5",
]);

export function grokBotPickerBareId(modelId: string): string {
  const slug = modelId.trim().toLowerCase();
  return slug.startsWith("grokbot/") ? slug.slice("grokbot/".length) : slug;
}

export function isGrokBotPickerModelId(modelId: string): boolean {
  return GROKBOT_PICKER_BARE_IDS.has(grokBotPickerBareId(modelId));
}

const GROK_CLI_PICKER_BARE_IDS = new Set(["grok-4.6", "grok-4.5"]);
const GROK_CLI_PICKER_PREFIXES = ["grok-cli/", "xai/", "xai-oauth/", "xai-grok-build/"] as const;

export function grokCliPickerBareId(modelId: string): string {
  const slug = modelId.trim().toLowerCase();
  for (const prefix of GROK_CLI_PICKER_PREFIXES) {
    if (slug.startsWith(prefix)) {
      return slug.slice(prefix.length);
    }
  }
  return slug;
}

/** Official Grok CLI picker: only 4.6 and 4.5. Drops grok-build, OCX, and other aliases. */
export function isGrokCliPickerModelId(modelId: string): boolean {
  return GROK_CLI_PICKER_BARE_IDS.has(grokCliPickerBareId(modelId));
}

/** True for Grok / Grok Bot ids. False for OMP's other providers (mistral/, anthropic/, ...). */
export function isGrokFamilyAcpModelId(modelId: string): boolean {
  const slug = modelId.trim().toLowerCase();
  if (GROK_FAMILY_ACP_PREFIXES.some((prefix) => slug.startsWith(prefix))) {
    return true;
  }
  if (slug.includes("/")) {
    return false;
  }
  return slug.startsWith("grok") || slug.startsWith("sand-");
}

export function availableGrokSessionModelIds(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): ReadonlyArray<string> {
  const advertised = (sessionSetupResult.models?.availableModels ?? [])
    .map((model) => model.modelId.trim())
    .filter((modelId) => modelId.length > 0);
  if (advertised.length > 0) {
    return advertised;
  }
  const modelOption = sessionSetupResult.configOptions?.find(
    (option) => option.id === "model" && option.type === "select",
  );
  if (modelOption?.type !== "select") {
    return [];
  }
  return modelOption.options
    .flatMap((option) => ("value" in option ? [option] : option.options))
    .map((option) => option.value.trim())
    .filter((modelId) => modelId.length > 0);
}

/**
 * Map a composer selection onto an id `session/set_model` will accept.
 * `grok-build` is T3's product name; live Grok ACP ids are `grok-4.6` / `grok-4.5`.
 */
export function resolveGrokSessionModelId(input: {
  readonly requested: string | undefined;
  readonly current: string | undefined;
  readonly availableIds: ReadonlyArray<string>;
}): string | undefined {
  const available = input.availableIds.filter((id) => id.length > 0);
  if (available.length === 0) {
    return input.current;
  }
  if (input.requested && available.includes(input.requested)) {
    return input.requested;
  }
  if (input.requested) {
    const requested = input.requested;
    const prefixed = available.find(
      (id) => id.endsWith(`/${requested}`) || id === `grokbot/${requested}`,
    );
    if (prefixed) {
      return prefixed;
    }
  }
  if (
    input.requested &&
    !GROK_PRODUCT_MODEL_ALIASES.has(input.requested) &&
    !available.includes(input.requested)
  ) {
    // Custom / unknown slug: still try the requested id so set_model can fail loudly.
    return input.requested;
  }
  if (input.current && available.includes(input.current)) {
    return input.current;
  }
  return available[0];
}

export function currentGrokModelIdFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): string | undefined {
  const currentModelId = sessionSetupResult.models?.currentModelId?.trim();
  if (currentModelId) {
    return currentModelId;
  }
  const modelOption = sessionSetupResult.configOptions?.find(
    (option) => option.id === "model" && option.type === "select",
  );
  return modelOption?.type === "select" && typeof modelOption.currentValue === "string"
    ? modelOption.currentValue.trim() || undefined
    : undefined;
}

export function spawnableGrokReasoningEffort(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !GROK_SPAWN_EFFORT_LEVELS.has(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseGrokReasoningEffortChoice(value: unknown): GrokReasoningEffortChoice | undefined {
  if (typeof value === "string") {
    const id = value.trim();
    return id.length > 0 ? { id, label: id } : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const id = trimmedString(value.value) ?? trimmedString(value.id);
  if (!id) {
    return undefined;
  }
  const label = trimmedString(value.label) ?? trimmedString(value.name) ?? id;
  const description = trimmedString(value.description);
  return {
    id,
    label,
    ...(description ? { description } : {}),
    ...(value.default === true || value.isDefault === true ? { isDefault: true } : {}),
  };
}

/** Reads the per-model effort menu Grok stamps onto ACP `models._meta`. */
export function parseGrokAcpModelMeta(meta: unknown): GrokAcpModelMeta {
  if (!isRecord(meta)) {
    return { supportsReasoningEffort: false, reasoningEfforts: [], supportsFastMode: true };
  }

  const reasoningEfforts = Array.isArray(meta.reasoningEfforts)
    ? meta.reasoningEfforts.flatMap((entry) => {
        const choice = parseGrokReasoningEffortChoice(entry);
        return choice ? [choice] : [];
      })
    : [];
  const unique = new Map<string, GrokReasoningEffortChoice>();
  for (const choice of reasoningEfforts) {
    if (!unique.has(choice.id)) {
      unique.set(choice.id, choice);
    }
  }
  const choices = [...unique.values()];
  const current = trimmedString(meta.reasoningEffort);
  const defaultId = current ?? choices.find((choice) => choice.isDefault)?.id;
  const supportsReasoningEffort = meta.supportsReasoningEffort === true || choices.length > 0;
  const serviceTier = trimmedString(meta.serviceTier) ?? trimmedString(meta.service_tier);
  const fastModeFromMeta =
    meta.fastMode === true || meta.fast_mode === true
      ? true
      : meta.fastMode === false || meta.fast_mode === false
        ? false
        : serviceTier === "priority" || serviceTier === "fast"
          ? true
          : serviceTier === "default"
            ? false
            : undefined;
  const supportsFastMode = meta.supportsFastMode !== false && meta.supports_fast_mode !== false;
  const totalContextTokens =
    typeof meta.totalContextTokens === "number" &&
    Number.isFinite(meta.totalContextTokens) &&
    meta.totalContextTokens > 0
      ? Math.trunc(meta.totalContextTokens)
      : undefined;

  return {
    supportsReasoningEffort,
    ...(current ? { reasoningEffort: current } : {}),
    reasoningEfforts: choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      ...(choice.description ? { description: choice.description } : {}),
      ...(choice.id === defaultId ? { isDefault: true } : {}),
    })),
    supportsFastMode,
    ...(fastModeFromMeta !== undefined ? { fastMode: fastModeFromMeta } : {}),
    ...(totalContextTokens !== undefined ? { totalContextTokens } : {}),
  };
}

function grokFastModeDescriptor(currentValue?: boolean): {
  readonly id: typeof GROK_FAST_MODE_OPTION_ID;
  readonly label: "Fast Mode";
  readonly type: "boolean";
  readonly currentValue?: boolean;
} {
  return {
    id: GROK_FAST_MODE_OPTION_ID,
    label: "Fast Mode",
    type: "boolean",
    ...(currentValue !== undefined ? { currentValue } : {}),
  };
}

export function grokReasoningEffortCapabilities(
  efforts: ReadonlyArray<GrokReasoningEffortChoice>,
  fastMode?: { readonly include: boolean; readonly currentValue?: boolean },
): ModelCapabilities {
  const includeFastMode = fastMode?.include !== false;
  const defaultEffortId = efforts.find((choice) => choice.isDefault)?.id ?? efforts[0]?.id;
  const effortDescriptors =
    efforts.length === 0
      ? []
      : [
          {
            id: GROK_REASONING_EFFORT_OPTION_ID,
            label: "Reasoning",
            type: "select" as const,
            options: efforts.map((choice) => ({
              id: choice.id,
              label: choice.label,
              ...(choice.description ? { description: choice.description } : {}),
              ...(choice.isDefault ? { isDefault: true } : {}),
            })),
            ...(defaultEffortId ? { currentValue: defaultEffortId } : {}),
          },
        ];
  const optionDescriptors = [
    ...effortDescriptors,
    ...(includeFastMode ? [grokFastModeDescriptor(fastMode?.currentValue)] : []),
  ];
  return createModelCapabilities({ optionDescriptors });
}

export function fallbackGrokReasoningEffortCapabilities(): ModelCapabilities {
  return grokReasoningEffortCapabilities([...FALLBACK_GROK_REASONING_EFFORTS]);
}

export function requestedGrokFastMode(
  modelSelection: ModelSelection | null | undefined,
): boolean | undefined {
  return getModelSelectionBooleanOptionValue(modelSelection, GROK_FAST_MODE_OPTION_ID);
}

export function requestedGrokReasoningEffort(
  modelSelection: ModelSelection | null | undefined,
  advertised: ReadonlyArray<string>,
): string | undefined {
  const requested = getModelSelectionStringOptionValue(
    modelSelection,
    GROK_REASONING_EFFORT_OPTION_ID,
  )?.trim();
  if (!requested) {
    return undefined;
  }
  // Before ACP discovery the advertised menu is empty. Accept spawnable
  // levels so `--reasoning-effort` still reaches the Grok process.
  if (advertised.length === 0) {
    return spawnableGrokReasoningEffort(requested);
  }
  if (advertised.includes(requested)) {
    return requested;
  }
  return undefined;
}

export function grokDiscoveredModelCapabilities(meta: GrokAcpModelMeta): ModelCapabilities {
  const fastMode = { include: meta.supportsFastMode, currentValue: meta.fastMode };
  if (meta.reasoningEfforts.length > 0) {
    return grokReasoningEffortCapabilities(meta.reasoningEfforts, fastMode);
  }
  if (meta.supportsReasoningEffort) {
    return grokReasoningEffortCapabilities([...FALLBACK_GROK_REASONING_EFFORTS], fastMode);
  }
  if (meta.supportsFastMode) {
    return grokReasoningEffortCapabilities([], fastMode);
  }
  return createModelCapabilities({ optionDescriptors: [] });
}

export function grokMaxTokensByModelFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): Map<string, number> {
  const maxTokens = new Map<string, number>();
  for (const model of sessionSetupResult.models?.availableModels ?? []) {
    const tokens = parseGrokAcpModelMeta(model._meta).totalContextTokens;
    if (tokens === undefined) {
      continue;
    }
    const slug = resolveGrokAcpBaseModelId(model.modelId);
    maxTokens.set(slug, tokens);
    maxTokens.set(model.modelId, tokens);
  }
  return maxTokens;
}

export function grokReasoningEffortMenusFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): Map<string, ReadonlyArray<string>> {
  const menus = new Map<string, ReadonlyArray<string>>();
  for (const model of sessionSetupResult.models?.availableModels ?? []) {
    const slug = resolveGrokAcpBaseModelId(model.modelId);
    const efforts = parseGrokAcpModelMeta(model._meta).reasoningEfforts.map((choice) => choice.id);
    if (efforts.length > 0) {
      menus.set(slug, efforts);
      menus.set(model.modelId, efforts);
    }
  }
  return menus;
}

/**
 * Effort menu for a composer selection. `grok-build` is a product slug; live
 * ACP menus are keyed by `grok-4.6` / `grok-4.5`. Resolve the alias before
 * reading the map so sendTurn does not treat the menu as empty.
 */
export function advertisedGrokReasoningEffortsForModel(input: {
  readonly menus: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly requestedModelId: string | undefined;
  readonly currentModelId: string | undefined;
  readonly availableModelIds: ReadonlyArray<string>;
}): ReadonlyArray<string> {
  const liveId = resolveGrokSessionModelId({
    requested: input.requestedModelId,
    current: input.currentModelId,
    availableIds: input.availableModelIds,
  });
  for (const id of [liveId, input.requestedModelId, input.currentModelId]) {
    if (id && input.menus.has(id)) {
      return input.menus.get(id) ?? [];
    }
  }
  return [];
}

export function advertisedGrokReasoningEffortsFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
  modelId: string | undefined,
): ReadonlyArray<string> {
  return advertisedGrokReasoningEffortsForModel({
    menus: grokReasoningEffortMenusFromSessionSetup(sessionSetupResult),
    requestedModelId: modelId,
    currentModelId: currentGrokModelIdFromSessionSetup(sessionSetupResult),
    availableModelIds: availableGrokSessionModelIds(sessionSetupResult),
  });
}

export function currentGrokReasoningEffortFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): string | undefined {
  const currentModelId = sessionSetupResult.models?.currentModelId;
  const current = sessionSetupResult.models?.availableModels.find(
    (model) => model.modelId === currentModelId,
  );
  return parseGrokAcpModelMeta(current?._meta).reasoningEffort;
}

export function currentGrokFastModeFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): boolean | undefined {
  const currentModelId = sessionSetupResult.models?.currentModelId;
  const current = sessionSetupResult.models?.availableModels.find(
    (model) => model.modelId === currentModelId,
  );
  return parseGrokAcpModelMeta(current?._meta).fastMode;
}

export function currentGrokMaxTokensFromSessionSetup(
  sessionSetupResult:
    | EffectAcpSchema.LoadSessionResponse
    | EffectAcpSchema.NewSessionResponse
    | EffectAcpSchema.ResumeSessionResponse,
): number | undefined {
  const currentModelId = sessionSetupResult.models?.currentModelId;
  const current = sessionSetupResult.models?.availableModels.find(
    (model) => model.modelId === currentModelId,
  );
  return parseGrokAcpModelMeta(current?._meta).totalContextTokens;
}

const isAcpRequestError = Schema.is(EffectAcpErrors.AcpRequestError);
/** ACP JSON-RPC `authRequired` (`AcpRequestError.authRequired`). */
const GROK_ACP_AUTH_REQUIRED_CODE = -32000;

function isGrokAcpAuthRequestError(error: unknown): boolean {
  return (
    isAcpRequestError(error) &&
    (error.method === "authenticate" || error.code === GROK_ACP_AUTH_REQUIRED_CODE)
  );
}

export function isGrokAcpAuthFailure(cause: Cause.Cause<unknown>): boolean {
  return cause.reasons.some(
    (reason) => Cause.isFailReason(reason) && isGrokAcpAuthRequestError(reason.error),
  );
}

export function applyGrokAcpModelSelection<E>(input: {
  readonly runtime: Pick<AcpSessionRuntime.AcpSessionRuntime["Service"], "setSessionModel"> &
    Partial<Pick<AcpSessionRuntime.AcpSessionRuntime["Service"], "setModel">>;
  readonly useConfigModelOption?: boolean;
  readonly currentModelId: string | undefined;
  readonly requestedModelId: string | undefined;
  readonly availableModelIds?: ReadonlyArray<string>;
  readonly currentReasoningEffort?: string | undefined;
  readonly requestedReasoningEffort?: string | undefined;
  readonly currentFastMode?: boolean | undefined;
  readonly requestedFastMode?: boolean | undefined;
  readonly mapError: (cause: EffectAcpErrors.AcpError) => E;
}): Effect.Effect<GrokAcpSelection, E> {
  const requestedModelId =
    input.availableModelIds !== undefined
      ? resolveGrokSessionModelId({
          requested: input.requestedModelId,
          current: input.currentModelId,
          availableIds: input.availableModelIds,
        })
      : input.requestedModelId;
  const modelChanged = requestedModelId !== undefined && requestedModelId !== input.currentModelId;
  const reasoningProvided = input.requestedReasoningEffort !== undefined;
  const reasoningEffort = reasoningProvided
    ? normalizeGrokReasoningEffort(input.requestedReasoningEffort)
    : undefined;
  const reasoningEffortChanged =
    reasoningProvided && reasoningEffort !== input.currentReasoningEffort;
  const fastModeProvided = typeof input.requestedFastMode === "boolean";
  const fastModeChanged = fastModeProvided && input.requestedFastMode !== input.currentFastMode;
  const targetModelId = requestedModelId ?? input.currentModelId;
  if (
    (!modelChanged && !reasoningEffortChanged && !fastModeChanged) ||
    targetModelId === undefined
  ) {
    return Effect.succeed({
      modelId: input.currentModelId,
      reasoningEffort: input.currentReasoningEffort,
      fastMode: input.currentFastMode,
    });
  }
  const meta: { readonly [key: string]: unknown } = {
    ...(reasoningProvided && reasoningEffort !== undefined ? { reasoningEffort } : {}),
    ...(fastModeProvided ? { fastMode: input.requestedFastMode } : {}),
  };
  const requestMeta = Object.keys(meta).length > 0 ? meta : undefined;
  // When reasoning was explicitly provided but invalid (normalize => undefined), we deliberately
  // send no meta so the invalid value is dropped rather than forwarded. When reasoning was not
  // provided at all, we also send no meta, but we only reach this call when the model itself
  // changed - an omitted reasoning preference must not be treated as an explicit clear of the
  // CLI-advertised default (e.g. Extra High) on same-model reselections.
  const setModel =
    input.useConfigModelOption && input.runtime.setModel
      ? input.runtime.setModel(targetModelId)
      : input.runtime.setSessionModel(targetModelId, requestMeta);
  return setModel.pipe(
    Effect.mapError(input.mapError),
    Effect.as({
      modelId: targetModelId,
      reasoningEffort: reasoningEffort ?? input.currentReasoningEffort,
      fastMode: fastModeProvided ? input.requestedFastMode : input.currentFastMode,
    }),
  );
}

const GROK_PLAN_MODE_ALIASES = ["plan", "architect"];
const GROK_IMPLEMENT_MODE_ALIASES = ["code", "agent", "default", "chat", "implement"];
const GROK_APPROVAL_MODE_ALIASES = ["ask"];

function normalizeModeSearchText(mode: AcpSessionMode): string {
  return `${mode.id} ${mode.name}`.trim().toLowerCase();
}

function findModeByAliases(
  modes: ReadonlyArray<AcpSessionMode>,
  aliases: ReadonlyArray<string>,
): AcpSessionMode | undefined {
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase());
  for (const alias of normalizedAliases) {
    const exact = modes.find((mode) => {
      const haystack = normalizeModeSearchText(mode);
      return haystack === alias || mode.id.toLowerCase() === alias;
    });
    if (exact) {
      return exact;
    }
  }
  for (const alias of normalizedAliases) {
    const partial = modes.find((mode) => normalizeModeSearchText(mode).includes(alias));
    if (partial) {
      return partial;
    }
  }
  return undefined;
}

function isPlanMode(mode: AcpSessionMode): boolean {
  return findModeByAliases([mode], GROK_PLAN_MODE_ALIASES) !== undefined;
}

export function grokSessionAdvertisesPlanMode(modeState: AcpSessionModeState | undefined): boolean {
  return (
    modeState !== undefined &&
    findModeByAliases(modeState.availableModes, GROK_PLAN_MODE_ALIASES) !== undefined
  );
}

export function resolveGrokSessionModeId(input: {
  readonly interactionMode: ProviderInteractionMode | undefined;
  readonly runtimeMode: RuntimeMode;
  readonly modeState: AcpSessionModeState | undefined;
}): string | undefined {
  const modeState = input.modeState;
  if (!modeState) {
    return undefined;
  }

  if (input.interactionMode === "plan") {
    return findModeByAliases(modeState.availableModes, GROK_PLAN_MODE_ALIASES)?.id;
  }

  if (input.runtimeMode === "approval-required") {
    return (
      findModeByAliases(modeState.availableModes, GROK_APPROVAL_MODE_ALIASES)?.id ??
      findModeByAliases(modeState.availableModes, GROK_IMPLEMENT_MODE_ALIASES)?.id ??
      modeState.availableModes.find((mode) => !isPlanMode(mode))?.id ??
      modeState.currentModeId
    );
  }

  if (input.interactionMode !== "default") {
    return undefined;
  }

  return (
    findModeByAliases(modeState.availableModes, GROK_IMPLEMENT_MODE_ALIASES)?.id ??
    findModeByAliases(modeState.availableModes, GROK_APPROVAL_MODE_ALIASES)?.id ??
    modeState.availableModes.find((mode) => !isPlanMode(mode))?.id ??
    modeState.currentModeId
  );
}

export function applyGrokAcpSessionMode<E>(input: {
  readonly runtime: Pick<
    AcpSessionRuntime.AcpSessionRuntime["Service"],
    "getModeState" | "setMode"
  >;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode | undefined;
  readonly mapError: (cause: EffectAcpErrors.AcpError) => E;
}): Effect.Effect<void, E> {
  return Effect.gen(function* () {
    const requestedModeId = resolveGrokSessionModeId({
      interactionMode: input.interactionMode,
      runtimeMode: input.runtimeMode,
      modeState: yield* input.runtime.getModeState,
    });
    if (!requestedModeId) {
      return;
    }
    yield* input.runtime.setMode(requestedModeId).pipe(Effect.mapError(input.mapError));
  });
}
