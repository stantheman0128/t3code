import {
  type CustomModelSetting,
  type GrokSettings,
  type ModelCapabilities,
  type ServerProvider,
  type ServerProviderAuth,
  type ServerProviderModel,
  type ServerProviderSlashCommand,
} from "@t3tools/contracts";
import * as EffectAcpSchema from "effect-acp/schema";
import { causeErrorTag } from "@t3tools/shared/observability";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import {
  AUTH_PROBE_TIMEOUT_MS,
  buildServerProvider,
  COMPACT_SLASH_COMMAND,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  type ProviderMaintenanceCapabilities,
} from "../providerMaintenance.ts";
import {
  GROK_FAST_MODE_OPTION_ID,
  fallbackGrokReasoningEffortCapabilities,
  grokDiscoveredModelCapabilities,
  isGrokAcpAuthFailure,
  isGrokBotPickerModelId,
  isGrokCliPickerModelId,
  isValidGrokReasoningEffortToken,
  makeGrokAcpRuntime,
  parseGrokAcpModelMeta,
  resolveGrokAcpBaseModelId,
  withGrokCliHomeEnvironment,
} from "../acp/GrokAcpSupport.ts";
import {
  grokWorkflowHomeDirFromEnvironment,
  readGrokWorkflowSlashCommands,
} from "../acp/GrokWorkflowCommands.ts";
import { readGrokAuthSnapshotFromHome } from "../acp/grokAuth.ts";
import { sessionModelStateFromInitialize } from "../acp/AcpRuntimeModel.ts";
import { discoverGrokSkills } from "../Drivers/GrokSkills.ts";

const GROK_PRESENTATION = {
  displayName: "Grok",
  supportsConversationRollback: false,
  badgeLabel: "Early Access",
  showInteractionModeToggle: true,
  requiresNewThreadForModelChange: false,
} as const;
const GROKBOT_PRESENTATION = {
  displayName: "Grok Bot",
  badgeLabel: "Early Access",
  showInteractionModeToggle: true,
  requiresNewThreadForModelChange: false,
} as const;

function grokPresentation(grokSettings: GrokSettings) {
  return grokSettings.useGrokbotBackend ? GROKBOT_PRESENTATION : GROK_PRESENTATION;
}
const FALLBACK_CAPABILITIES: ModelCapabilities = fallbackGrokReasoningEffortCapabilities();

const buildGrokServerProvider = (
  input: Parameters<typeof buildServerProvider>[0],
  discovery: {
    readonly environment: NodeJS.ProcessEnv;
    readonly projectRoot?: string | undefined;
  },
) =>
  Effect.gen(function* () {
    const slashCommands =
      input.slashCommands ??
      (yield* readGrokWorkflowSlashCommands({
        homeDir: grokWorkflowHomeDirFromEnvironment(discovery.environment),
        projectRoot: discovery.projectRoot,
      }));
    return buildServerProvider({
      ...input,
      slashCommands,
    });
  });

const VERSION_PROBE_TIMEOUT_MS = 4_000;
const GROK_ACP_MODEL_DISCOVERY_TIMEOUT_MS = 15_000;
// `initialize` is a single local round trip, so this is generous even on slow machines.
const GROK_ACP_INITIALIZE_TIMEOUT_MS = 8_000;
const GROK_API_KEY_ENV = "XAI_API_KEY";

const GROK_BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "grok-4.7",
    name: "Grok 4.7",
    isCustom: false,
    capabilities: FALLBACK_CAPABILITIES,
  },
  {
    slug: "grok-4.7-build-fast",
    name: "Grok 4.7 Fast",
    isCustom: false,
    capabilities: FALLBACK_CAPABILITIES,
  },
  {
    slug: "grok-4.6",
    name: "Grok 4.6",
    isCustom: false,
    capabilities: FALLBACK_CAPABILITIES,
  },
  {
    slug: "grok-4.5",
    name: "Grok 4.5",
    isCustom: false,
    capabilities: FALLBACK_CAPABILITIES,
  },
];

