#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import * as NodeFs from "node:fs";
import * as NodeFsPromises from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { promisify } from "node:util";

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Flag, Command } from "effect/unstable/cli";

import { resolveLocalUpdateFeedDirectory } from "./lib/local-update-feed.ts";
import {
  DEFAULT_LOCAL_DESKTOP_PACK_DEBOUNCE_MS,
  DEFAULT_LOCAL_DESKTOP_PACK_FAILURE_BACKOFF_MS,
  DEFAULT_LOCAL_DESKTOP_PACK_KEEP_INSTALLERS,
  DEFAULT_LOCAL_DESKTOP_PACK_POLL_MS,
  LOCAL_DESKTOP_PACK_LOCK_FILE_NAME,
  LOCAL_DESKTOP_PACK_LOG_FILE_NAME,
  LOCAL_DESKTOP_PACK_STATE_FILE_NAME,
  LOCAL_DESKTOP_PACK_WATCHER_PID_FILE_NAME,
  decideLocalDesktopPackTick,
  installerArtifactsToPrune,
  isProcessAlive,
  noteHeadObservation,
  packProcessPath,
  parseFeedVersion,
  parsePackLock,
  parsePackState,
  resolveLocalDesktopPackVersion,
  resolvePreferredNodePath,
  serializePackLock,
  serializePackState,
} from "./lib/local-desktop-pack.ts";

const execFileAsync = promisify(execFile);
const REPO_ROOT = NodePath.resolve(import.meta.dirname, "..");
const ARTIFACT_SCRIPT = NodePath.join(REPO_ROOT, "scripts", "build-desktop-artifact.ts");
const INSTALL_TASK_SCRIPT = NodePath.join(
  REPO_ROOT,
  "scripts",
  "install-local-desktop-pack-task.ps1",
);

interface WatchOptions {
  readonly once: boolean;
  readonly installTask: boolean;
  readonly pollMs: number;
  readonly debounceMs: number;
}

function feedDirectory(): string {
  return resolveLocalUpdateFeedDirectory({
    env: process.env,
    homedir: NodeOs.homedir(),
    pathJoin: NodePath.join,
  });
}

function preferredNodePath(): string {
  const programFiles = process.env.ProgramFiles?.trim();
  return resolvePreferredNodePath({
    envNode: process.env.T3CODE_PACK_NODE?.trim(),
    vitePlusNode: NodePath.join(NodeOs.homedir(), ".vite-plus", "bin", "node.exe"),
    programFilesNode:
      programFiles === undefined ? undefined : NodePath.join(programFiles, "nodejs", "node.exe"),
    execPath: process.execPath,
    exists: (filePath) => NodeFs.existsSync(filePath),
  });
}

function appendLog(logPath: string, line: string): void {
  const stamped = `${new Date().toISOString()} ${line}\n`;
  process.stdout.write(stamped);
  NodeFs.appendFileSync(logPath, stamped);
}

function lowerProcessPriority(): void {
  try {
    NodeOs.setPriority(NodeOs.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    return;
  }
}

async function readTextIfPresent(filePath: string): Promise<string | undefined> {
  try {
    return await NodeFsPromises.readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

async function gitStdout(repoRoot: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd: repoRoot,
    windowsHide: true,
    encoding: "utf8",
  });
  return stdout.trim();
}

function parsePackageVersion(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version !== "string") {
      return undefined;
    }
    const version = parsed.version.trim();
    return version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}

async function readAliveLockPid(lockPath: string): Promise<number | undefined> {
  const raw = await readTextIfPresent(lockPath);
  if (raw === undefined) {
    return undefined;
  }
  const lock = parsePackLock(raw);
  if (lock === undefined || !isProcessAlive(lock.pid)) {
    return undefined;
  }
  return lock.pid;
}

async function claimWatcher(pidPath: string, logPath: string): Promise<boolean> {
  const raw = await readTextIfPresent(pidPath);
  const existing = raw === undefined ? Number.NaN : Number.parseInt(raw.trim(), 10);
  if (isProcessAlive(existing) && existing !== process.pid) {
    appendLog(logPath, `Watcher already running as pid ${existing}; exiting.`);
    return false;
  }
  await NodeFsPromises.mkdir(NodePath.dirname(pidPath), { recursive: true });
  await NodeFsPromises.writeFile(pidPath, `${process.pid}\n`);
  return true;
}

async function releaseWatcher(pidPath: string): Promise<void> {
  const raw = await readTextIfPresent(pidPath);
  const existing = raw === undefined ? Number.NaN : Number.parseInt(raw.trim(), 10);
  if (existing === process.pid) {
    await NodeFsPromises.unlink(pidPath).catch(() => undefined);
  }
}

