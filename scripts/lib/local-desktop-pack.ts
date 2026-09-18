import { compareSemverVersions, parseSemver } from "@t3tools/shared/semver";
import { mergePathEntries } from "@t3tools/shared/shell";

import { parseUpdateManifest } from "./update-manifest.ts";

export const LOCAL_DESKTOP_PACK_STATE_FILE_NAME = "pack-state.json";
export const LOCAL_DESKTOP_PACK_LOCK_FILE_NAME = "pack.lock";
export const LOCAL_DESKTOP_PACK_LOG_FILE_NAME = "pack.log";
export const LOCAL_DESKTOP_PACK_WATCHER_PID_FILE_NAME = "watcher.pid";
export const LOCAL_DESKTOP_PACK_TASK_NAME = "T3CodeLocalDesktopPack";

export const DEFAULT_LOCAL_DESKTOP_PACK_POLL_MS = 30_000;
export const DEFAULT_LOCAL_DESKTOP_PACK_DEBOUNCE_MS = 5 * 60_000;
export const DEFAULT_LOCAL_DESKTOP_PACK_FAILURE_BACKOFF_MS = 15 * 60_000;
export const DEFAULT_LOCAL_DESKTOP_PACK_KEEP_INSTALLERS = 3;

const INSTALLER_FILE_PATTERN = /^T3-Code-(\d+\.\d+\.\d+)-(x64|arm64)\.exe$/;

export interface LocalDesktopPackState {
  readonly sha: string;
  readonly version: string;
  readonly packedAt: string;
}

export interface LocalDesktopPackLock {
  readonly pid: number;
  readonly startedAt: string;
}

export type LocalDesktopPackSkipReason = "packing" | "already-packed" | "debounce" | "backoff";

export type LocalDesktopPackTick =
  | { readonly action: "skip"; readonly reason: LocalDesktopPackSkipReason }
  | { readonly action: "pack"; readonly reason: "head-ready" };

export function bumpPatchVersion(version: string): string {
  const parsed = parseSemver(version);
  if (!parsed) {
    return "0.0.1";
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

export function resolveLocalDesktopPackVersion(input: {
  readonly packageVersion: string;
  readonly feedVersion: string | undefined;
}): string {
  if (input.feedVersion === undefined) {
    return input.packageVersion;
  }
  if (compareSemverVersions(input.packageVersion, input.feedVersion) > 0) {
    return input.packageVersion;
  }
  const floor =
    compareSemverVersions(input.packageVersion, input.feedVersion) >= 0
      ? input.packageVersion
      : input.feedVersion;
  return bumpPatchVersion(floor);
}

export function parseFeedVersion(raw: string): string | undefined {
  try {
    const version = parseUpdateManifest(raw, "latest.yml", "Windows").version.trim();
    return version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}

export function parsePackState(raw: string): LocalDesktopPackState | undefined {
  try {
    const parsed = JSON.parse(raw) as {
      sha?: unknown;
      version?: unknown;
      packedAt?: unknown;
    };
    if (typeof parsed.sha !== "string" || parsed.sha.trim().length === 0) {
      return undefined;
    }
    if (typeof parsed.version !== "string" || parsed.version.trim().length === 0) {
      return undefined;
    }
    const packedAt = typeof parsed.packedAt === "string" ? parsed.packedAt : "";
    return {
      sha: parsed.sha.trim(),
      version: parsed.version.trim(),
      packedAt,
    };
  } catch {
    return undefined;
  }
}

export function serializePackState(state: LocalDesktopPackState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function parsePackLock(raw: string): LocalDesktopPackLock | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0) {
      return { pid: parsed, startedAt: "" };
    }
    if (parsed !== null && typeof parsed === "object") {
      const record = parsed as { pid?: unknown; startedAt?: unknown };
      if (typeof record.pid === "number" && Number.isInteger(record.pid) && record.pid > 0) {
        return {
          pid: record.pid,
          startedAt: typeof record.startedAt === "string" ? record.startedAt : "",
        };
      }
    }
  } catch {
    // Fall through to a bare pid line.
  }
  const pid = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    return undefined;
  }
  return { pid, startedAt: "" };
}

export function serializePackLock(lock: LocalDesktopPackLock): string {
  return `${JSON.stringify(lock)}\n`;
}