const GROKBOT_BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "grokbot/grok-4.7",
    name: "Grok 4.7",
    isCustom: false,
    capabilities: FALLBACK_CAPABILITIES,
  },
  {
    slug: "grokbot/grok-4.7-build-fast",
    name: "Grok 4.7 Fast",
    isCustom: false,
    capabilities: FALLBACK_CAPABILITIES,
  },
  {
    slug: "grokbot/grok-4.6",
    name: "Grok 4.6",
    isCustom: false,
    capabilities: FALLBACK_CAPABILITIES,
  },
  {
    slug: "grokbot/grok-4.5",
    name: "Grok 4.5",
    isCustom: false,
    capabilities: FALLBACK_CAPABILITIES,
  },
  {
    slug: "grokbot/sand-default",
    name: "Sand Default",
    isCustom: false,
    capabilities: FALLBACK_CAPABILITIES,
  },
  {
    slug: "grokbot/sand-automation",
    name: "Sand Automation",
    isCustom: false,
    capabilities: FALLBACK_CAPABILITIES,
  },
];

export function buildInitialGrokProviderSnapshot(
  grokSettings: GrokSettings,
  discovery?: {
    readonly environment?: NodeJS.ProcessEnv | undefined;
    readonly projectRoot?: string | undefined;
  },
): Effect.Effect<ServerProviderDraft, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = grokModelsFromSettings(
      grokSettings.customModels,
      grokSettings.useGrokbotBackend ? GROKBOT_BUILT_IN_MODELS : GROK_BUILT_IN_MODELS,
      grokSettings.useGrokbotBackend,
    );

    const resolvedDiscovery = {
      environment: discovery?.environment ?? process.env,
      projectRoot: discovery?.projectRoot,
    };
    const loginSnapshot = grokSettings.useGrokbotBackend
      ? null
      : yield* readGrokAuthSnapshotFromHome(
          grokWorkflowHomeDirFromEnvironment(resolvedDiscovery.environment),
        ).pipe(Effect.catch(() => Effect.succeed(null)));
    const loginAuth = loginSnapshot?.auth ?? null;
    const usageLimits =
      loginSnapshot && "usageLimits" in loginSnapshot ? loginSnapshot.usageLimits : undefined;
    if (!grokSettings.enabled) {
      return yield* buildGrokServerProvider(
        {
          presentation: grokPresentation(grokSettings),
          enabled: false,
          checkedAt,
          models,
          probe: {
            installed: false,
            version: null,
            status: "warning",
            auth: { status: "unknown" },
            message: "Grok is disabled in T3 Code settings.",
          },
        },
        resolvedDiscovery,
      );
    }

    return yield* buildGrokServerProvider(
      {
        presentation: grokPresentation(grokSettings),
        enabled: true,
        checkedAt,
        models,
        ...(usageLimits ? { usageLimits } : {}),
        probe: {
          installed: true,
          version: null,
          status: "warning",
          auth: loginAuth ?? { status: "unknown" },
          message: "Checking Grok CLI availability...",
        },
      },
      resolvedDiscovery,
    );
  });
}

function grokModelsFromSettings(
  customModels: ReadonlyArray<CustomModelSetting> | undefined,
  builtInModels: ReadonlyArray<ServerProviderModel> = GROK_BUILT_IN_MODELS,
  useGrokbotBackend = false,
): ReadonlyArray<ServerProviderModel> {
  const models = providerModelsFromSettings(
    builtInModels,
    customModels ?? [],
    FALLBACK_CAPABILITIES,
  );
  return models.filter((model) =>
    useGrokbotBackend ? isGrokBotPickerModelId(model.slug) : isGrokCliPickerModelId(model.slug),
  );
}

