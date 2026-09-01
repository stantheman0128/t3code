import {
  type GrokSettings,
  type ModelCapabilities,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import type * as EffectAcpSchema from "effect-acp/schema";
import { causeErrorTag } from "@t3tools/shared/observability";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import {
  buildServerProvider,
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
  fallbackGrokReasoningEffortCapabilities,
  grokDiscoveredModelCapabilities,
  isGrokAcpAuthFailure,
  makeGrokAcpRuntime,
  parseGrokAcpModelMeta,
  resolveGrokAcpBaseModelId,
} from "../acp/GrokAcpSupport.ts";
import {
  grokWorkflowHomeDirFromEnvironment,
  readGrokWorkflowSlashCommands,
} from "../acp/GrokWorkflowCommands.ts";
import { readGrokAuthSnapshotFromHome } from "../acp/grokAuth.ts";
import { discoverGrokSkills } from "../Drivers/GrokSkills.ts";

const GROK_PRESENTATION = {
  displayName: "Grok",
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
const GROK_API_KEY_ENV = "XAI_API_KEY";

const GROK_BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
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
  {
    slug: "grok-build",
    name: "Grok Build",
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
    const models = grokModelsFromSettings(grokSettings.customModels);

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
  customModels: ReadonlyArray<string> | undefined,
  builtInModels: ReadonlyArray<ServerProviderModel> = GROK_BUILT_IN_MODELS,
): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings(builtInModels, customModels ?? [], FALLBACK_CAPABILITIES);
}

export function buildGrokDiscoveredModelsFromSessionModelState(
  modelState: EffectAcpSchema.SessionModelState | null | undefined,
  modelIdPrefix?: string,
): ReadonlyArray<ServerProviderModel> {
  if (!modelState || modelState.availableModels.length === 0) {
    return [];
  }
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

const discoverGrokModelsViaAcp = (
  grokSettings: GrokSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const probeEnvironment = {
      ...environment,
      CI: environment.CI ?? "1",
      NO_BROWSER: environment.NO_BROWSER ?? "1",
      BROWSER: environment.BROWSER ?? "",
    };
    const acp = yield* makeGrokAcpRuntime({
      grokSettings,
      environment: probeEnvironment,
      childProcessSpawner,
      cwd: process.cwd(),
      clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
    });
    const started = yield* acp.start();
    const modelIdPrefix = grokSettings.useGrokbotBackend ? "grokbot/" : undefined;
    const fromSession = buildGrokDiscoveredModelsFromSessionModelState(
      started.sessionSetupResult.models,
      modelIdPrefix,
    );
    const fromConfig = buildGrokDiscoveredModelsFromSessionConfigOptions(
      started.sessionSetupResult.configOptions,
      modelIdPrefix,
    );
    const prefixed = fromSession.length > 0 ? fromSession : fromConfig;
    if (prefixed.length > 0 || !grokSettings.useGrokbotBackend) {
      return prefixed;
    }
    const unprefixedSession = buildGrokDiscoveredModelsFromSessionModelState(
      started.sessionSetupResult.models,
    );
    return unprefixedSession.length > 0
      ? unprefixedSession
      : buildGrokDiscoveredModelsFromSessionConfigOptions(started.sessionSetupResult.configOptions);
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
    const spawnCommand = yield* resolveSpawnCommand(command, ["--version"], {
      env: environment,
    });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
      }),
    );
  });

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
  const cliFallbackModels = grokModelsFromSettings(grokSettings.customModels);
  const fallbackModels = grokSettings.useGrokbotBackend
    ? grokModelsFromSettings(grokSettings.customModels, [])
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

  const skills = yield* discoverGrokSkills(grokSettings, environment, projectRoot);

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
          ? grokSettings.useGrokbotBackend
            ? "Grok Bot credentials are unavailable to Oh My Pi."
            : "Grok CLI is not authenticated. Run `grok login` and try again."
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
      ? grokModelsFromSettings(grokSettings.customModels, discoveredModels)
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
      auth:
        loginAuth ??
        (grokSettings.useGrokbotBackend
          ? { status: "authenticated", type: "session", label: "Grok Bot" }
          : environment[GROK_API_KEY_ENV]?.trim()
            ? { status: "authenticated", type: "api_key", label: "XAI_API_KEY" }
            : { status: "authenticated", type: "session", label: "grok.com" }),
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