async function pruneFeed(feedDir: string, logPath: string): Promise<void> {
  const names = await NodeFsPromises.readdir(feedDir);
  const prune = installerArtifactsToPrune(names, DEFAULT_LOCAL_DESKTOP_PACK_KEEP_INSTALLERS);
  for (const name of prune) {
    await NodeFsPromises.unlink(NodePath.join(feedDir, name)).catch(() => undefined);
  }
  if (prune.length > 0) {
    appendLog(logPath, `Pruned ${prune.length} old feed artifacts.`);
  }
}

function runDesktopPack(input: {
  readonly nodeExe: string;
  readonly version: string;
  readonly arch: "x64" | "arm64";
  readonly logPath: string;
}): Promise<number> {
  const pathEnv = packProcessPath({
    inheritedPath: process.env.PATH,
    repoRoot: REPO_ROOT,
    homedir: NodeOs.homedir(),
    programFiles: process.env.ProgramFiles?.trim(),
    pathJoin: NodePath.join,
    platform: process.platform,
  });
  return new Promise((resolve, reject) => {
    const child = spawn(
      input.nodeExe,
      [
        ARTIFACT_SCRIPT,
        "--platform",
        "win",
        "--target",
        "nsis",
        "--arch",
        input.arch,
        "--build-version",
        input.version,
      ],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          ...(pathEnv === undefined ? {} : { PATH: pathEnv }),
          T3CODE_SKIP_INSTALL: "1",
        },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (child.pid !== undefined) {
      try {
        NodeOs.setPriority(child.pid, NodeOs.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Pack still runs at the inherited priority.
      }
    }
    const logFile = NodeFs.createWriteStream(input.logPath, { flags: "a" });
    const tee = (stream: NodeJS.ReadableStream | null, dest: NodeJS.WritableStream) => {
      stream?.on("data", (chunk: string | Uint8Array) => {
        dest.write(chunk);
        logFile.write(chunk);
      });
    };
    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);
    child.on("error", (cause) => {
      logFile.end();
      reject(cause);
    });
    child.on("exit", (code) => {
      logFile.end();
      resolve(code ?? 1);
    });
  });
}

async function installLogonTask(logPath: string): Promise<void> {
  const nodeExe = preferredNodePath();
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      INSTALL_TASK_SCRIPT,
      "-RepoRoot",
      REPO_ROOT,
      "-NodeExe",
      nodeExe,
      "-Start",
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  const output = `${stdout}${stderr}`.trim();
  if (output.length > 0) {
    appendLog(logPath, output);
  }
}

