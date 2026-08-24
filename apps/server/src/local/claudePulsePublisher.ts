import type {
  OrchestrationEvent,
  OrchestrationProjectShell,
  OrchestrationThreadShell,
  ThreadId,
} from "@t3tools/contracts";
import { type AgentAwarenessPhase, projectThreadAwareness } from "@t3tools/shared/agentAwareness";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Duration from "effect/Duration";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as OrchestrationEngine from "../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { eventThreadId, shouldPublishAgentAwarenessEvent } from "../relay/AgentAwarenessRelay.ts";
import { forkParked } from "../serverActivation.ts";
import {
  type ClaudePulseHookPayload,
  claudePulseHookUrl,
  defaultClaudePulsePorts,
  parseClaudePulsePortFile,
  resolveClaudePulsePortFilePath,
} from "./claudePulseHttp.ts";

export type { ClaudePulseHookPayload } from "./claudePulseHttp.ts";
export { parseClaudePulsePortFile, resolveClaudePulsePortFilePath } from "./claudePulseHttp.ts";

export function mapAwarenessPhaseToPulseEvent(
  phase: AgentAwarenessPhase | null,
): Pick<ClaudePulseHookPayload, "hook_event_name" | "notification_type"> {
  switch (phase) {
    case "starting":
    case "running":
      return { hook_event_name: "UserPromptSubmit" };
    case "waiting_for_approval":
    case "waiting_for_input":
      return { hook_event_name: "Notification", notification_type: "permission_prompt" };
    case "completed":
    case "failed":
    case "stale":
      return { hook_event_name: "Stop" };
    default:
      return { hook_event_name: "SessionEnd" };
  }
}

export function buildClaudePulsePayload(input: {
  readonly thread: OrchestrationThreadShell;
  readonly project: OrchestrationProjectShell;
  readonly phase: AgentAwarenessPhase | null;
}): ClaudePulseHookPayload {
  const event = mapAwarenessPhaseToPulseEvent(input.phase);
  const cwd = input.thread.worktreePath ?? input.project.workspaceRoot;
  return {
    source: "t3",
    session_id: input.thread.id,
    hook_event_name: event.hook_event_name,
    cwd,
    model: input.thread.modelSelection.model,
    title: input.thread.title,
    ...(event.notification_type === undefined
      ? {}
      : { notification_type: event.notification_type }),
  };
}

export function pulsePublishIdentity(payload: ClaudePulseHookPayload): string {
  return `${payload.hook_event_name}:${payload.notification_type ?? ""}`;
}

export function isLiveAwarenessPhase(phase: AgentAwarenessPhase | null): boolean {
  return (
    phase === "starting" ||
    phase === "running" ||
    phase === "waiting_for_approval" ||
    phase === "waiting_for_input"
  );
}

export class ClaudePulsePublisher extends Context.Service<
  ClaudePulsePublisher,
  {
    readonly publishThread: (threadId: ThreadId) => Effect.Effect<void>;
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  }
>()("t3/local/claudePulsePublisher") {}

