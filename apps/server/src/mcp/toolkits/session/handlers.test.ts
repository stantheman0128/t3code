import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as SpawnSessionBroker from "../../SpawnSessionBroker.ts";
import { SessionToolkitHandlersLive } from "./handlers.ts";
import { SessionToolkit } from "./tools.ts";

const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-session-test"),
  threadId: ThreadId.make("thread-session-test"),
  providerSessionId: "provider-session-session-test",
  providerInstanceId: ProviderInstanceId.make("cursor"),
  capabilities: new Set(["session"]),
  issuedAt: 1,
};

const client = McpSchema.McpServerClient.of({
  clientId: 1,
  clientCapabilities: {},
  clientInfo: { name: "session-test", version: "1.0.0" },
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "session-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

const mockBroker = SpawnSessionBroker.SpawnSessionBroker.of({
  list: () =>
    Effect.succeed({
      providers: [
        {
          provider: ProviderDriverKind.make("antigravity"),
          displayName: "Antigravity",
          instanceId: ProviderInstanceId.make("antigravity"),
          model: "gemini-3",
        },
      ],
    }),
  spawn: (input) =>
    Effect.succeed({
      threadId: ThreadId.make("thread-spawned"),
      title: `${input.provider} session`,
      provider: ProviderDriverKind.make("antigravity"),
      displayName: "Antigravity",
      instanceId: ProviderInstanceId.make("antigravity"),
      model: "gemini-3",
      startedTurn: Boolean(input.prompt),
    }),
});

const TestLayer = McpServer.toolkit(SessionToolkit).pipe(
  Layer.provide(SessionToolkitHandlersLive),
  Layer.provide(Layer.succeed(SpawnSessionBroker.SpawnSessionBroker, mockBroker)),
  Layer.provideMerge(McpServer.McpServer.layer),
);

it.effect("lists spawnable providers and spawns a session", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const listed = yield* server
      .callTool({ name: "session_list_providers", arguments: {} })
      .pipe(
        Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
        Effect.provideService(McpSchema.McpServerClient, client),
      );
    expect(listed.isError).toBe(false);
    expect(listed.structuredContent).toMatchObject({
      providers: [{ displayName: "Antigravity", provider: "antigravity" }],
    });

    const spawned = yield* server
      .callTool({ name: "session_spawn", arguments: { provider: "Gemini", prompt: "fix tests" } })
      .pipe(
        Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
        Effect.provideService(McpSchema.McpServerClient, client),
      );
    expect(spawned.isError).toBe(false);
    expect(spawned.structuredContent).toMatchObject({
      displayName: "Antigravity",
      startedTurn: true,
    });
  }).pipe(Effect.provide(TestLayer)),
);