export function buildGrokDiscoveredModelsFromSessionModelState(
  modelState: EffectAcpSchema.SessionModelState | null | undefined,
  modelIdPrefix?: string,
): ReadonlyArray<ServerProviderModel> {
  if (!modelState || modelState.availableModels.length === 0) {
    return [];
  }
  const currentModelId = modelState.currentModelId.trim();
  const seen = new Set<string>();
  return modelState.availableModels
    .filter((model) => !modelIdPrefix || model.modelId.trim().startsWith(modelIdPrefix))
    .map((model): ServerProviderModel | undefined => {
      const slug = resolveGrokAcpBaseModelId(model.modelId);
      if (!slug || seen.has(slug)) {
        return undefined;
      }
      seen.add(slug);
      const meta = parseGrokAcpModelMeta(model._meta);
      return {
        slug,
        name: model.name.trim() || slug,
        isCustom: false,
        ...(model.modelId.trim() === currentModelId ? { isDefault: true } : {}),
        capabilities: grokDiscoveredModelCapabilities(meta),
      };
    })
    .filter((model): model is ServerProviderModel => model !== undefined);
}

export function buildGrokDiscoveredModelsFromSessionConfigOptions(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption> | null | undefined,
  modelIdPrefix?: string,
): ReadonlyArray<ServerProviderModel> {
  const modelOption = configOptions?.find(
    (option) => option.id === "model" && option.type === "select",
  );
  if (modelOption?.type !== "select") {
    return [];
  }
  const seen = new Set<string>();
  return modelOption.options
    .flatMap((option) => ("value" in option ? [option] : option.options))
    .filter((option) => !modelIdPrefix || option.value.trim().startsWith(modelIdPrefix))
    .map((option): ServerProviderModel | undefined => {
      const slug = resolveGrokAcpBaseModelId(option.value);
      if (!slug || seen.has(slug)) {
        return undefined;
      }
      seen.add(slug);
      return {
        slug,
        name: option.name.trim() || slug,
        isCustom: false,
        capabilities: FALLBACK_CAPABILITIES,
      };
    })
    .filter((model): model is ServerProviderModel => model !== undefined);
}