export const make = Effect.gen(function* () {
  const snapshotQuery = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const orchestrationEngine = yield* OrchestrationEngine.OrchestrationEngineService;
  const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;
  const httpClient = yield* HttpClient.HttpClient;
  const publishedByThreadRef = yield* Ref.make(new Map<ThreadId, string>());

  const resolvePulsePorts = Effect.gen(function* () {
    const portFile = resolveClaudePulsePortFilePath(process.env.LOCALAPPDATA);
    if (portFile === null) {
      return defaultClaudePulsePorts(null);
    }
    const contents = yield* fileSystem
      .readFileString(portFile)
      .pipe(Effect.orElseSucceed(() => ""));
    return defaultClaudePulsePorts(parseClaudePulsePortFile(contents));
  });

  const postPayload = (payload: ClaudePulseHookPayload) =>
    Effect.gen(function* () {
      const ports = yield* resolvePulsePorts;
      for (const port of ports) {
        const attempt = yield* Effect.result(
          HttpClientRequest.post(claudePulseHookUrl(port)).pipe(
            HttpClientRequest.bodyJson(payload),
            Effect.flatMap(httpClient.execute),
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.timeout("1.5 seconds"),
          ),
        );
        if (attempt._tag === "Success") {
          return true;
        }
      }
      return false;
    }).pipe(Effect.orElseSucceed(() => false));

  const publishThread: ClaudePulsePublisher["Service"]["publishThread"] = (threadId) =>
    Effect.gen(function* () {
      const thread = yield* snapshotQuery.getThreadShellById(threadId);
      if (Option.isNone(thread)) {
        const previous = yield* Ref.get(publishedByThreadRef);
        if (!previous.has(threadId)) return;
        yield* postPayload({
          source: "t3",
          session_id: threadId,
          hook_event_name: "SessionEnd",
          cwd: "",
        });
        yield* Ref.update(publishedByThreadRef, (current) => {
          const next = new Map(current);
          next.delete(threadId);
          return next;
        });
        return;
      }

      const project = yield* snapshotQuery.getProjectShellById(thread.value.projectId);
      if (Option.isNone(project)) return;

      const environmentId = yield* serverEnvironment.getEnvironmentId;
      const awareness = projectThreadAwareness({
        environmentId,
        project: project.value,
        thread: thread.value,
      });
      const payload = buildClaudePulsePayload({
        thread: thread.value,
        project: project.value,
        phase: awareness?.phase ?? null,
      });
      const identity = pulsePublishIdentity(payload);
      const published = yield* Ref.get(publishedByThreadRef);
      if (published.get(threadId) === identity) return;

      const posted = yield* postPayload(payload);
      if (!posted) return;
      yield* Ref.update(publishedByThreadRef, (current) => {
        const next = new Map(current);
        next.set(threadId, identity);
        return next;
      });
    }).pipe(
      Effect.catchCause(() => Effect.void),
      Effect.withSpan("ClaudePulsePublisher.publishThread"),
    );

  const worker = yield* makeDrainableWorker(publishThread);

  const enqueueLiveThreads = Effect.gen(function* () {
    const snapshot = yield* snapshotQuery.getShellSnapshot();
    const environmentId = yield* serverEnvironment.getEnvironmentId;
    const projects = new Map(snapshot.projects.map((project) => [project.id, project]));
    for (const thread of snapshot.threads) {
      const project = projects.get(thread.projectId);
      if (project === undefined) continue;
      const awareness = projectThreadAwareness({
        environmentId,
        project,
        thread,
      });
      if (!isLiveAwarenessPhase(awareness?.phase ?? null)) continue;
      yield* Ref.update(publishedByThreadRef, (current) => {
        if (!current.has(thread.id)) return current;
        const next = new Map(current);
        next.delete(thread.id);
        return next;
      });
      yield* worker.enqueue(thread.id);
    }
  }).pipe(Effect.catchCause(() => Effect.void));

  const start: ClaudePulsePublisher["Service"]["start"] = Effect.fn("ClaudePulsePublisher.start")(
    function* () {
      yield* Effect.logInfo("ClaudePulse local publisher enabled");
      yield* enqueueLiveThreads;
      yield* forkParked(
        Stream.runForEach(orchestrationEngine.streamDomainEvents, (event: OrchestrationEvent) => {
          const threadId = eventThreadId(event);
          if (threadId === null || !shouldPublishAgentAwarenessEvent(event)) {
            return Effect.void;
          }
          return worker.enqueue(threadId);
        }),
      );
      yield* forkParked(
        enqueueLiveThreads.pipe(Effect.repeat(Schedule.spaced(Duration.seconds(20)))),
      );
    },
  );

  return ClaudePulsePublisher.of({
    publishThread,
    start,
  });
});

export const layer = Layer.effect(ClaudePulsePublisher, make);
