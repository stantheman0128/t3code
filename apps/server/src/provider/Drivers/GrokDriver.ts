import { GrokSettings, ProviderDriverKind } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/unstable/http";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { makeGrokTextGeneration } from "../../textGeneration/GrokTextGeneration.ts";
import { ProviderDriverError } from "../Errors.ts";
import { makeGrokAdapter } from "../Layers/GrokAdapter.ts";
import {
  buildInitialGrokProviderSnapshot,
  checkGrokProviderStatus,
  enrichGrokSnapshot,
} from "../Layers/GrokProvider.ts";
import { ProviderEventLoggers } from "../Layers/ProviderEventLoggers.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import { withInstanceIdentity } from "./instanceIdentity.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import { discoverGrokSkills } from "./GrokSkills.ts";
import {
  makeManualOnlyProviderMaintenanceCapabilities,
  makeStaticProviderMaintenanceResolver,
  resolveProviderMaintenanceCapabilitiesEffect,
} from "../providerMaintenance.ts";
import {
  haveProviderSnapshotSettingsChanged,
  makeProviderSnapshotSettingsSource,
  type ProviderSnapshotSettings,
} from "../providerUpdateSettings.ts";
const decodeGrokSettings = Schema.decodeSync(GrokSettings);

export const GROK_DRIVER_KIND = ProviderDriverKind.make("grok");
export const GROKBOT_DRIVER_KIND = ProviderDriverKind.make("grokbot");

export function grokSettingsFromGrokBotConfig(input: {
  readonly enabled: boolean;
  readonly binaryPath?: string | undefined;
  readonly customModels?: ReadonlyArray<string> | undefined;
}): GrokSettings {
  const binaryPath = input.binaryPath?.trim() || "omp";
  return decodeGrokSettings({
    enabled: input.enabled,
    binaryPath,
    useGrokbotBackend: true,
    grokbotBinaryPath: binaryPath,
    customModels: input.customModels ?? [],
  });
}

/**
 * Grok Bot's settings form stores the binary in `binaryPath`. Decoding that
 * blob as `GrokSettings` fills `grokbotBinaryPath` with the schema default
 * `"omp"`, which must not hide an explicit instance path.
 */
export function resolveGrokBotBinaryPath(config: {
  readonly binaryPath?: string | undefined;
  readonly grokbotBinaryPath?: string | undefined;
}): string {
  const instancePath = config.binaryPath?.trim() ?? "";
  const grokbotPath = config.grokbotBinaryPath?.trim() ?? "";
  if (instancePath.length > 0 && instancePath !== "grok") {
    return instancePath;
  }
  if (grokbotPath.length > 0) {
    return grokbotPath;
  }
  return "omp";
}

const UPDATE_FOR = (driverKind: ProviderDriverKind) =>
  makeStaticProviderMaintenanceResolver(
    makeManualOnlyProviderMaintenanceCapabilities({
      provider: driverKind,
      packageName: null,
    }),
  );

export type GrokDriverEnv =
  | BackgroundPolicy.BackgroundPolicy
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | Path.Path
  | ProviderEventLoggers
  | ServerConfig
  | ServerSettingsService;