export function noteHeadObservation(input: {
  readonly previousSha: string | undefined;
  readonly currentSha: string;
  readonly previousChangedAtMs: number;
  readonly nowMs: number;
}): { readonly lastChangedAtMs: number } {
  if (input.previousSha === input.currentSha) {
    return { lastChangedAtMs: input.previousChangedAtMs };
  }
  return { lastChangedAtMs: input.nowMs };
}

export function decideLocalDesktopPackTick(input: {
  readonly nowMs: number;
  readonly currentSha: string;
  readonly packedSha: string | undefined;
  readonly packing: boolean;
  readonly lastChangedAtMs: number;
  readonly debounceMs: number;
  readonly ignoreDebounce: boolean;
  readonly lastFailureSha: string | undefined;
  readonly lastFailureAtMs: number | undefined;
  readonly failureBackoffMs: number;
}): LocalDesktopPackTick {
  if (input.packing) {
    return { action: "skip", reason: "packing" };
  }
  if (input.packedSha === input.currentSha) {
    return { action: "skip", reason: "already-packed" };
  }
  if (
    input.lastFailureSha === input.currentSha &&
    input.lastFailureAtMs !== undefined &&
    input.nowMs - input.lastFailureAtMs < input.failureBackoffMs
  ) {
    return { action: "skip", reason: "backoff" };
  }
  if (!input.ignoreDebounce && input.nowMs - input.lastChangedAtMs < input.debounceMs) {
    return { action: "skip", reason: "debounce" };
  }
  return { action: "pack", reason: "head-ready" };
}

export function installerArtifactsToPrune(fileNames: readonly string[], keep: number): string[] {
  const installers = fileNames.flatMap((name) => {
    const match = INSTALLER_FILE_PATTERN.exec(name);
    if (!match?.[1] || !match[2]) {
      return [];
    }
    return [{ name, version: match[1], arch: match[2] }];
  });
  const sorted = [...installers].sort((left, right) => {
    const versionOrder = compareSemverVersions(right.version, left.version);
    if (versionOrder !== 0) {
      return versionOrder;
    }
    return left.arch.localeCompare(right.arch);
  });
  const kept = new Set(sorted.slice(0, Math.max(0, keep)).map((item) => item.name));
  const prune: string[] = [];
  const names = new Set(fileNames);
  for (const item of installers) {
    if (kept.has(item.name)) {
      continue;
    }
    prune.push(item.name);
    const blockmap = `${item.name}.blockmap`;
    if (names.has(blockmap)) {
      prune.push(blockmap);
    }
  }
  return prune;
}

export function resolvePreferredNodePath(input: {
  readonly envNode: string | undefined;
  readonly vitePlusNode: string;
  readonly programFilesNode: string | undefined;
  readonly execPath: string;
  readonly exists: (filePath: string) => boolean;
}): string {
  const skipAgentRuntime = (candidate: string) => candidate.includes("cursor-agent");
  for (const candidate of [
    input.envNode,
    input.vitePlusNode,
    input.programFilesNode,
    input.execPath,
  ]) {
    if (!candidate || skipAgentRuntime(candidate) || !input.exists(candidate)) {
      continue;
    }
    return candidate;
  }
  return input.execPath;
}

export function packProcessPath(input: {
  readonly inheritedPath: string | undefined;
  readonly repoRoot: string;
  readonly homedir: string;
  readonly programFiles: string | undefined;
  readonly pathJoin: (...parts: string[]) => string;
  readonly platform: NodeJS.Platform;
}): string | undefined {
  const extras = [
    input.pathJoin(input.repoRoot, "node_modules", ".bin"),
    input.pathJoin(input.homedir, ".vite-plus", "bin"),
    input.pathJoin(input.homedir, ".cargo", "bin"),
    input.programFiles === undefined ? undefined : input.pathJoin(input.programFiles, "Git", "cmd"),
  ].filter((entry): entry is string => entry !== undefined);
  return mergePathEntries(
    extras.join(input.platform === "win32" ? ";" : ":"),
    input.inheritedPath,
    input.platform,
  );
}

export function isProcessAlive(
  pid: number,
  exists: (nextPid: number) => boolean = pidExists,
): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  return exists(pid);
}

function pidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