export function selectDiscoveredGrokModels(input: {
  readonly useGrokbotBackend: boolean;
  readonly models?: EffectAcpSchema.SessionModelState | null;
  readonly configOptions?: ReadonlyArray<EffectAcpSchema.SessionConfigOption> | null;
}): ReadonlyArray<ServerProviderModel> {
  const modelIdPrefix = input.useGrokbotBackend ? "grokbot/" : undefined;
  const fromSession = buildGrokDiscoveredModelsFromSessionModelState(input.models, modelIdPrefix);
  const fromConfig = buildGrokDiscoveredModelsFromSessionConfigOptions(
    input.configOptions,
    modelIdPrefix,
  );
  const prefixed = fromSession.length > 0 ? fromSession : fromConfig;
  if (!input.useGrokbotBackend) {
    return prefixed.filter((model) => isGrokCliPickerModelId(model.slug));
  }
  const unprefixedSession = buildGrokDiscoveredModelsFromSessionModelState(input.models);
  const unprefixed =
    unprefixedSession.length > 0
      ? unprefixedSession
      : buildGrokDiscoveredModelsFromSessionConfigOptions(input.configOptions);
  const candidates = prefixed.length > 0 ? prefixed : unprefixed;
  return candidates.filter((model) => isGrokBotPickerModelId(model.slug));
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function grokReasoningOptionsFromModel(model: EffectAcpSchema.ModelInfo): {
  readonly options: ReadonlyArray<{
    value: string;
    label: string;
    description?: string;
    isDefault?: boolean;
  }>;
  readonly currentValue: string | undefined;
} {
  const meta = model._meta;
  if (!meta || meta.supportsReasoningEffort === false) {
    return { options: [], currentValue: undefined };
  }

  const currentEffort = nonEmptyString(meta.reasoningEffort);
  const advertisedOptions = Array.isArray(meta.reasoningEfforts) ? meta.reasoningEfforts : [];
  const seen = new Set<string>();
  const options: Array<{
    value: string;
    label: string;
    description?: string;
    advertisedDefault: boolean;
  }> = [];

  for (const entry of advertisedOptions) {
    if (!isRecord(entry)) {
      continue;
    }
    const rawValue = nonEmptyString(entry.value);
    const rawId = nonEmptyString(entry.id);
    const value =
      rawValue && isValidGrokReasoningEffortToken(rawValue)
        ? rawValue
        : rawId && isValidGrokReasoningEffortToken(rawId)
          ? rawId
          : undefined;
    if (value === undefined || seen.has(value)) {
      continue;
    }
    seen.add(value);
    const description = nonEmptyString(entry.description);
    options.push({
      value,
      label: nonEmptyString(entry.label) ?? value,
      ...(description ? { description } : {}),
      advertisedDefault: entry.default === true || entry.isDefault === true,
    });
  }

  const currentValue =
    currentEffort && options.some((option) => option.value === currentEffort)
      ? currentEffort
      : undefined;
  const advertisedDefaults = options.filter((option) => option.advertisedDefault);
  const selectedDefault =
    advertisedDefaults.find((option) => option.value === currentValue)?.value ??
    advertisedDefaults[0]?.value;
  return {
    options: options.map(({ value, label, description }) => ({
      value,
      label,
      ...(description ? { description } : {}),
      ...(value === selectedDefault ? { isDefault: true } : {}),
    })),
    currentValue: currentValue ?? selectedDefault,
  };
}

export function buildGrokModelCapabilities(model: EffectAcpSchema.ModelInfo): ModelCapabilities {
  const reasoning = grokReasoningOptionsFromModel(model);
  const meta = parseGrokAcpModelMeta(model._meta);
  const optionDescriptors = [
    ...(reasoning.options.length > 0
      ? [
          {
            id: "reasoningEffort",
            label: "Reasoning",
            type: "select" as const,
            options: reasoning.options.map((option) => ({
              id: option.value,
              label: option.label,
              ...(option.description ? { description: option.description } : {}),
              ...(option.isDefault ? { isDefault: true } : {}),
            })),
            ...(reasoning.currentValue ? { currentValue: reasoning.currentValue } : {}),
          },
        ]
      : []),
    ...(meta.supportsFastMode
      ? [
          {
            id: GROK_FAST_MODE_OPTION_ID,
            label: "Fast Mode",
            type: "boolean" as const,
            ...(meta.fastMode !== undefined ? { currentValue: meta.fastMode } : {}),
          },
        ]
      : []),
  ];
  return createModelCapabilities({ optionDescriptors });
}

/** Models advertised by the ACP agent, with the session's current model marked as default. */
export function buildGrokModelsFromSessionModelState(
  modelState: EffectAcpSchema.SessionModelState | null | undefined,
): ReadonlyArray<ServerProviderModel> {
  if (!modelState || modelState.availableModels.length === 0) {
    return [];
  }
  const currentModelId = modelState.currentModelId.trim();
  const seen = new Set<string>();
  return modelState.availableModels.flatMap((model): ServerProviderModel[] => {
    const slug = resolveGrokAcpBaseModelId(model.modelId);
    if (!slug || seen.has(slug)) {
      return [];
    }
    seen.add(slug);
    return [
      {
        slug,
        name: model.name.trim() || slug,
        isCustom: false,
        ...(model.modelId.trim() === currentModelId ? { isDefault: true } : {}),
        capabilities: buildGrokModelCapabilities(model),
      },
    ];
  });
}

export interface GrokModelsCliOutput {
  /** True or false when the CLI printed a login line, null when it printed neither. */
  readonly authenticated: boolean | null;
  readonly models: ReadonlyArray<ServerProviderModel>;
}

/**
 * Parses `grok models`. The command exits 0 whether or not the user is logged in, so the
 * text is the only signal. Current output looks like:
 *
 *     You are logged in with grok.com.
 *     Default model: grok-4.6
 *     Available models:
 *       * grok-4.6 (default)
 *       - grok-4.5
 */
export function parseGrokModelsCliOutput(output: string): GrokModelsCliOutput {
  const authenticated = /you are logged in/i.test(output)
    ? true
    : /not authenticated|not logged in/i.test(output)
      ? false
      : null;

  const seen = new Set<string>();
  const models: ServerProviderModel[] = [];
  for (const line of output.split(/\r?\n/)) {
    const bullet = line.match(/^\s*[*-]\s+(\S+)(.*)$/);
    if (!bullet?.[1]) {
      continue;
    }
    const slug = resolveGrokAcpBaseModelId(bullet[1]);
    if (seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    models.push({
      slug,
      name: displayNameFromGrokModelSlug(slug),
      isCustom: false,
      ...(/\(default\)/i.test(bullet[2] ?? "") ? { isDefault: true } : {}),
      capabilities: FALLBACK_CAPABILITIES,
    });
  }
  return { authenticated, models };
}

function displayNameFromGrokModelSlug(slug: string): string {
  return slug
    .split(/[-_]/g)
    .map((part) => (part.toLowerCase() === "grok" ? "Grok" : part))
    .join(" ");
}

const grokAcpProbeEnvironment = (environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  ...withGrokCliHomeEnvironment(environment),
  CI: environment.CI ?? "1",
  NO_BROWSER: environment.NO_BROWSER ?? "1",
  BROWSER: environment.BROWSER ?? "",
});

function summarizeGrokAcpCause(cause: Cause.Cause<unknown>): string | undefined {
  const squashed = Cause.squash(cause);
  if (squashed instanceof Error) {
    const message = squashed.message.trim();
    return message.length > 0 ? message.slice(0, 240) : squashed.name;
  }
  if (typeof squashed === "object" && squashed !== null && "_tag" in squashed) {
    return String((squashed as { _tag: unknown })._tag);
  }
  return undefined;
}

const discoverGrokModelsViaAcp = (
  grokSettings: GrokSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const acp = yield* makeGrokAcpRuntime({
      grokSettings,
      environment: grokAcpProbeEnvironment(environment),
      childProcessSpawner,
      cwd: process.cwd(),
      clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
    });
    const started = yield* acp.start();
    return selectDiscoveredGrokModels({
      useGrokbotBackend: grokSettings.useGrokbotBackend,
      models: started.sessionSetupResult.models,
      configOptions: started.sessionSetupResult.configOptions,
    });
  }).pipe(Effect.scoped);

