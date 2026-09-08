import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  SpawnSessionError,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationThreadShell,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import type { OrchestrationEngineShape } from "../orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import type { ProviderRegistryShape } from "../provider/Services/ProviderRegistry.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";
import * as SpawnSessionBroker from "./SpawnSessionBroker.ts";

const sourceThreadId = ThreadId.make("thread-source");
const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-spawn-test"),
  threadId: sourceThreadId,
  providerSessionId: "provider-session-spawn-test",
  providerInstanceId: ProviderInstanceId.make("cursor"),
  capabilities: new Set(["session"]),
  issuedAt: 1,
};

const ANTIGRAVITY = ProviderDriverKind.make("antigravity");
const GROK = ProviderDriverKind.make("grok");
const GROKBOT = ProviderDriverKind.make("grokbot");

const shell: OrchestrationThreadShell = {
  id: sourceThreadId,
  projectId: ProjectId.make("project-spawn"),
  title: "Current thread",
  modelSelection: { instanceId: ProviderInstanceId.make("cursor"), model: "auto" },
  runtimeMode: "full-access",
  interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
  branch: "feat/spawn",
  worktreePath: "/tmp/worktree",
  latestTurn: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  session: null,
  latestUserMessageAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
};

function snapshot(input: {
  readonly instanceId: string;
  readonly driver: ProviderDriverKind;
  readonly status?: ServerProvider["status"];
  readonly model?: string;
}): ServerProvider {
  const model = input.model ?? `${input.driver}-default`;
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: input.driver,
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: input.status ?? "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [{ slug: model, name: model, isCustom: false, isDefault: true, capabilities: null }],
    slashCommands: [],
    skills: [],
  };
}

function makeLayer(input: {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly sourceThread?: Option.Option<OrchestrationThreadShell>;
  readonly commands: Array<OrchestrationCommand>;
}) {
  const engine = {
    dispatch: (command: OrchestrationCommand) => {
      input.commands.push(command);
      return Effect.succeed({ sequence: input.commands.length });
    },
    readEvents: () => Stream.empty,
    readThreadEvents: () => Stream.empty,
    streamDomainEvents: Stream.empty,
    latestSequence: Effect.succeed(0),
  } as OrchestrationEngineShape;

  const providers = {
    getProviders: Effect.succeed(input.providers),
    streamChanges: Stream.empty,
  } as ProviderRegistryShape;

  const projection = {
    getThreadShellById: () => Effect.succeed(input.sourceThread ?? Option.some(shell)),
  } as unknown as ProjectionSnapshotQueryShape;

  return SpawnSessionBroker.layer.pipe(
    Layer.provide(Layer.succeed(OrchestrationEngineService, engine)),
    Layer.provide(Layer.succeed(ProviderRegistry, providers)),
    Layer.provide(Layer.succeed(ProjectionSnapshotQuery, projection)),
    Layer.provide(NodeServices.layer),
  );
}

const withInvocation =
  (scope: McpInvocationContext.McpInvocationScope = invocation) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(McpInvocationContext.McpInvocationContext, scope));

it.effect("maps Gemini onto a ready Antigravity thread and starts the first turn", () => {
  const commands: Array<OrchestrationCommand> = [];
  const layer = makeLayer({
    commands,
    providers: [snapshot({ instanceId: "antigravity", driver: ANTIGRAVITY, model: "gemini-3" })],
  });

  return Effect.gen(function* () {
    const broker = yield* SpawnSessionBroker.SpawnSessionBroker;
    const result = yield* broker.spawn({ provider: "Gemini", prompt: "fix tests" });

    expect(result.provider).toBe(ANTIGRAVITY);
    expect(result.displayName).toBe("Antigravity");
    expect(result.model).toBe("gemini-3");
    expect(result.startedTurn).toBe(true);
    expect(commands.map((command) => command.type)).toEqual(["thread.create", "thread.turn.start"]);
    expect(commands[0]).toMatchObject({
      type: "thread.create",
      projectId: shell.projectId,
      branch: "feat/spawn",
      worktreePath: "/tmp/worktree",
      modelSelection: { instanceId: ProviderInstanceId.make("antigravity"), model: "gemini-3" },
    });
    expect(commands[1]).toMatchObject({
      type: "thread.turn.start",
      message: { role: "user", text: "fix tests", attachments: [] },
    });
  }).pipe(withInvocation(), Effect.provide(layer));
});