async function watchLoop(options: WatchOptions, logPath: string): Promise<void> {
  const feedDir = feedDirectory();
  const statePath = NodePath.join(feedDir, LOCAL_DESKTOP_PACK_STATE_FILE_NAME);
  const lockPath = NodePath.join(feedDir, LOCAL_DESKTOP_PACK_LOCK_FILE_NAME);
  const pidPath = NodePath.join(feedDir, LOCAL_DESKTOP_PACK_WATCHER_PID_FILE_NAME);
  const claimed = await claimWatcher(pidPath, logPath);
  if (!claimed) {
    return;
  }

  const release = () => {
    void releaseWatcher(pidPath);
  };
  process.once("SIGINT", () => {
    release();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    release();
    process.exit(0);
  });

  let previousSha: string | undefined;
  let lastChangedAtMs = Date.now();
  let lastFailureSha: string | undefined;
  let lastFailureAtMs: number | undefined;
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const nodeExe = preferredNodePath();

  appendLog(
    logPath,
    `Watching ${REPO_ROOT} -> ${feedDir} (poll=${options.pollMs}ms debounce=${options.debounceMs}ms node=${nodeExe})`,
  );

  const tick = async (): Promise<"packed" | "idle"> => {
    const currentSha = await gitStdout(REPO_ROOT, ["rev-parse", "HEAD"]);
    const observed = noteHeadObservation({
      previousSha,
      currentSha,
      previousChangedAtMs: lastChangedAtMs,
      nowMs: Date.now(),
    });
    if (previousSha !== currentSha) {
      appendLog(
        logPath,
        `HEAD ${currentSha.slice(0, 12)} (was ${previousSha?.slice(0, 12) ?? "none"})`,
      );
    }
    previousSha = currentSha;
    lastChangedAtMs = observed.lastChangedAtMs;

    const packed = parsePackState((await readTextIfPresent(statePath)) ?? "");
    const lockPid = await readAliveLockPid(lockPath);
    const decision = decideLocalDesktopPackTick({
      nowMs: Date.now(),
      currentSha,
      packedSha: packed?.sha,
      packing: lockPid !== undefined && lockPid !== process.pid,
      lastChangedAtMs,
      debounceMs: options.debounceMs,
      ignoreDebounce: options.once,
      lastFailureSha,
      lastFailureAtMs,
      failureBackoffMs: DEFAULT_LOCAL_DESKTOP_PACK_FAILURE_BACKOFF_MS,
    });
    if (decision.action === "skip") {
      return "idle";
    }

    const packageRaw = await NodeFsPromises.readFile(
      NodePath.join(REPO_ROOT, "apps", "server", "package.json"),
      "utf8",
    );
    const packageVersion = parsePackageVersion(packageRaw);
    if (packageVersion === undefined) {
      throw new Error("apps/server/package.json is missing a version.");
    }
    const feedVersion = parseFeedVersion(
      (await readTextIfPresent(NodePath.join(feedDir, "latest.yml"))) ?? "",
    );
    const version = resolveLocalDesktopPackVersion({ packageVersion, feedVersion });
    const porcelain = await gitStdout(REPO_ROOT, ["status", "--porcelain"]);
    if (porcelain.length > 0) {
      const dirtyCount = porcelain.split(/\r?\n/).filter((line) => line.length > 0).length;
      appendLog(logPath, `Warning: packing a dirty tree (${dirtyCount} paths).`);
    }

    appendLog(
      logPath,
      `Packing ${version} from ${currentSha.slice(0, 12)} (feed ${feedVersion ?? "none"}).`,
    );
    await NodeFsPromises.writeFile(
      lockPath,
      serializePackLock({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
    try {
      const exitCode = await runDesktopPack({ nodeExe, version, arch, logPath });
      if (exitCode !== 0) {
        lastFailureSha = currentSha;
        lastFailureAtMs = Date.now();
        appendLog(logPath, `Pack failed with exit code ${exitCode}.`);
        return "idle";
      }
      await NodeFsPromises.writeFile(
        statePath,
        serializePackState({
          sha: currentSha,
          version,
          packedAt: new Date().toISOString(),
        }),
      );
      lastFailureSha = undefined;
      lastFailureAtMs = undefined;
      await pruneFeed(feedDir, logPath);
      appendLog(logPath, `Staged ${version}. In T3 Code, Check for Updates, then Update.`);
      return "packed";
    } finally {
      await NodeFsPromises.unlink(lockPath).catch(() => undefined);
    }
  };

  try {
    if (options.once) {
      await tick();
      return;
    }
    while (true) {
      try {
        await tick();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        appendLog(logPath, `Watch tick failed: ${message}`);
        lastFailureSha = previousSha;
        lastFailureAtMs = Date.now();
      }
      await new Promise((resolve) => {
        setTimeout(resolve, options.pollMs);
      });
    }
  } finally {
    await releaseWatcher(pidPath);
  }
}

async function main(options: WatchOptions): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Local desktop pack watching is Windows-only.");
  }
  lowerProcessPriority();
  const feedDir = feedDirectory();
  await NodeFsPromises.mkdir(feedDir, { recursive: true });
  const logPath = NodePath.join(feedDir, LOCAL_DESKTOP_PACK_LOG_FILE_NAME);
  if (options.installTask) {
    await installLogonTask(logPath);
    return;
  }
  await watchLoop(options, logPath);
}

const watchLocalDesktopPackCommand = Command.make(
  "watch-local-desktop-pack",
  {
    once: Flag.boolean("once").pipe(
      Flag.withDescription("Pack once if HEAD is ahead of the local feed, then exit."),
      Flag.withDefault(false),
    ),
    installTask: Flag.boolean("install-task").pipe(
      Flag.withDescription("Register the logon scheduled task and start it, then exit."),
      Flag.withDefault(false),
    ),
    pollMs: Flag.integer("poll-ms").pipe(
      Flag.withDescription("How often to read git HEAD while watching."),
      Flag.optional,
    ),
    debounceMs: Flag.integer("debounce-ms").pipe(
      Flag.withDescription("Wait this long after HEAD last changed before packing."),
      Flag.optional,
    ),
  },
  ({ once, installTask, pollMs, debounceMs }) =>
    Effect.tryPromise({
      try: () =>
        main({
          once,
          installTask,
          pollMs: Option.getOrElse(pollMs, () => DEFAULT_LOCAL_DESKTOP_PACK_POLL_MS),
          debounceMs: Option.getOrElse(debounceMs, () => DEFAULT_LOCAL_DESKTOP_PACK_DEBOUNCE_MS),
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    }),
).pipe(
  Command.withDescription(
    "Watch this repo's git HEAD and stage unsigned Windows installers into the local update feed.",
  ),
);

if (import.meta.main) {
  Command.run(watchLocalDesktopPackCommand, { version: "0.0.0" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
