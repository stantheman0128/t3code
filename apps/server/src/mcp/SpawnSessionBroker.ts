import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  MessageId,
  SpawnSessionError,
  ThreadId,
  type SpawnSessionInput,
  type SpawnSessionListResult,
  type SpawnSessionReadyProvider,
  type SpawnSessionResult,
} from "@t3tools/contracts";
import {
  buildSpawnProviderThreadTitle,
  listReadySpawnProviders,
  resolveSpawnProviderDriver,
  resolveSpawnProviderModelSelection,
} from "@t3tools/shared/spawnProviderSession";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as OrchestrationEngine from "../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ProviderRegistry from "../provider/Services/ProviderRegistry.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";

export class SpawnSessionBroker extends Context.Service<
  SpawnSessionBroker,
  {
    readonly list: () => Effect.Effect<SpawnSessionListResult, SpawnSessionError>;
    readonly spawn: (
      input: SpawnSessionInput,
    ) => Effect.Effect<SpawnSessionResult, SpawnSessionError>;
  }
>()("t3/mcp/SpawnSessionBroker") {}

const make = Effect.gen(function* SpawnSessionBrokerMake() {
  const engine = yield* OrchestrationEngine.OrchestrationEngineService;
  const providers = yield* ProviderRegistry.ProviderRegistry;
  const projection = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const crypto = yield* Crypto.Crypto;

  const nextId = Effect.fn("SpawnSessionBroker.nextId")(function* () {
    return yield* crypto.randomUUIDv4.pipe(Effect.orDie);
  });

  const fail = (input: {
    readonly scope: McpInvocationContext.McpInvocationScope;
    readonly code: SpawnSessionError["code"];
    readonly detail: string;
  }) =>
    new SpawnSessionError({
      code: input.code,
      detail: input.detail,
      environmentId: input.scope.environmentId,
      sourceThreadId: input.scope.threadId,
      providerSessionId: input.scope.providerSessionId,
      providerInstanceId: input.scope.providerInstanceId,
    });

  const list = Effect.fn("SpawnSessionBroker.list")(function* () {
    yield* McpInvocationContext.requireMcpCapability("session");
    const snapshots = yield* providers.getProviders;
    const ready: ReadonlyArray<SpawnSessionReadyProvider> = listReadySpawnProviders(snapshots).map(
      (entry) => ({
        provider: entry.driverKind,
        displayName: entry.displayName,
        instanceId: entry.instanceId,
        model: entry.model,
      }),
    );
    return { providers: ready };
  });

  const spawn = Effect.fn("SpawnSessionBroker.spawn")(function* (input: SpawnSessionInput) {
    const scope = yield* McpInvocationContext.requireMcpCapability("session");
    const driver = resolveSpawnProviderDriver(input.provider);
    if (!driver) {
      return yield* fail({
        scope,
        code: "unknown_provider",
        detail: `Unknown provider "${input.provider}". Use session_list_providers, or one of: Codex, Claude, Cursor, Grok, Grok Bot, OpenCode, Antigravity (Gemini).`,
      });
    }

    const sourceThread = yield* projection.getThreadShellById(scope.threadId).pipe(
      Effect.catch((error) =>
        Effect.fail(
          fail({
            scope,
            code: "dispatch_failed",
            detail:
              error instanceof Error ? error.message : "Could not read the current T3 thread.",
          }),
        ),
      ),
    );
    if (Option.isNone(sourceThread)) {
      return yield* fail({
        scope,
        code: "no_project",
        detail: "Spawn needs the current T3 thread's project, and this session has no thread yet.",
      });
    }

    const snapshots = yield* providers.getProviders;
    const modelSelection = resolveSpawnProviderModelSelection(snapshots, driver.driverKind);
    if (!modelSelection) {
      const ready = listReadySpawnProviders(snapshots)
        .map((entry) => entry.displayName)
        .join(", ");
      return yield* fail({
        scope,
        code: "provider_not_ready",
        detail:
          ready.length > 0
            ? `${driver.displayName} isn't ready. Ready providers: ${ready}.`
            : `${driver.displayName} isn't ready. Enable it in Settings → Providers.`,
      });
    }

    const prompt = input.prompt?.trim() ? input.prompt.trim() : null;
    const title = buildSpawnProviderThreadTitle({
      displayName: driver.displayName,
      prompt,
    });
    const threadId = ThreadId.make(yield* nextId());
    const createdAt = new Date().toISOString();
    const runtimeMode = sourceThread.value.runtimeMode;

    yield* engine
      .dispatch({
        type: "thread.create",
        commandId: CommandId.make(yield* nextId()),
        threadId,
        projectId: sourceThread.value.projectId,
        title,
        modelSelection,
        runtimeMode,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        branch: sourceThread.value.branch,
        worktreePath: sourceThread.value.worktreePath,
        createdAt,
      })
      .pipe(
        Effect.catch((error) =>
          Effect.fail(
            fail({
              scope,
              code: "dispatch_failed",
              detail:
                error instanceof Error
                  ? error.message
                  : `Could not create the ${driver.displayName} thread.`,
            }),
          ),
        ),
      );

    if (prompt !== null) {
      const deleteCommandId = CommandId.make(yield* nextId());
      yield* engine
        .dispatch({
          type: "thread.turn.start",
          commandId: CommandId.make(yield* nextId()),
          threadId,
          message: {
            messageId: MessageId.make(yield* nextId()),
            role: "user",
            text: prompt,
            attachments: [],
          },
          modelSelection,
          titleSeed: title,
          runtimeMode,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          createdAt,
        })
        .pipe(
          Effect.catch((error) =>
            engine
              .dispatch({
                type: "thread.delete",
                commandId: deleteCommandId,
                threadId,
              })
              .pipe(
                Effect.ignore,
                Effect.andThen(
                  Effect.fail(
                    fail({
                      scope,
                      code: "dispatch_failed",
                      detail:
                        error instanceof Error
                          ? error.message
                          : `Created a ${driver.displayName} thread but could not start the first turn.`,
                    }),
                  ),
                ),
              ),
          ),
        );
    }

    return {
      threadId,
      title,
      provider: driver.driverKind,
      displayName: driver.displayName,
      instanceId: modelSelection.instanceId,
      model: modelSelection.model,
      startedTurn: prompt !== null,
    };
  });

  return { list, spawn } as const;
});

export const layer = Layer.effect(SpawnSessionBroker, make);
