import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

const execFileAsync = promisify(execFile);

export const LOCAL_UPDATE_FEED_DIR_NAME = "t3code-local-updates";
export const LOCAL_UPDATE_FEED_HOST = "127.0.0.1";
export const LOCAL_UPDATE_FEED_PORT = 47821;
export const LOCAL_UPDATE_FEED_URL = `http://${LOCAL_UPDATE_FEED_HOST}:${LOCAL_UPDATE_FEED_PORT}`;
export const WINDOWS_T3_INSTALL_DIR_SEGMENTS = ["Programs", "t3code"] as const;
export const WINDOWS_T3_APP_EXECUTABLE_NAME = "T3 Code (Alpha).exe";
export const WINDOWS_T3_APP_UPDATE_YML_SEGMENTS = ["resources", "app-update.yml"] as const;

export function resolveLocalGenericPublishConfig(): {
  readonly provider: "generic";
  readonly url: string;
} {
  return {
    provider: "generic",
    url: LOCAL_UPDATE_FEED_URL,
  };
}

export function resolveLocalUpdateFeedDirectory(input: {
  readonly env: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
  readonly homedir: string;
  readonly pathJoin: (...parts: string[]) => string;
}): string {
  const override = input.env.T3CODE_LOCAL_UPDATE_FEED_DIR?.trim();
  if (override) {
    return override;
  }

  const localAppData = input.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return input.pathJoin(localAppData, LOCAL_UPDATE_FEED_DIR_NAME);
  }

  return input.pathJoin(input.homedir, `.${LOCAL_UPDATE_FEED_DIR_NAME}`);
}

export function resolveWindowsT3InstallDirectory(
  localAppData: string,
  pathJoin: (...parts: string[]) => string,
): string {
  return pathJoin(localAppData, ...WINDOWS_T3_INSTALL_DIR_SEGMENTS);
}

export function resolveWindowsT3AppUpdateYmlPath(
  localAppData: string,
  pathJoin: (...parts: string[]) => string,
): string {
  return pathJoin(
    resolveWindowsT3InstallDirectory(localAppData, pathJoin),
    ...WINDOWS_T3_APP_UPDATE_YML_SEGMENTS,
  );
}

export function resolveWindowsT3AppExecutablePath(
  localAppData: string,
  pathJoin: (...parts: string[]) => string,
): string {
  return pathJoin(
    resolveWindowsT3InstallDirectory(localAppData, pathJoin),
    WINDOWS_T3_APP_EXECUTABLE_NAME,
  );
}

export function isWindowsLocalUpdateFeedArtifact(fileName: string): boolean {
  if (fileName === "latest.yml") {
    return true;
  }
  if (fileName.endsWith(".exe.blockmap")) {
    return true;
  }
  return fileName.endsWith(".exe") && !fileName.includes(".blockmap");
}

export const stageWindowsLocalUpdateFeed = Effect.fn("stageWindowsLocalUpdateFeed")(function* (
  artifactPaths: readonly string[],
  feedDir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(feedDir, { recursive: true });

  const staged: string[] = [];
  for (const from of artifactPaths) {
    const name = path.basename(from);
    if (!isWindowsLocalUpdateFeedArtifact(name)) {
      continue;
    }
    const to = path.join(feedDir, name);
    yield* fs.copyFile(from, to);
    staged.push(to);
  }
  return staged;
});

export function shouldBootstrapLocalNsisInstall(input: {
  readonly githubActions: boolean;
  readonly skipInstall: boolean;
  readonly forceInstall: boolean;
  readonly platform: string;
  readonly target: string;
  readonly installedAppUpdateYmlExists: boolean;
}): boolean {
  if (input.githubActions || input.skipInstall) {
    return false;
  }
  if (input.platform !== "win" || input.target !== "nsis") {
    return false;
  }
  if (input.forceInstall) {
    return true;
  }
  // Packs that already have app-update.yml can Check for Updates / quitAndInstall.
  // Older local installs have no feed, so the only way in is a silent NSIS pass.
  return !input.installedAppUpdateYmlExists;
}