/**
 * Reads model metadata from `initialize._meta.modelState`. This never calls `authenticate`
 * or `session/new`, so it cannot open a browser login or boot the workspace's MCP servers.
 */
const discoverGrokModelsViaAcpInitialize = (
  grokSettings: GrokSettings,
  environment: NodeJS.ProcessEnv,
) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const acp = yield* makeGrokAcpRuntime({
      grokSettings,
      environment: grokAcpProbeEnvironment(environment),
      childProcessSpawner,
      cwd: process.cwd(),
      clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
    });
    const initialized = yield* acp.initialize();
    return buildGrokModelsFromSessionModelState(
      sessionModelStateFromInitialize(initialized),
    ).filter((model) => isGrokCliPickerModelId(model.slug));
  }).pipe(Effect.scoped);

const grokCommandFromSettings = (grokSettings: GrokSettings): string =>
  grokSettings.useGrokbotBackend
    ? grokSettings.grokbotBinaryPath || "omp"
    : grokSettings.binaryPath || "grok";

const runGrokVersionCommand = (
  grokSettings: GrokSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const command = grokCommandFromSettings(grokSettings);
    const env = grokAcpProbeEnvironment(environment);
    const spawnCommand = yield* resolveSpawnCommand(command, ["--version"], {
      env,
    });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env,
        shell: spawnCommand.shell,
      }),
    );
  });

/**
 * `grok models` prints the listing quickly, then waits ~12s for an internal
 * worker to exit. Health probes must not wait for that shutdown.
 */
const runGrokModelsListing = (grokSettings: GrokSettings, environment: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const command = grokSettings.binaryPath || "grok";
    const env = grokAcpProbeEnvironment(environment);
    const spawnCommand = yield* resolveSpawnCommand(command, ["models"], { env });
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env,
        shell: spawnCommand.shell,
      }),
    );
    const listing = yield* Deferred.make<GrokModelsCliOutput>();
    const stdout = yield* Ref.make("");
    yield* Stream.runForEach(child.stderr, () => Effect.void).pipe(Effect.forkScoped);
    yield* Stream.runForEach(child.stdout, (chunk) =>
      Effect.gen(function* () {
        const next = yield* Ref.updateAndGet(
          stdout,
          (current) => current + Buffer.from(chunk).toString("utf8"),
        );
        const parsed = parseGrokModelsCliOutput(next);
        if (parsed.authenticated !== null) {
          yield* Deferred.succeed(listing, parsed).pipe(Effect.ignore);
        }
      }),
    ).pipe(Effect.forkScoped);
    return yield* Deferred.await(listing);
  }).pipe(Effect.scoped);