it.effect("opens an empty thread when the prompt is omitted", () => {
  const commands: Array<OrchestrationCommand> = [];
  const layer = makeLayer({
    commands,
    providers: [snapshot({ instanceId: "antigravity", driver: ANTIGRAVITY, model: "gemini-3" })],
  });

  return Effect.gen(function* () {
    const broker = yield* SpawnSessionBroker.SpawnSessionBroker;
    const result = yield* broker.spawn({ provider: "agy" });

    expect(result.startedTurn).toBe(false);
    expect(result.title).toBe("Antigravity session");
    expect(commands.map((command) => command.type)).toEqual(["thread.create"]);
  }).pipe(withInvocation(), Effect.provide(layer));
});

it.effect("keeps Grok Bot independent of Grok", () => {
  const commands: Array<OrchestrationCommand> = [];
  const layer = makeLayer({
    commands,
    providers: [
      snapshot({ instanceId: "grok", driver: GROK, model: "grok-4.6" }),
      snapshot({ instanceId: "grokbot", driver: GROKBOT, model: "grokbot/sand-default" }),
    ],
  });

  return Effect.gen(function* () {
    const broker = yield* SpawnSessionBroker.SpawnSessionBroker;
    const listed = yield* broker.list();
    expect(listed.providers.map((entry) => entry.displayName)).toEqual(["Grok", "Grok Bot"]);

    const grokBot = yield* broker.spawn({ provider: "Grok Bot" });
    expect(grokBot.provider).toBe(GROKBOT);
    expect(grokBot.model).toBe("grokbot/sand-default");
    expect(commands[0]).toMatchObject({
      modelSelection: {
        instanceId: ProviderInstanceId.make("grokbot"),
        model: "grokbot/sand-default",
      },
    });
  }).pipe(withInvocation(), Effect.provide(layer));
});

it.effect("rejects an unknown provider name", () => {
  const layer = makeLayer({
    commands: [],
    providers: [snapshot({ instanceId: "antigravity", driver: ANTIGRAVITY })],
  });

  return Effect.gen(function* () {
    const broker = yield* SpawnSessionBroker.SpawnSessionBroker;
    const error = yield* broker.spawn({ provider: "agent computer" }).pipe(Effect.flip);
    expect(error).toBeInstanceOf(SpawnSessionError);
    expect(error.code).toBe("unknown_provider");
  }).pipe(withInvocation(), Effect.provide(layer));
});

it.effect("rejects a provider that is not ready", () => {
  const layer = makeLayer({
    commands: [],
    providers: [
      snapshot({ instanceId: "antigravity", driver: ANTIGRAVITY, status: "error" }),
      snapshot({ instanceId: "grok", driver: GROK, model: "grok-4.6" }),
    ],
  });

  return Effect.gen(function* () {
    const broker = yield* SpawnSessionBroker.SpawnSessionBroker;
    const error = yield* broker.spawn({ provider: "Gemini" }).pipe(Effect.flip);
    expect(error).toBeInstanceOf(SpawnSessionError);
    expect(error.code).toBe("provider_not_ready");
    expect(error.detail).toContain("Grok");
  }).pipe(withInvocation(), Effect.provide(layer));
});

it.effect("needs the current thread's project", () => {
  const layer = makeLayer({
    commands: [],
    providers: [snapshot({ instanceId: "antigravity", driver: ANTIGRAVITY })],
    sourceThread: Option.none(),
  });

  return Effect.gen(function* () {
    const broker = yield* SpawnSessionBroker.SpawnSessionBroker;
    const error = yield* broker.spawn({ provider: "Gemini" }).pipe(Effect.flip);
    expect(error).toBeInstanceOf(SpawnSessionError);
    expect(error.code).toBe("no_project");
  }).pipe(withInvocation(), Effect.provide(layer));
});

it.effect("requires the session capability", () => {
  const layer = makeLayer({
    commands: [],
    providers: [snapshot({ instanceId: "antigravity", driver: ANTIGRAVITY })],
  });

  return Effect.gen(function* () {
    const broker = yield* SpawnSessionBroker.SpawnSessionBroker;
    const error = yield* broker.spawn({ provider: "Gemini" }).pipe(Effect.flip);
    expect(error).toBeInstanceOf(SpawnSessionError);
    expect(error.code).toBe("unavailable");
  }).pipe(
    withInvocation({ ...invocation, capabilities: new Set(["preview"]) }),
    Effect.provide(layer),
  );
});
