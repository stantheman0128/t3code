import {
  CommandId,
  EnvironmentId,
  ORCHESTRATION_WS_METHODS,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type ClientOrchestrationCommand,
  type CodexGoal,
  type CodexGoalStreamEvent,
  type OrchestrationShellSnapshot,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import type { RpcSession } from "../rpc/session.ts";
import {
  applyCodexGoalStreamEvent,
  buildGoalStripContent,
  createThreadEnvironmentAtoms,
  derivePromptGoalFromUserTexts,
  formatCodexGoalDescription,
  formatCodexGoalError,
  formatCodexGoalStatus,
  formatCodexGoalUsage,
  formatPromptGoalElapsedLabel,
  formatPromptGoalTitle,
  parseCodexGoalCommand,
  resolvePromptGoalControlText,
  toCodexGoalSetInput,
} from "./threadCommands.ts";

const threadId = ThreadId.make("thread-1");
const goal = (objective: string): CodexGoal => ({
  objective,
  status: "active",
  tokenBudget: 100_000,
  tokensUsed: 12_000,
  timeUsedSeconds: 90,
  createdAt: 1_777_000_000,
  updatedAt: 1_777_000_090,
});

describe("parseCodexGoalCommand", () => {
  it("maps all supported Goal commands to native mutations", () => {
    const cases = [
      ["/goal", { action: "status" }],
      ["/goal status", { action: "status" }],
      ["/goal create Ship it", { action: "set", objective: "Ship it", status: "active" }],
      ["/goal Ship it", { action: "set", objective: "Ship it", status: "active" }],
      ["/goal steer Narrow the patch", { action: "set", objective: "Narrow the patch" }],
      ["/goal edit Narrow the patch", { action: "set", objective: "Narrow the patch" }],
      ["/goal pause", { action: "set", status: "paused" }],
      ["/goal resume", { action: "set", status: "active" }],
      ["/goal clear", { action: "clear" }],
      ["/goal reset", { action: "clear" }],
      [
        "/goal edit",
        {
          action: "invalid",
          message: "T3 does not open Codex's Goal editor. Use /goal steer <objective>.",
        },
      ],
      ["please create a goal", null],
    ] as const;
    for (const [command, expected] of cases) {
      expect(parseCodexGoalCommand(command)).toEqual(expected);
    }
  });
});

describe("derivePromptGoalFromUserTexts", () => {
  it("keeps the latest set objective until clear", () => {
    expect(
      derivePromptGoalFromUserTexts([
        "/goal Prove the claim",
        "keep going on the proof",
        "/goal pause",
      ]),
    ).toEqual({ objective: "Prove the claim", status: "paused", startedAt: null });
    expect(derivePromptGoalFromUserTexts(["/goal Prove the claim", "/goal clear"])).toBeNull();
    expect(derivePromptGoalFromUserTexts(["/goal Prove the claim", "clear go"])).toBeNull();
    expect(derivePromptGoalFromUserTexts(["/goal Prove the claim", "go clear"])).toBeNull();
  });

  it("rewrites clear aliases to /goal clear", () => {
    expect(resolvePromptGoalControlText("clear go")).toBe("/goal clear");
    expect(resolvePromptGoalControlText("go clear")).toBe("/goal clear");
    expect(resolvePromptGoalControlText("/goal clear")).toBe("/goal clear");
    expect(resolvePromptGoalControlText("/goal status")).toBe("/goal status");
    expect(resolvePromptGoalControlText("keep going")).toBeNull();
  });

  it("keeps the set-message timestamp for elapsed time", () => {
    expect(
      derivePromptGoalFromUserTexts([
        { text: "/goal Prove the claim", createdAt: "2026-08-28T12:00:00.000Z" },
        { text: "/goal pause", createdAt: "2026-08-28T12:10:00.000Z" },
      ]),
    ).toEqual({
      objective: "Prove the claim",
      status: "paused",
      startedAt: "2026-08-28T12:00:00.000Z",
    });
  });

  it("labels a live turn as running", () => {
    expect(
      formatPromptGoalTitle({ objective: "Ship it", status: "active", startedAt: null }, true),
    ).toBe("Goal running");
    expect(
      formatPromptGoalTitle({ objective: "Ship it", status: "paused", startedAt: null }, true),
    ).toBe("Goal paused");
  });

  it("formats elapsed time from Codex seconds or a start stamp", () => {
    expect(formatPromptGoalElapsedLabel({ timeUsedSeconds: 90 })).toBe("2m");
    expect(
      formatPromptGoalElapsedLabel({
        startedAt: "2026-08-28T12:00:00.000Z",
        now: new Date("2026-08-28T12:04:00.000Z"),
      }),
    ).toBe("4m");
    expect(formatPromptGoalElapsedLabel({})).toBeNull();
  });

  it("expands the Grok goal strip to the full objective and running state", () => {
    const collapsed = buildGoalStripContent({
      title: "Goal active",
      objective: "Prove Klaus Pinn's D-sequence claims",
      durationLabel: "4m",
      running: true,
      expanded: false,
    });
    const expanded = buildGoalStripContent({
      title: "Goal active",
      objective: "Prove Klaus Pinn's D-sequence claims",
      durationLabel: "4m",
      running: true,
      expanded: true,
    });
    expect(collapsed.activateLabel).toBe("Show full goal");
    expect(collapsed.body).toBe("Prove Klaus Pinn's D-sequence claims");
    expect(expanded.activateLabel).toBe("Hide full goal");
    expect(expanded.body).toContain("Prove Klaus Pinn's D-sequence claims");
    expect(expanded.body).toContain("running");
    expect(expanded.body).toContain("4m");
  });
});

describe("toCodexGoalSetInput", () => {
  it("adds the thread id without inventing omitted native fields", () => {
    expect(toCodexGoalSetInput(threadId, { action: "set", objective: "Ship it" })).toEqual({
      threadId,
      objective: "Ship it",
    });
  });
});

describe("applyCodexGoalStreamEvent", () => {
  it("formats native usage consistently for clients", () => {
    expect(formatCodexGoalDescription(goal("Ship it"))).toBe(
      "Ship it - 12,000 tokens / 100,000, 90 seconds",
    );
  });

  it("formats native statuses as user-facing labels", () => {
    const statuses = [
      "active",
      "paused",
      "budgetLimited",
      "usageLimited",
      "complete",
      "blocked",
    ] as const;
    expect(statuses.map(formatCodexGoalStatus)).toEqual([
      "active",
      "paused",
      "budget limited",
      "usage limited",
      "complete",
      "blocked",
    ]);
  });

  it("applies native updated and cleared notifications", () => {
    const updated = applyCodexGoalStreamEvent({
      type: "updated",
      threadId,
      goal: goal("Updated asynchronously"),
    });
    expect(updated?.objective).toBe("Updated asynchronously");
    expect(applyCodexGoalStreamEvent({ type: "cleared", threadId })).toBeNull();
  });

  it("accepts the authoritative snapshot after reconnect", () => {
    const reconnectSnapshot: CodexGoalStreamEvent = {
      type: "snapshot",
      threadId,
      goal: goal("Changed while disconnected"),
    };
    expect(applyCodexGoalStreamEvent(reconnectSnapshot)?.objective).toBe(
      "Changed while disconnected",
    );
  });
});

describe("formatCodexGoalError", () => {
  it("appends the provider reason carried in the error cause", () => {
    const error = new Error("Codex Goal set failed for thread thread-1", {
      cause: new Error("Provider 'claude' is not implemented"),
    });
    expect(formatCodexGoalError(error)).toBe(
      "Codex Goal set failed for thread thread-1: Provider 'claude' is not implemented",
    );
  });

  it("falls back to the wrapper message when the cause carries no reason", () => {
    expect(formatCodexGoalError(new Error("Codex Goal get failed for thread thread-1"))).toBe(
      "Codex Goal get failed for thread thread-1",
    );
  });

  it("handles non-error failures", () => {
    expect(formatCodexGoalError("boom")).toBe("Codex Goal operation failed.");
  });
});

describe("formatCodexGoalUsage", () => {
  it("renders the budget when one is set", () => {
    expect(formatCodexGoalUsage(goal("Ship it"))).toBe("12,000 tokens / 100,000, 90 seconds");
  });

  it("omits the budget when there is none", () => {
    expect(formatCodexGoalUsage({ ...goal("Ship it"), tokenBudget: null })).toBe(
      "12,000 tokens, 90 seconds",
    );
  });

  it("is the usage half of the full description", () => {
    const withBudget = goal("Ship it");
    expect(formatCodexGoalDescription(withBudget)).toBe(
      `Ship it - ${formatCodexGoalUsage(withBudget)}`,
    );
  });
});

const ENVIRONMENT_ID = EnvironmentId.make("remote");
const THREAD_ID = ThreadId.make("thread");
const NOW = "2026-09-12T10:00:00.000Z";
const SNAPSHOT: OrchestrationShellSnapshot = {
  snapshotSequence: 1,
  updatedAt: NOW,
  projects: [],
  threads: [
    {
      id: THREAD_ID,
      projectId: ProjectId.make("project"),
      title: "Remote thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      latestTurn: null,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      pullRequests: [],
      session: null,
      latestUserMessageAt: null,
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      hasActionableProposedPlan: false,
    },
  ],
};

const makeHarness = Effect.fn("TestThreadCommands.makeHarness")(function* () {
  const requests = yield* Queue.unbounded<{
    command: ClientOrchestrationCommand;
    reply: Deferred.Deferred<{ sequence: number }, Error>;
  }>();
  const supervisor = EnvironmentSupervisor.of({
    target: { environmentId: ENVIRONMENT_ID },
    session: yield* SubscriptionRef.make(
      Option.some({
        client: {
          [ORCHESTRATION_WS_METHODS.dispatchCommand]: (command: ClientOrchestrationCommand) =>
            Effect.gen(function* () {
              const reply = yield* Deferred.make<{ sequence: number }, Error>();
              yield* Queue.offer(requests, { command, reply });
              return yield* Deferred.await(reply);
            }),
        },
      } as unknown as RpcSession),
    ),
  } as EnvironmentSupervisor["Service"]);
  const runtime = Atom.runtime(
    Layer.mergeAll(
      Layer.succeed(EnvironmentRegistry, {
        run: (_environmentId, effect) =>
          Effect.provideService(effect, EnvironmentSupervisor, supervisor),
      } as EnvironmentRegistry["Service"]),
      Layer.succeed(
        Crypto.Crypto,
        Crypto.make({
          randomBytes: (size) => new Uint8Array(size),
          digest: (_algorithm, data) => Effect.succeed(data),
        }),
      ),
    ),
  );
  const snapshotAtom = Atom.family((_environmentId: EnvironmentId) => Atom.make(SNAPSHOT));
  const commands = createThreadEnvironmentAtoms(runtime, snapshotAtom);
  const registry = AtomRegistry.make();
  yield* Effect.addFinalizer(() => Effect.sync(() => registry.dispose()));
  const visibleAtom = commands.snapshotAtom(ENVIRONMENT_ID);
  registry.mount(visibleAtom);
  return { registry, commands, snapshotAtom, visibleAtom, requests };
});

describe("remote thread lifecycle commands", () => {
  const actions = [
    ["settle", {}, { settledOverride: "settled", pinnedAt: null, snoozedUntil: null }],
    ["unsettle", { reason: "user" }, { settledOverride: "active", settledAt: null }],
    [
      "snooze",
      { snoozedUntil: "2099-01-01T00:00:00.000Z" },
      { snoozedUntil: "2099-01-01T00:00:00.000Z" },
    ],
    ["unsnooze", { reason: "user" }, { snoozedUntil: null, snoozedAt: null }],
    ["pin", { orderKey: "a" }, { pinnedAt: expect.any(String), pinOrderKey: "a" }],
    ["unpin", {}, { pinnedAt: null, pinOrderKey: null }],
    ["reorderPin", { orderKey: "b" }, { pinOrderKey: "b" }],
    ["reorderActive", { orderKey: "b" }, { activeOrderKey: "b" }],
  ] as const;

  for (const [action, input, expected] of actions) {
    it.effect(`shows ${action} before a delayed remote reply and rolls back a rejection`, () =>
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const source = h.snapshotAtom(ENVIRONMENT_ID);
        const initial = {
          ...SNAPSHOT,
          threads: [
            {
              ...SNAPSHOT.threads[0]!,
              ...(action === "unsettle" || action === "pin"
                ? { settledOverride: "settled" as const, settledAt: NOW }
                : {}),
              ...(action === "unsnooze" || action === "settle" || action === "pin"
                ? { snoozedUntil: "2099-01-01T00:00:00.000Z", snoozedAt: NOW }
                : {}),
              ...(action === "unpin" || action === "settle"
                ? { pinnedAt: NOW, pinOrderKey: "a" }
                : {}),
            },
          ],
        };
        h.registry.set(source, initial);
        const result = h.commands[action].run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: {
            threadId: THREAD_ID,
            commandId: CommandId.make(action),
            reason: "user",
            orderKey: "a",
            snoozedUntil: "2099-01-01T00:00:00.000Z",
            ...input,
          },
        });
        expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject(expected);
        const request = yield* Queue.take(h.requests);
        expect(h.registry.get(source)).toBe(initial);
        yield* Deferred.fail(request.reply, new Error("Remote rejected the action"));
        expect((yield* Effect.promise(() => result))._tag).toBe("Failure");
        expect(h.registry.get(h.visibleAtom)).toBe(initial);
      }),
    );
  }

  it.effect("keeps the preview after acknowledgement until the matching shell update arrives", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const result = h.commands.settle.run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: { threadId: THREAD_ID },
      });
      const request = yield* Queue.take(h.requests);
      yield* Deferred.succeed(request.reply, { sequence: 3 });
      expect((yield* Effect.promise(() => result))._tag).toBe("Success");
      const changed = {
        ...SNAPSHOT,
        snapshotSequence: 2,
        threads: [{ ...SNAPSHOT.threads[0]!, title: "Renamed remotely" }],
      };
      h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), changed);
      expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject({
        title: "Renamed remotely",
        settledOverride: "settled",
      });
      const confirmed = {
        ...changed,
        snapshotSequence: 3,
        threads: [
          {
            ...changed.threads[0]!,
            settledOverride: "settled" as const,
            settledAt: "2026-09-12T12:00:00.000Z",
          },
        ],
      };
      h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), confirmed);
      expect(h.registry.get(h.visibleAtom)).toBe(confirmed);
      h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), { ...SNAPSHOT, snapshotSequence: 4 });
      expect(h.registry.get(h.visibleAtom)?.threads[0]?.settledOverride).toBeNull();
    }),
  );

  it.effect(
    "shows a queued reverse action immediately and preserves it if the earlier action fails",
    () =>
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const settle = h.commands.settle.run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: THREAD_ID },
        });
        const first = yield* Queue.take(h.requests);
        const unsettle = h.commands.unsettle.run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: THREAD_ID, reason: "user" },
        });
        expect(h.registry.get(h.visibleAtom)?.threads[0]?.settledOverride).toBe("active");
        yield* Deferred.fail(first.reply, new Error("Settle rejected"));
        yield* Effect.promise(() => settle);
        expect(h.registry.get(h.visibleAtom)?.threads[0]?.settledOverride).toBe("active");
        const second = yield* Queue.take(h.requests);
        expect(second.command.type).toBe("thread.unsettle");
        const confirmed = {
          ...SNAPSHOT,
          snapshotSequence: 2,
          threads: [{ ...SNAPSHOT.threads[0]!, settledOverride: "active" as const }],
        };
        h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), confirmed);
        yield* Deferred.succeed(second.reply, { sequence: 2 });
        yield* Effect.promise(() => unsettle);
        expect(h.registry.get(h.visibleAtom)).toBe(confirmed);
      }),
  );

  it.effect("isolates environments and does not restore a remotely removed thread", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const otherEnvironment = EnvironmentId.make("other-remote");
      const result = h.commands.settle.run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: { threadId: THREAD_ID },
      });
      const request = yield* Queue.take(h.requests);
      expect(h.registry.get(h.commands.snapshotAtom(otherEnvironment))).toBe(SNAPSHOT);
      const removed = { ...SNAPSHOT, snapshotSequence: 2, threads: [] };
      h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), removed);
      expect(h.registry.get(h.visibleAtom)?.threads).toEqual([]);
      yield* Deferred.fail(request.reply, new Error("Thread removed"));
      yield* Effect.promise(() => result);
      expect(h.registry.get(h.visibleAtom)).toBe(removed);
    }),
  );

  it.effect("keeps pending approvals visible while a lifecycle request is pending", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const blocked = {
        ...SNAPSHOT,
        threads: [{ ...SNAPSHOT.threads[0]!, hasPendingApprovals: true }],
      };
      h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), blocked);
      const result = h.commands.settle.run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: { threadId: THREAD_ID },
      });
      const request = yield* Queue.take(h.requests);
      expect(h.registry.get(h.visibleAtom)?.threads[0]).toBe(blocked.threads[0]);
      yield* Deferred.fail(request.reply, new Error("Approval pending"));
      yield* Effect.promise(() => result);
    }),
  );

  for (const action of ["settle", "snooze"] as const) {
    it.effect(`restores a confirmed ${action} when a queued undo fails`, () =>
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const parked =
          action === "settle"
            ? { settledOverride: "settled" as const }
            : { snoozedUntil: "2099-01-01T00:00:00.000Z" };
        const awake = action === "settle" ? { settledOverride: "active" } : { snoozedUntil: null };
        const result = h.commands[action].run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: THREAD_ID, snoozedUntil: "2099-01-01T00:00:00.000Z" },
        });
        const first = yield* Queue.take(h.requests);
        const undo = h.commands[action === "settle" ? "unsettle" : "unsnooze"].run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: THREAD_ID, reason: "user" },
        });
        expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject(awake);
        yield* Deferred.succeed(first.reply, { sequence: 2 });
        expect((yield* Effect.promise(() => result))._tag).toBe("Success");
        expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject(awake);
        const confirmed = {
          ...SNAPSHOT,
          snapshotSequence: 2,
          threads: [{ ...SNAPSHOT.threads[0]!, ...parked }],
        };
        h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), confirmed);
        expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject(awake);
        const second = yield* Queue.take(h.requests);
        expect(second.command.type).toBe(
          action === "settle" ? "thread.unsettle" : "thread.unsnooze",
        );
        yield* Deferred.fail(second.reply, new Error("Undo rejected"));
        expect((yield* Effect.promise(() => undo))._tag).toBe("Failure");
        expect(h.registry.get(h.visibleAtom)).toBe(confirmed);
      }),
    );

    it.effect(`preserves a newer approval when the ${action} reply arrives after the shell`, () =>
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const result = h.commands[action].run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: THREAD_ID, snoozedUntil: "2099-01-01T00:00:00.000Z" },
        });
        const request = yield* Queue.take(h.requests);
        const newer = {
          ...SNAPSHOT,
          snapshotSequence: 3,
          threads: [{ ...SNAPSHOT.threads[0]!, hasPendingApprovals: true }],
        };
        h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), newer);
        expect(h.registry.get(h.visibleAtom)?.threads[0]).toBe(newer.threads[0]);
        yield* Deferred.succeed(request.reply, { sequence: 2 });
        expect((yield* Effect.promise(() => result))._tag).toBe("Success");
        expect(h.registry.get(h.visibleAtom)).toBe(newer);
      }),
    );

    it.effect(`shows an accepted ${action} while the shell still has an old input request`, () =>
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const stale = {
          ...SNAPSHOT,
          threads: [{ ...SNAPSHOT.threads[0]!, hasPendingUserInput: true }],
        };
        h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), stale);
        const result = h.commands[action].run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: THREAD_ID, snoozedUntil: "2099-01-01T00:00:00.000Z" },
        });
        const request = yield* Queue.take(h.requests);
        expect(h.registry.get(h.visibleAtom)?.threads[0]).toBe(stale.threads[0]);
        yield* Deferred.succeed(request.reply, { sequence: 2 });
        expect((yield* Effect.promise(() => result))._tag).toBe("Success");
        expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject(
          action === "settle"
            ? { settledOverride: "settled" }
            : { snoozedUntil: "2099-01-01T00:00:00.000Z" },
        );
        expect(h.registry.get(h.visibleAtom)?.threads[0]?.hasPendingUserInput).toBe(false);
        expect(h.registry.get(h.snapshotAtom(ENVIRONMENT_ID))).toBe(stale);
      }),
    );
  }
});
