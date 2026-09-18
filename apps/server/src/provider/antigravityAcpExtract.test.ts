import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { makeAntigravityAcpRuntime } from "./acp/AntigravityAcpSupport.ts";
import { ANTIGRAVITY_EXTRACT_DIR_PREFIX } from "./antigravityAcpLifecycle.ts";

const unpackMockPath = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../../scripts/antigravity-unpack-mock.ts",
);

const leftoverNames = (entries: ReadonlyArray<string>): ReadonlyArray<string> =>
  entries.filter(
    (entry) => entry.startsWith(ANTIGRAVITY_EXTRACT_DIR_PREFIX) || entry.startsWith("_MEI"),
  );

const makeProbeRuntime = (input: {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly crypto: Crypto.Crypto["Service"];
  readonly cwd: string;
  readonly parentTemp: string;
  readonly hold?: boolean;
}) =>
  makeAntigravityAcpRuntime({
    cwd: input.cwd,
    childProcessSpawner: input.childProcessSpawner,
    clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
    extractParentDirectory: input.parentTemp,
    forceKillAfter: "1 second",
    gracefulShutdownWait: input.hold === true ? "400 millis" : "2 seconds",
    spawn: {
      command: process.execPath,
      args: [unpackMockPath],
      cwd: input.cwd,
      env: {
        ...process.env,
        T3_ACP_ANTIGRAVITY: "1",
        ...(input.hold === true ? { T3_AGY_UNPACK_HOLD: "1" } : {}),
      },
      extendEnv: false,
    },
  }).pipe(Effect.provideService(Crypto.Crypto, input.crypto));

it.live(
  "points Antigravity unpacking at an owned extract root and removes it after initialize",
  () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const parentTemp = yield* fileSystem.makeTempDirectory({
        prefix: "t3-agy-probe-parent-",
      });
      yield* Effect.addFinalizer(() =>
        fileSystem.remove(parentTemp, { recursive: true, force: true }).pipe(Effect.ignore),
      );
      const cwd = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-agy-probe-cwd-",
      });

      const during = yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* makeProbeRuntime({
            crypto,
            childProcessSpawner,
            cwd,
            parentTemp,
          });
          const extractDirs = leftoverNames(yield* fileSystem.readDirectory(parentTemp));
          expect(extractDirs).toHaveLength(1);
          const extractRoot = path.join(parentTemp, extractDirs[0] ?? "");
          expect(yield* runtime.initialize()).toMatchObject({ protocolVersion: 1 });
          const meiDirs = leftoverNames(yield* fileSystem.readDirectory(extractRoot)).filter(
            (entry) => entry.startsWith("_MEI"),
          );
          expect(meiDirs).toHaveLength(1);
          const marker = yield* fileSystem.readFileString(
            path.join(extractRoot, meiDirs[0] ?? "", "agy_acp_licenses.txt"),
          );
          expect(marker).toContain(extractRoot);
          return extractRoot;
        }),
      );

      expect(yield* fileSystem.exists(during)).toBe(false);
      expect(leftoverNames(yield* fileSystem.readDirectory(parentTemp))).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  30_000,
);

it.live(
  "does not accumulate Antigravity extract roots across sequential probes",
  () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const crypto = yield* Crypto.Crypto;
      const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const parentTemp = yield* fileSystem.makeTempDirectory({
        prefix: "t3-agy-probe-seq-",
      });
      yield* Effect.addFinalizer(() =>
        fileSystem.remove(parentTemp, { recursive: true, force: true }).pipe(Effect.ignore),
      );
      const cwd = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-agy-probe-seq-cwd-",
      });

      for (let index = 0; index < 3; index++) {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const runtime = yield* makeProbeRuntime({
              crypto,
              childProcessSpawner,
              cwd,
              parentTemp,
            });
            expect(yield* runtime.initialize()).toMatchObject({ protocolVersion: 1 });
          }),
        );
      }

      expect(leftoverNames(yield* fileSystem.readDirectory(parentTemp))).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  45_000,
);

it.live(
  "still removes the owned extract root after a hung bootloader is force-killed",
  () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const crypto = yield* Crypto.Crypto;
      const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const parentTemp = yield* fileSystem.makeTempDirectory({
        prefix: "t3-agy-probe-hold-",
      });
      yield* Effect.addFinalizer(() =>
        fileSystem.remove(parentTemp, { recursive: true, force: true }).pipe(Effect.ignore),
      );
      const cwd = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-agy-probe-hold-cwd-",
      });

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* makeProbeRuntime({
            crypto,
            childProcessSpawner,
            cwd,
            parentTemp,
            hold: true,
          });
          expect(leftoverNames(yield* fileSystem.readDirectory(parentTemp))).toHaveLength(1);
        }),
      );

      expect(leftoverNames(yield* fileSystem.readDirectory(parentTemp))).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  30_000,
);
