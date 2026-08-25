// @effect-diagnostics nodeBuiltinImport:off
/**
 * Raw filesystem access for transcript scanning.
 *
 * Isolated here so the rest of the usage code stays on Effect's `FileSystem`.
 * The direct `node:fs` streaming is deliberate: a cold 30-day window is ~1.4 GB
 * across ~1,500 files, and `readline` over a read stream is roughly an order of
 * magnitude cheaper than materialising each file. The equivalent Effect stream
 * pipeline is idiomatic but not fast enough to sit behind a page load.
 *
 * @module usageTranscriptReader
 */
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";

import type { UsageProviderKind } from "@t3tools/contracts";

import {
  initialCodexScanState,
  mightCarryUsage,
  parseClaudeLine,
  parseCodexLine,
  parseGrokLine,
  type UsageRecord,
} from "./usageTranscripts.ts";

export interface TranscriptFile {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
}

export interface ListTranscriptFilesOptions {
  /** When set, only files with this basename are collected. */
  readonly fileName?: string;
  /** Directory basenames that must not be descended into. */
  readonly skipDirNames?: ReadonlySet<string>;
}

/**
 * Grok stores sessions under `sessions/<encodeURIComponent(cwd)>/<id>/`.
 * A session whose cwd is the user home is not a project, and on a busy machine
 * that folder can hold thousands of stub transcripts that drown the Usage scan.
 */
export function grokHomeSessionWorkspaceDirNames(homeDir: string): readonly string[] {
  const names = new Set<string>();
  names.add(encodeURIComponent(homeDir));
  const posix = homeDir.replaceAll("\\", "/");
  names.add(encodeURIComponent(posix));
  return [...names];
}

export const GROK_TRANSCRIPT_FILE_NAME = "updates.jsonl";

/**
 * Lists `.jsonl` transcripts under `root` last modified at or after `sinceMs`.
 *
 * Errors on individual entries are swallowed: session files rotate and get
 * removed while the walk is in flight, and a partial listing is far better than
 * failing the page.
 */
export async function listTranscriptFiles(
  root: string,
  sinceMs: number,
  options?: ListTranscriptFilesOptions,
): Promise<readonly TranscriptFile[]> {
  const found: TranscriptFile[] = [];
  const skipDirNames = options?.skipDirNames;
  const fileName = options?.fileName;

  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await NodeFSP.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skipDirNames?.has(entry.name)) continue;
        await walk(NodePath.join(dir, entry.name));
        continue;
      }
      if (fileName !== undefined ? entry.name !== fileName : !entry.name.endsWith(".jsonl")) {
        continue;
      }
      const child = NodePath.join(dir, entry.name);
      try {
        const stats = await NodeFSP.stat(child);
        if (stats.mtimeMs >= sinceMs) {
          found.push({ path: child, size: stats.size, mtimeMs: stats.mtimeMs });
        }
      } catch {
        // Vanished between readdir and stat.
      }
    }
  };

  await walk(root);
  return found;
}

/**
 * Filesystem identity of a directory, as `device:inode`.
 *
 * Used to tell "two servers reading the same transcript directory" apart from
 * "two machines whose hostname and home path happen to match". Returns an empty
 * string when the directory cannot be stat'd.
 */
export async function readDirectoryVolumeId(path: string): Promise<string> {
  try {
    const stats = await NodeFSP.stat(path);
    return `${stats.dev}:${stats.ino}`;
  } catch {
    return "";
  }
}

export interface TranscriptReadOptions {
  /** Byte offset to start from. Append-only files resume here on a cache miss. */
  readonly startOffset?: number;
  /** Unix-ms deadline; when already passed, the read returns `complete: false`. */
  readonly deadlineMs?: number;
}

export interface TranscriptReadResult {
  readonly records: readonly UsageRecord[];
  /** Bytes of the file that have been consumed, suitable as the next startOffset. */
  readonly bytesConsumed: number;
  readonly complete: boolean;
}

/**
 * Streams one transcript and returns the usage records it contains, or `null`
 * when the file could not be read.
 *
 * The distinction matters to the caller's cache: a genuinely empty transcript
 * is a stable fact worth memoising, while a transient read failure memoised
 * under the same `(size, mtime)` key would silently drop that file's usage
 * until the file next changes.
 *
 * Codex carries the active model on `turn_context` lines that hold no usage of
 * their own, so those still have to pass through the reducer to keep model
 * attribution correct.
 */
export async function readTranscriptRecords(
  filePath: string,
  provider: UsageProviderKind,
  options?: TranscriptReadOptions,
): Promise<TranscriptReadResult | null> {
  const records: UsageRecord[] = [];
  const codexState = initialCodexScanState();
  const startOffset = options?.startOffset ?? 0;
  const deadlineMs = options?.deadlineMs;
  let bytesConsumed = startOffset;
  let complete = true;

  try {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      return { records, bytesConsumed, complete: false };
    }

    const stream = NodeFS.createReadStream(filePath, {
      encoding: "utf8",
      start: startOffset,
    });
    const lines = NodeReadline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
        complete = false;
        lines.close();
        stream.destroy();
        break;
      }
      bytesConsumed += Buffer.byteLength(line, "utf8") + 1;

      if (provider === "codex") {
        if (
          !mightCarryUsage(line, provider) &&
          !line.includes('"turn_context"') &&
          !line.includes('"session_meta"')
        ) {
          continue;
        }
        const record = parseCodexLine(line, codexState);
        if (record !== null) records.push(record);
        continue;
      }

      if (provider === "grok") {
        if (!mightCarryUsage(line, provider)) continue;
        const record = parseGrokLine(line);
        if (record !== null) records.push(record);
        continue;
      }

      if (!mightCarryUsage(line, provider)) continue;
      const record = parseClaudeLine(line);
      if (record !== null) records.push(record);
    }
  } catch {
    return null;
  }

  return { records, bytesConsumed, complete };
}
