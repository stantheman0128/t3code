/**
 * Short-lived Codex app-server probe for live account windows.
 *
 * Fail-open: a missing binary, auth wall, or timeout must not fail the
 * Usage page transcript scan.
 *
 * @module codexAccountUsageLive
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as CodexClient from "effect-codex-app-server/client";

import type { CodexSettings } from "@t3tools/contracts";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import { expandHomePath } from "../pathExpansion.ts";
import { codexAppServerArgs } from "../provider/Layers/codexLaunchArgs.ts";
import { mapCodexAccountUsage, unavailableCodexAccountUsage } from "./codexAccountUsage.ts";

const PROBE_TIMEOUT = "6 seconds" as const;
const FORCE_KILL_AFTER = "2 seconds" as const;

export const readLiveCodexAccountUsage = (
  settings: Pick<CodexSettings, "binaryPath" | "homePath" | "launchArgs">,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const resolvedHomePath = settings.homePath ? expandHomePath(settings.homePath) : undefined;
    const env = {
      ...environment,
      ...(resolvedHomePath ? { CODEX_HOME: resolvedHomePath } : {}),
    };
    const spawnCommand = yield* resolveSpawnCommand(
      settings.binaryPath || "codex",
      codexAppServerArgs(settings.launchArgs),
      { env, extendEnv: true },
    );
    const child = yield* spawner.spawn(
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        cwd,
        env,
        extendEnv: true,
        forceKillAfter: FORCE_KILL_AFTER,
        shell: spawnCommand.shell,
      }),
    );
    const clientContext = yield* Layer.build(CodexClient.layerChildProcess(child));
    const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
      Effect.provide(clientContext),
    );
    yield* client.request("initialize", {
      clientInfo: { name: "t3code_desktop", title: "T3 Code Desktop", version: "0.0.0" },
      capabilities: { experimentalApi: true },
    });
    yield* client.notify("initialized", undefined);
    const [usage, rateLimits] = yield* Effect.all(
      [
        client.request("account/usage/read", undefined).pipe(Effect.orElseSucceed(() => undefined)),
        client
          .request("account/rateLimits/read", undefined)
          .pipe(Effect.orElseSucceed(() => undefined)),
      ],
      { concurrency: "unbounded" },
    );
    return mapCodexAccountUsage({
      planType: rateLimits?.rateLimits.planType ?? null,
      lifetimeTokens: usage?.summary.lifetimeTokens ?? null,
      primary: rateLimits?.rateLimits.primary ?? null,
      secondary: rateLimits?.rateLimits.secondary ?? null,
    });
  }).pipe(
    Effect.scoped,
    Effect.timeout(PROBE_TIMEOUT),
    Effect.catchCause(() =>
      Effect.succeed(unavailableCodexAccountUsage("Codex account usage is unavailable.")),
    ),
  );