export function createGrokFamilyDriver(spec: {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly forceGrokbot: boolean;
}): ProviderDriver<GrokSettings, GrokDriverEnv> {
  const driverKind = spec.driverKind;
  const UPDATE = UPDATE_FOR(driverKind);
  return {
    driverKind,
    metadata: {
      displayName: spec.displayName,
      supportsMultipleInstances: true,
    },
    configSchema: GrokSettings,
    defaultConfig: (): GrokSettings =>
      decodeGrokSettings(spec.forceGrokbot ? { useGrokbotBackend: true, binaryPath: "omp" } : {}),
    create: ({ instanceId, displayName, accentColor, environment, enabled, config }) =>
      Effect.gen(function* () {
        const crypto = yield* Crypto.Crypto;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const httpClient = yield* HttpClient.HttpClient;
        const serverSettings = yield* ServerSettingsService;
        const eventLoggers = yield* ProviderEventLoggers;
        const processEnv = mergeProviderInstanceEnvironment(environment);
        const continuationIdentity = defaultProviderContinuationIdentity({
          driverKind,
          instanceId,
        });
        const stampIdentity = withInstanceIdentity({
          driverKind,
          instanceId,
          displayName,
          accentColor,
          continuationGroupKey: continuationIdentity.continuationKey,
        });
        const effectiveConfig = (
          spec.forceGrokbot
            ? grokSettingsFromGrokBotConfig({
                enabled,
                binaryPath: resolveGrokBotBinaryPath(config),
                customModels: config.customModels,
              })
            : { ...config, enabled, useGrokbotBackend: false }
        ) satisfies GrokSettings;
        const maintenanceCapabilities = yield* resolveProviderMaintenanceCapabilitiesEffect(
          UPDATE,
          {
            binaryPath: spec.forceGrokbot
              ? effectiveConfig.grokbotBinaryPath
              : effectiveConfig.binaryPath,
            env: processEnv,
          },
        );

        const adapter = yield* makeGrokAdapter(effectiveConfig, {
          environment: processEnv,
          ...(eventLoggers.native ? { nativeEventLogger: eventLoggers.native } : {}),
          instanceId,
          driverKind,
        });
        const textGeneration = yield* makeGrokTextGeneration(effectiveConfig, processEnv);

        const { cwd: projectRoot } = yield* ServerConfig;
        const checkProvider = checkGrokProviderStatus(
          effectiveConfig,
          processEnv,
          projectRoot,
        ).pipe(
          Effect.map(stampIdentity),
          Effect.provideService(Crypto.Crypto, crypto),
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        );

        const snapshotSettings = makeProviderSnapshotSettingsSource(
          effectiveConfig,
          serverSettings,
        );
        const snapshot = yield* makeManagedServerProvider<ProviderSnapshotSettings<GrokSettings>>({
          maintenanceCapabilities,
          getSettings: snapshotSettings.getSettings,
          streamSettings: snapshotSettings.streamSettings,
          haveSettingsChanged: haveProviderSnapshotSettingsChanged,
          initialSnapshot: (settings) =>
            buildInitialGrokProviderSnapshot(settings.provider, {
              environment: processEnv,
              projectRoot,
            }).pipe(
              Effect.map(stampIdentity),
              Effect.provideService(FileSystem.FileSystem, fileSystem),
              Effect.provideService(Path.Path, path),
            ),
          checkProvider,
          enrichSnapshot: ({ settings, snapshot: currentSnapshot, publishSnapshot }) =>
            enrichGrokSnapshot({
              snapshot: currentSnapshot,
              maintenanceCapabilities,
              enableProviderUpdateChecks: settings.enableProviderUpdateChecks,
              publishSnapshot,
              httpClient,
            }),
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ProviderDriverError({
                driver: driverKind,
                instanceId,
                detail: `Failed to build Grok snapshot: ${cause.message ?? String(cause)}`,
                cause,
              }),
          ),
        );
        const snapshotForCwd = (workspaceCwd: string) =>
          !effectiveConfig.enabled
            ? snapshot.getSnapshot
            : Effect.all([
                snapshot.getSnapshot,
                discoverGrokSkills(effectiveConfig, processEnv, workspaceCwd).pipe(
                  Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
                  Effect.mapError(
                    (cause) =>
                      new ProviderDriverError({
                        driver: driverKind,
                        instanceId,
                        detail: `Failed to discover Grok skills for '${workspaceCwd}'`,
                        cause,
                      }),
                  ),
                ),
              ]).pipe(Effect.map(([machineSnapshot, skills]) => ({ ...machineSnapshot, skills })));

        return {
          instanceId,
          driverKind,
          continuationIdentity,
          displayName,
          accentColor,
          enabled,
          snapshot,
          snapshotForCwd,
          adapter,
          textGeneration,
        } satisfies ProviderInstance;
      }),
  };
}

export const GrokDriver = createGrokFamilyDriver({
  driverKind: GROK_DRIVER_KIND,
  displayName: "Grok",
  forceGrokbot: false,
});

export const GrokBotDriver = createGrokFamilyDriver({
  driverKind: GROKBOT_DRIVER_KIND,
  displayName: "Grok Bot",
  forceGrokbot: true,
});