export interface LocalNsisBootstrapDeps {
  readonly listPids: () => Promise<readonly number[]>;
  readonly requestQuit: (pids: readonly number[]) => Promise<void>;
  readonly waitForExit: (pids: readonly number[], timeoutMs: number) => Promise<boolean>;
  readonly forceKill: (pids: readonly number[]) => Promise<void>;
  readonly runInstaller: (installerPath: string) => Promise<number>;
  readonly relaunch: (appExePath: string) => Promise<void>;
  readonly sleep: (ms: number) => Promise<void>;
}

export interface LocalNsisBootstrapResult {
  readonly installerExitCode: number;
  readonly forceKilled: boolean;
}

const QUIT_WAIT_MS = 20_000;
const POST_QUIT_SETTLE_MS = 1_000;
const POST_INSTALL_SETTLE_MS = 2_000;

export async function bootstrapLocalWindowsNsisInstall(input: {
  readonly installerPath: string;
  readonly appExePath: string;
  readonly deps: LocalNsisBootstrapDeps;
  readonly quitWaitMs?: number;
}): Promise<LocalNsisBootstrapResult> {
  const pids = await input.deps.listPids();
  let forceKilled = false;
  if (pids.length > 0) {
    await input.deps.requestQuit(pids);
    const exited = await input.deps.waitForExit(pids, input.quitWaitMs ?? QUIT_WAIT_MS);
    if (!exited) {
      await input.deps.forceKill(pids);
      forceKilled = true;
    }
    await input.deps.sleep(POST_QUIT_SETTLE_MS);
  }

  const installerExitCode = await input.deps.runInstaller(input.installerPath);
  if (installerExitCode !== 0) {
    throw new Error(`Silent NSIS install failed with exit code ${installerExitCode}.`);
  }

  await input.deps.sleep(POST_INSTALL_SETTLE_MS);
  await input.deps.relaunch(input.appExePath);
  return { installerExitCode, forceKilled };
}

function parseProcessIds(stdout: string): number[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line))
    .map((line) => Number(line));
}

async function listWindowsT3InstallProcessIds(): Promise<number[]> {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -like '*\\Programs\\t3code\\*') } | ForEach-Object { $_.ProcessId }",
    ],
    { windowsHide: true },
  );
  return parseProcessIds(stdout);
}

async function taskkillPids(pids: readonly number[], force: boolean): Promise<void> {
  for (const pid of pids) {
    const args = force ? ["/PID", String(pid), "/T", "/F"] : ["/PID", String(pid), "/T"];
    await execFileAsync("taskkill.exe", args, { windowsHide: true }).catch(() => undefined);
  }
}

async function waitForPidsToExit(pids: readonly number[], timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const remaining = new Set(pids);
  while (remaining.size > 0 && Date.now() < deadline) {
    const stillRunning = await listWindowsT3InstallProcessIds();
    for (const pid of [...remaining]) {
      if (!stillRunning.includes(pid)) {
        remaining.delete(pid);
      }
    }
    if (remaining.size === 0) {
      return true;
    }
    await sleep(500);
  }
  return remaining.size === 0;
}

function spawnAndWait(
  command: string,
  args: readonly string[],
  options: { readonly windowsHide?: boolean } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      detached: false,
      stdio: "ignore",
      windowsHide: options.windowsHide ?? false,
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const windowsLocalNsisBootstrapDeps: LocalNsisBootstrapDeps = {
  listPids: listWindowsT3InstallProcessIds,
  requestQuit: (pids) => taskkillPids(pids, false),
  waitForExit: waitForPidsToExit,
  forceKill: (pids) => taskkillPids(pids, true),
  runInstaller: (installerPath) => spawnAndWait(installerPath, ["/S"]),
  relaunch: (appExePath) =>
    spawnAndWait("explorer.exe", [appExePath], { windowsHide: true }).then(() => undefined),
  sleep,
};
