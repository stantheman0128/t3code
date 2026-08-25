// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";

import {
  grokHomeSessionWorkspaceDirNames,
  listTranscriptFiles,
  readTranscriptRecords,
} from "./usageTranscriptReader.ts";
import { GROK_COST_USD_TICKS_PER_DOLLAR } from "./usageTranscripts.ts";

function makeTempDir(): string {
  return NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-usage-scan-"));
}

function writeFile(root: string, relativePath: string, contents: string): string {
  const fullPath = NodePath.join(root, relativePath);
  NodeFS.mkdirSync(NodePath.dirname(fullPath), { recursive: true });
  NodeFS.writeFileSync(fullPath, contents);
  return fullPath;
}

function grokUsageLine(sessionId: string, promptId: string): string {
  return `${JSON.stringify({
    timestamp: "2026-08-01T05:00:00.000Z",
    method: "_x.ai/session/update",
    params: {
      sessionId,
      update: {
        sessionUpdate: "turn_completed",
        promptId,
        usage: {
          model: "grok-4.6",
          inputTokens: 10,
          outputTokens: 4,
          costUsdTicks: GROK_COST_USD_TICKS_PER_DOLLAR,
        },
      },
    },
  })}\n`;
}

describe("grokHomeSessionWorkspaceDirNames", () => {
  it("encodes the Windows homedir the way Grok names session workspaces", () => {
    expect(grokHomeSessionWorkspaceDirNames("C:\\Users\\stans")).toContain("C%3A%5CUsers%5Cstans");
  });

  it("also encodes the forward-slash form so mixed separators still skip", () => {
    const names = grokHomeSessionWorkspaceDirNames("C:\\Users\\stans");
    expect(names).toContain("C%3A%5CUsers%5Cstans");
    expect(names).toContain("C%3A%2FUsers%2Fstans");
  });
});

describe("listTranscriptFiles", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) NodeFS.rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("restricts the walk to a basename when given fileName", async () => {
    const root = makeTempDir();
    dirs.push(root);
    writeFile(root, NodePath.join("proj", "sess", "updates.jsonl"), "a\n");
    writeFile(root, NodePath.join("proj", "sess", "chat_history.jsonl"), "b\n");
    writeFile(root, NodePath.join("proj", "sess", "events.jsonl"), "c\n");

    const files = await listTranscriptFiles(root, 0, { fileName: "updates.jsonl" });

    expect(files.map((file) => NodePath.basename(file.path))).toEqual(["updates.jsonl"]);
  });

  it("does not descend into skipped workspace directory names", async () => {
    const root = makeTempDir();
    dirs.push(root);
    const homeWorkspace = "C%3A%5CUsers%5Cstans";
    writeFile(root, NodePath.join(homeWorkspace, "sess-1", "updates.jsonl"), "home\n");
    writeFile(
      root,
      NodePath.join("C%3A%5CUsers%5Cstans%5CProjects", "sess-2", "updates.jsonl"),
      "proj\n",
    );

    const files = await listTranscriptFiles(root, 0, {
      fileName: "updates.jsonl",
      skipDirNames: new Set(grokHomeSessionWorkspaceDirNames("C:\\Users\\stans")),
    });

    expect(files).toHaveLength(1);
    expect(files[0]?.path.replaceAll("\\", "/")).toContain("C%3A%5CUsers%5Cstans%5CProjects");
    expect(files[0]?.path.replaceAll("\\", "/")).not.toContain(`${homeWorkspace}/sess-1`);
  });
});

describe("readTranscriptRecords", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) NodeFS.rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("parses only the appended tail when given a start offset", async () => {
    const root = makeTempDir();
    dirs.push(root);
    const first = grokUsageLine("sess", "p1");
    const second = grokUsageLine("sess", "p2");
    const filePath = writeFile(root, "updates.jsonl", first + second);

    const head = await readTranscriptRecords(filePath, "grok", { startOffset: 0 });
    expect(head?.complete).toBe(true);
    expect(head?.records).toHaveLength(2);

    const tail = await readTranscriptRecords(filePath, "grok", { startOffset: first.length });
    expect(tail?.complete).toBe(true);
    expect(tail?.records).toHaveLength(1);
    expect(tail?.records[0]?.dedupeKey).toBe("sess:p2");
  });

  it("reports an incomplete read when the deadline has already passed", async () => {
    const root = makeTempDir();
    dirs.push(root);
    const filePath = writeFile(root, "updates.jsonl", grokUsageLine("sess", "p1"));

    const result = await readTranscriptRecords(filePath, "grok", { deadlineMs: 0 });
    expect(result).not.toBeNull();
    expect(result?.complete).toBe(false);
    expect(result?.records).toHaveLength(0);
  });
});
