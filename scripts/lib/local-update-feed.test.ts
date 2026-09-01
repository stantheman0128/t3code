import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  LOCAL_UPDATE_FEED_DIR_NAME,
  LOCAL_UPDATE_FEED_URL,
  bootstrapLocalWindowsNsisInstall,
  isWindowsLocalUpdateFeedArtifact,
  resolveLocalGenericPublishConfig,
  resolveLocalUpdateFeedDirectory,
  resolveWindowsT3AppExecutablePath,
  resolveWindowsT3AppUpdateYmlPath,
  shouldBootstrapLocalNsisInstall,
  stageWindowsLocalUpdateFeed,
} from "./local-update-feed.ts";

describe("local-update-feed", () => {
  it("uses a loopback generic publish config for local packs", () => {
    assert.deepStrictEqual(resolveLocalGenericPublishConfig(), {
      provider: "generic",
      url: LOCAL_UPDATE_FEED_URL,
    });
    assert.equal(LOCAL_UPDATE_FEED_URL, "http://127.0.0.1:47821");
  });

  it("resolves the local update feed directory from env, then LOCALAPPDATA", () => {
    assert.equal(
      resolveLocalUpdateFeedDirectory({
        env: { T3CODE_LOCAL_UPDATE_FEED_DIR: "D:\\feed" },
        homedir: "C:\\Users\\stan",
        pathJoin: (...parts) => parts.join("\\"),
      }),
      "D:\\feed",
    );
    assert.equal(
      resolveLocalUpdateFeedDirectory({
        env: { LOCALAPPDATA: "C:\\Users\\stan\\AppData\\Local" },
        homedir: "C:\\Users\\stan",
        pathJoin: (...parts) => parts.join("\\"),
      }),
      `C:\\Users\\stan\\AppData\\Local\\${LOCAL_UPDATE_FEED_DIR_NAME}`,
    );
    assert.equal(
      resolveLocalUpdateFeedDirectory({
        env: {},
        homedir: "/home/stan",
        pathJoin: (...parts) => parts.join("/"),
      }),
      `/home/stan/.${LOCAL_UPDATE_FEED_DIR_NAME}`,
    );
  });

  it("points Windows install metadata at Start Menu T3 Code", () => {
    const join = (...parts: string[]) => parts.join("\\");
    const localAppData = "C:\\Users\\stan\\AppData\\Local";
    assert.equal(
      resolveWindowsT3AppUpdateYmlPath(localAppData, join),
      "C:\\Users\\stan\\AppData\\Local\\Programs\\t3code\\resources\\app-update.yml",
    );
    assert.equal(
      resolveWindowsT3AppExecutablePath(localAppData, join),
      "C:\\Users\\stan\\AppData\\Local\\Programs\\t3code\\T3 Code (Alpha).exe",
    );
  });

  it("selects latest.yml plus the NSIS installer and blockmap", () => {
    assert.isTrue(isWindowsLocalUpdateFeedArtifact("latest.yml"));
    assert.isTrue(isWindowsLocalUpdateFeedArtifact("T3-Code-0.0.87-x64.exe"));
    assert.isTrue(isWindowsLocalUpdateFeedArtifact("T3-Code-0.0.87-x64.exe.blockmap"));
    assert.isFalse(isWindowsLocalUpdateFeedArtifact("builder-debug.yml"));
    assert.isFalse(isWindowsLocalUpdateFeedArtifact("T3-Code-0.0.87-x64.dmg"));
  });

  it("bootstraps silent NSIS only when the installed app has no update feed", () => {
    const base = {
      githubActions: false,
      skipInstall: false,
      forceInstall: false,
      platform: "win",
      target: "nsis",
      installedAppUpdateYmlExists: false,
    };

    assert.isTrue(shouldBootstrapLocalNsisInstall(base));
    assert.isFalse(shouldBootstrapLocalNsisInstall({ ...base, installedAppUpdateYmlExists: true }));
    assert.isTrue(
      shouldBootstrapLocalNsisInstall({
        ...base,
        installedAppUpdateYmlExists: true,
        forceInstall: true,
      }),
    );
    assert.isFalse(shouldBootstrapLocalNsisInstall({ ...base, githubActions: true }));
    assert.isFalse(shouldBootstrapLocalNsisInstall({ ...base, skipInstall: true }));
    assert.isFalse(shouldBootstrapLocalNsisInstall({ ...base, platform: "mac", target: "dmg" }));
  });

  it("quits T3, silent-installs, then relaunches", async () => {
    const calls: Array<readonly unknown[]> = [];
    const result = await bootstrapLocalWindowsNsisInstall({
      installerPath: "C:\\release\\T3-Code-0.0.87-x64.exe",
      appExePath: "C:\\Programs\\t3code\\T3 Code (Alpha).exe",
      deps: {
        listPids: async () => [10, 11],
        requestQuit: async (pids) => {
          calls.push(["quit", [...pids]]);
        },
        waitForExit: async () => true,
        forceKill: async () => {
          calls.push(["force"]);
        },
        runInstaller: async (installerPath) => {
          calls.push(["install", installerPath]);
          return 0;
        },
        relaunch: async (appExePath) => {
          calls.push(["relaunch", appExePath]);
        },
        sleep: async () => undefined,
      },
    });

    assert.deepStrictEqual(result, { installerExitCode: 0, forceKilled: false });
    assert.deepStrictEqual(calls, [
      ["quit", [10, 11]],
      ["install", "C:\\release\\T3-Code-0.0.87-x64.exe"],
      ["relaunch", "C:\\Programs\\t3code\\T3 Code (Alpha).exe"],
    ]);
  });

  it("force-kills T3 if a graceful quit does not finish", async () => {
    const calls: string[] = [];
    const result = await bootstrapLocalWindowsNsisInstall({
      installerPath: "C:\\i.exe",
      appExePath: "C:\\t3.exe",
      deps: {
        listPids: async () => [42],
        requestQuit: async () => {
          calls.push("quit");
        },
        waitForExit: async () => false,
        forceKill: async () => {
          calls.push("force");
        },
        runInstaller: async () => {
          calls.push("install");
          return 0;
        },
        relaunch: async () => {
          calls.push("relaunch");
        },
        sleep: async () => undefined,
      },
    });

    assert.isTrue(result.forceKilled);
    assert.deepStrictEqual(calls, ["quit", "force", "install", "relaunch"]);
  });

  it("rejects a non-zero silent installer exit", async () => {
    let thrown: unknown;
    try {
      await bootstrapLocalWindowsNsisInstall({
        installerPath: "C:\\i.exe",
        appExePath: "C:\\t3.exe",
        deps: {
          listPids: async () => [],
          requestQuit: async () => undefined,
          waitForExit: async () => true,
          forceKill: async () => undefined,
          runInstaller: async () => 2,
          relaunch: async () => undefined,
          sleep: async () => undefined,
        },
      });
    } catch (error) {
      thrown = error;
    }
    assert.isTrue(thrown instanceof Error);
    assert.match((thrown as Error).message, /exit code 2/);
  });
});

it.layer(NodeServices.layer)("stageWindowsLocalUpdateFeed", (it) => {
  it.effect("copies only feed artifacts into the local update directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "local-update-feed-" });
      const fromDir = path.join(root, "release");
      const feedDir = path.join(root, "feed");
      yield* fs.makeDirectory(fromDir, { recursive: true });

      const keep = ["latest.yml", "T3-Code-0.0.87-x64.exe", "T3-Code-0.0.87-x64.exe.blockmap"];
      const skip = ["builder-debug.yml"];
      for (const name of [...keep, ...skip]) {
        yield* fs.writeFileString(path.join(fromDir, name), name);
      }

      const staged = yield* stageWindowsLocalUpdateFeed(
        [...keep, ...skip].map((name) => path.join(fromDir, name)),
        feedDir,
      );

      assert.deepStrictEqual(
        staged.map((entry) => path.basename(entry)).toSorted(),
        keep.toSorted(),
      );
      assert.isTrue(yield* fs.exists(path.join(feedDir, "latest.yml")));
      assert.isFalse(yield* fs.exists(path.join(feedDir, "builder-debug.yml")));
    }),
  );
});