const decodeAvailableCommands = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown));
const decodeAvailableCommand = Schema.decodeUnknownOption(EffectAcpSchema.AvailableCommand);

export function grokSlashCommandsFromInitialize(
  initialized: EffectAcpSchema.InitializeResponse,
): ReadonlyArray<ServerProviderSlashCommand> {
  const commands = decodeAvailableCommands(initialized._meta?.availableCommands);
  const byName = new Map<string, ServerProviderSlashCommand>([
    [COMPACT_SLASH_COMMAND.name, COMPACT_SLASH_COMMAND],
  ]);
  for (const entry of Option.getOrElse(commands, () => [])) {
    const decoded = decodeAvailableCommand(entry);
    if (Option.isNone(decoded)) continue;
    const command = decoded.value;
    const name = command.name.trim();
    // Permission changes must go through T3 so the client and provider agree.
    if (!name || name.toLowerCase() === "always-approve") continue;
    // Grok advertises /context, but its ACP handler completes without emitting output.
    if (name.toLowerCase() === "context") continue;
    const description = command.description.trim();
    const hint = command.input?.hint.trim();
    byName.set(name, {
      name,
      ...(description ? { description } : {}),
      ...(hint ? { input: { hint } } : {}),
    });
  }
  return [...byName.values()];
}

/**
 * Reads model and command metadata from `initialize._meta`. This never calls `authenticate`
 * or `session/new`, so it cannot open a browser login or boot the workspace's MCP servers.
 */
const discoverGrokMetadataViaAcpInitialize = (
  grokSettings: GrokSettings,
  environment: NodeJS.ProcessEnv,
) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const acp = yield* makeGrokAcpRuntime({
      grokSettings,
      environment: grokAcpProbeEnvironment(environment),
      childProcessSpawner,
      cwd: process.cwd(),
      clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
    });
    const initialized = yield* acp.initialize();
    return {
      models: buildGrokModelsFromSessionModelState(sessionModelStateFromInitialize(initialized)),
      slashCommands: grokSlashCommandsFromInitialize(initialized),
    };
  }).pipe(Effect.scoped);

export const checkGrokProviderStatus = Effect.fn("checkGrokProviderStatus")(function* (
  grokSettings: GrokSettings,
  environment: NodeJS.ProcessEnv = process.env,
  projectRoot?: string,
): Effect.fn.Return<
  ServerProviderDraft,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto | FileSystem.FileSystem | Path.Path
> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const cliFallbackModels = grokModelsFromSettings(grokSettings.customModels, GROK_BUILT_IN_MODELS);
  const fallbackModels = grokSettings.useGrokbotBackend
    ? grokModelsFromSettings(grokSettings.customModels, GROKBOT_BUILT_IN_MODELS, true)
    : cliFallbackModels;
  const discovery = { environment, projectRoot };
  const loginSnapshot = grokSettings.useGrokbotBackend
    ? null
    : yield* readGrokAuthSnapshotFromHome(grokWorkflowHomeDirFromEnvironment(environment)).pipe(
        Effect.catch(() => Effect.succeed(null)),
      );
  const loginAuth = loginSnapshot?.auth ?? null;
  const usageLimits =
    loginSnapshot && "usageLimits" in loginSnapshot ? loginSnapshot.usageLimits : undefined;
  const providerDraft = (input: Parameters<typeof buildServerProvider>[0]) =>
    buildGrokServerProvider(
      {
        ...(grokSettings.enabled && usageLimits ? { usageLimits } : {}),
        ...input,
      },
      discovery,
    );

  if (!grokSettings.enabled) {
    return yield* providerDraft({
      presentation: grokPresentation(grokSettings),
      enabled: false,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Grok is disabled in T3 Code settings.",
      },
    });
  }

  const versionResult = yield* runGrokVersionCommand(grokSettings, environment).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );

  if (Result.isFailure(versionResult)) {
    const error = versionResult.failure;
    yield* Effect.logWarning("Grok CLI health check failed.", {
      errorTag: error._tag,
    });
    return yield* providerDraft({
      presentation: grokPresentation(grokSettings),
      enabled: grokSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isCommandMissingCause(error)
          ? "Grok CLI (`grok`) is not installed or not on PATH."
          : "Failed to execute Grok CLI health check.",
      },
    });
  }

  if (Option.isNone(versionResult.success)) {
    return yield* providerDraft({
      presentation: grokPresentation(grokSettings),
      enabled: grokSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: "Grok CLI is installed but timed out while running `grok --version`.",
      },
    });
  }

  const versionOutput = versionResult.success.value;
  const version = parseGenericCliVersion(`${versionOutput.stdout}\n${versionOutput.stderr}`);
  if (versionOutput.code !== 0) {
    yield* Effect.logWarning("Grok CLI version probe exited with a non-zero status.", {
      exitCode: versionOutput.code,
      stdoutLength: versionOutput.stdout.length,
      stderrLength: versionOutput.stderr.length,
    });
    return yield* providerDraft({
      presentation: grokPresentation(grokSettings),
      enabled: grokSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: "Grok CLI is installed but failed to run.",
      },
    });
  }

  const skills = yield* discoverGrokSkills(grokSettings, environment, projectRoot).pipe(
    Effect.tapError((cause) => Effect.logDebug("Grok skill discovery failed.", { cause })),
    Effect.orElseSucceed(() => []),
  );

  if (grokSettings.useGrokbotBackend) {
    const discoveryExit = yield* discoverGrokModelsViaAcp(grokSettings, environment).pipe(
      Effect.timeoutOption(GROK_ACP_MODEL_DISCOVERY_TIMEOUT_MS),
      Effect.exit,
    );
    if (Exit.isFailure(discoveryExit)) {
      const authFailed = isGrokAcpAuthFailure(discoveryExit.cause);
      yield* Effect.logWarning("Grok ACP model discovery failed", {
        errorTag: causeErrorTag(discoveryExit.cause),
        authFailed,
      });
      return yield* providerDraft({
        presentation: grokPresentation(grokSettings),
        enabled: grokSettings.enabled,
        checkedAt,
        models: fallbackModels,
        skills,
        probe: {
          installed: true,
          version,
          status: "error",
          auth: { status: authFailed ? "unauthenticated" : "unknown" },
          message: authFailed
            ? "Grok Bot credentials are unavailable to Oh My Pi."
            : "Grok CLI is installed but ACP startup failed. Check server logs for details.",
        },
      });
    }
    if (Option.isNone(discoveryExit.value)) {
      yield* Effect.logWarning(
        `Grok ACP model discovery timed out after ${GROK_ACP_MODEL_DISCOVERY_TIMEOUT_MS}ms.`,
      );
      return yield* providerDraft({
        presentation: grokPresentation(grokSettings),
        enabled: grokSettings.enabled,
        checkedAt,
        models: fallbackModels,
        skills,
        probe: {
          installed: true,
          version,
          status: "error",
          auth: { status: "unknown" },
          message: `Grok CLI is installed but ACP startup timed out after ${GROK_ACP_MODEL_DISCOVERY_TIMEOUT_MS}ms.`,
        },
      });
    }
    const discoveredModels = discoveryExit.value.value;
    const models =
      discoveredModels.length > 0
        ? grokModelsFromSettings(grokSettings.customModels, discoveredModels, true)
        : fallbackModels;
    return yield* providerDraft({
      presentation: grokPresentation(grokSettings),
      enabled: grokSettings.enabled,
      checkedAt,
      models,
      skills,
      probe: {
        installed: true,
        version,
        status: "ready",
        auth: loginAuth ?? { status: "authenticated", type: "session", label: "Grok Bot" },
      },
    });
  }

  // `grok models` reports login state and model slugs without starting the agent.
  const modelsResult = yield* runGrokModelsListing(grokSettings, environment).pipe(
    Effect.timeoutOption(AUTH_PROBE_TIMEOUT_MS),
    Effect.result,
  );
  const cliModels: GrokModelsCliOutput =
    Result.isSuccess(modelsResult) && Option.isSome(modelsResult.success)
      ? modelsResult.success.value
      : { authenticated: null, models: [] };
  if (cliModels.authenticated === null) {
    yield* Effect.logWarning("Grok CLI model listing failed or timed out.", {
      errorTag: Result.isFailure(modelsResult)
        ? modelsResult.failure._tag
        : Option.isNone(modelsResult.success)
          ? "Timeout"
          : "Unparsed",
    });
  }

  const auth: ServerProviderAuth = environment[GROK_API_KEY_ENV]?.trim()
    ? { status: "authenticated", type: "api_key", label: "xAI API key" }
    : cliModels.authenticated === true
      ? { status: "authenticated", type: "cached_token", label: "Grok account" }
      : cliModels.authenticated === false
        ? { status: "unauthenticated" }
        : (loginAuth ?? { status: "unknown" });

  const acpExit = yield* discoverGrokMetadataViaAcpInitialize(grokSettings, environment).pipe(
    Effect.timeoutOption(GROK_ACP_INITIALIZE_TIMEOUT_MS),
    Effect.exit,
  );
  const acpMetadata = Exit.isSuccess(acpExit) ? Option.getOrUndefined(acpExit.value) : undefined;
  const acpModels = acpMetadata?.models ?? [];
  const acpFailed = Exit.isFailure(acpExit) || Option.isNone(acpExit.value);
  if (acpFailed) {
    yield* Effect.logWarning("Grok ACP initialize probe failed or timed out.", {
      errorTag: Exit.isFailure(acpExit) ? causeErrorTag(acpExit.cause) : "Timeout",
      ...(Exit.isFailure(acpExit) ? { detail: summarizeGrokAcpCause(acpExit.cause) } : {}),
    });
  }

  const discoveredModels = acpModels.length > 0 ? acpModels : cliModels.models;
  const models =
    discoveredModels.length > 0
      ? grokModelsFromSettings(grokSettings.customModels, discoveredModels)
      : fallbackModels;

  if (auth.status === "unauthenticated") {
    return yield* providerDraft({
      presentation: grokPresentation(grokSettings),
      enabled: grokSettings.enabled,
      checkedAt,
      models,
      skills,
      probe: {
        installed: true,
        version,
        status: "error",
        auth,
        message: "Grok CLI is installed but not logged in. Run `grok login`.",
      },
    });
  }

  return yield* providerDraft({
    presentation: grokPresentation(grokSettings),
    enabled: grokSettings.enabled,
    checkedAt,
    models,
    skills,
    probe: {
      installed: true,
      version,
      // A failed metadata probe degrades the model picker, it does not make chats fail.
      status: acpFailed ? "warning" : "ready",
      auth,
      ...(acpFailed
        ? {
            message:
              "Grok CLI is installed but ACP initialize failed. Model options may be incomplete.",
          }
        : {}),
    },
  });
});

export const enrichGrokSnapshot = (input: {
  readonly snapshot: ServerProvider;
  readonly maintenanceCapabilities: ProviderMaintenanceCapabilities;
  readonly enableProviderUpdateChecks?: boolean;
  readonly publishSnapshot: (snapshot: ServerProvider) => Effect.Effect<void>;
  readonly httpClient: HttpClient.HttpClient;
}): Effect.Effect<void> => {
  const { snapshot, publishSnapshot } = input;

  return enrichProviderSnapshotWithVersionAdvisory(snapshot, input.maintenanceCapabilities, {
    enableProviderUpdateChecks: input.enableProviderUpdateChecks,
  }).pipe(
    Effect.provideService(HttpClient.HttpClient, input.httpClient),
    Effect.flatMap((enrichedSnapshot) => publishSnapshot(enrichedSnapshot)),
    Effect.catchCause((cause) =>
      Effect.logWarning("Grok version advisory enrichment failed", {
        errorTag: causeErrorTag(cause),
      }),
    ),
    Effect.asVoid,
  );
};
