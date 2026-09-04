// @effect-diagnostics nodeBuiltinImport:off - resume coverage writes, appends
// to, and truncates real transcript files byte-exactly, mirroring the reader's
// own deliberate node:fs usage.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, assert, beforeEach, describe, it } from "@effect/vitest";

import {
  grokHomeSessionWorkspaceDirNames,
  listTranscriptFiles,
  readTranscriptRecords,
} from "./usageTranscriptReader.ts";
import { GROK_COST_USD_TICKS_PER_DOLLAR } from "./usageTranscripts.ts";

let dir: string;

beforeEach(async () => {
  dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "usage-reader-test-"));
});

afterEach(async () => {
  await NodeFSP.rm(dir, { recursive: true, force: true });
});

function claudeLine(id: number, outputTokens: number): string {
  return `${JSON.stringify({
    type: "assistant",
    timestamp: "2026-08-01T10:00:00Z",
    requestId: `req_${id}`,
    sessionId: "session-1",
    message: {
      id: `msg_${id}`,
      model: "claude-fable-5",
      usage: { input_tokens: 10, output_tokens: outputTokens },
    },
  })}\n`;
}

function codexMetaLine(): string {
  return `${JSON.stringify({
    type: "session_meta",
    timestamp: "2026-08-01T10:00:00Z",
    payload: { type: "session_meta", id: "codex-session-1" },
  })}\n`;
}

function codexModelLine(model: string): string {
  return `${JSON.stringify({
    type: "turn_context",
    timestamp: "2026-08-01T10:00:01Z",
    payload: { type: "turn_context", model },
  })}\n`;
}

function codexUsageLine(outputTokens: number, secondsOffset: number): string {
  return `${JSON.stringify({
    type: "event_msg",
    timestamp: `2026-08-01T10:00:${String(secondsOffset).padStart(2, "0")}Z`,
    payload: {
      type: "token_count",
      info: { last_token_usage: { input_tokens: 100, output_tokens: outputTokens } },
    },
  })}\n`;
}

describe("readTranscriptRecords resume", () => {
  it("parses only appended lines when resuming a grown file", async () => {
    const path = NodePath.join(dir, "claude.jsonl");
    await NodeFSP.writeFile(path, claudeLine(1, 5) + claudeLine(2, 7));
    const first = await readTranscriptRecords(path, "claude");
    assert.isNotNull(first);
    assert.strictEqual(first.records.length, 2);
    assert.isFalse(first.resumed);

    await NodeFSP.appendFile(path, claudeLine(3, 11));
    const second = await readTranscriptRecords(path, "claude", first.position);
    assert.isNotNull(second);
    assert.isTrue(second.resumed);
    assert.strictEqual(second.records.length, 1);
    assert.strictEqual(second.records[0]?.totals.outputTokens, 11);

    // The stitched result matches a from-scratch parse of the whole file.
    const full = await readTranscriptRecords(path, "claude");
    assert.isNotNull(full);
    assert.deepStrictEqual([...first.records, ...second.records], [...full.records]);
  });

  it("carries the Codex reducer state across the resume boundary", async () => {
    const path = NodePath.join(dir, "rollout.jsonl");
    await NodeFSP.writeFile(path, codexMetaLine() + codexModelLine("gpt-5.2-codex"));
    const first = await readTranscriptRecords(path, "codex");
    assert.isNotNull(first);
    assert.strictEqual(first.records.length, 0);

    // The appended usage event has no turn_context or session_meta of its own;
    // model and session must come from the state captured before the boundary.
    await NodeFSP.appendFile(path, codexUsageLine(9, 5));
    const second = await readTranscriptRecords(path, "codex", first.position);
    assert.isNotNull(second);
    assert.isTrue(second.resumed);
    assert.strictEqual(second.records.length, 1);
    assert.strictEqual(second.records[0]?.model, "gpt-5.2-codex");
    assert.strictEqual(second.records[0]?.sessionId, "codex-session-1");
  });

  it("suppresses a Codex duplicate usage event that straddles the boundary", async () => {
    const path = NodePath.join(dir, "rollout.jsonl");
    await NodeFSP.writeFile(
      path,
      codexMetaLine() + codexModelLine("gpt-5.2-codex") + codexUsageLine(9, 5),
    );
    const first = await readTranscriptRecords(path, "codex");
    assert.isNotNull(first);
    assert.strictEqual(first.records.length, 1);

    // Codex re-emits an unchanged token_count on stream boundaries; the copy
    // lands after the resume point and must still be dropped.
    await NodeFSP.appendFile(path, codexUsageLine(9, 5) + codexUsageLine(21, 8));
    const second = await readTranscriptRecords(path, "codex", first.position);
    assert.isNotNull(second);
    assert.isTrue(second.resumed);
    assert.deepStrictEqual(
      second.records.map((record) => record.totals.outputTokens),
      [21],
    );
  });

  it("defers an unterminated trailing line to tailRecords, then consumes it once terminated", async () => {
    const path = NodePath.join(dir, "claude.jsonl");
    const unterminated = claudeLine(2, 7).trimEnd();
    await NodeFSP.writeFile(path, claudeLine(1, 5) + unterminated);
    const first = await readTranscriptRecords(path, "claude");
    assert.isNotNull(first);
    assert.strictEqual(first.records.length, 1);
    assert.strictEqual(first.tailRecords.length, 1);
    assert.strictEqual(first.tailRecords[0]?.totals.outputTokens, 7);

    // Completing the line and appending another re-reads from the resume
    // point, so the once-tail record arrives exactly once as a line record.
    await NodeFSP.appendFile(path, `\n${claudeLine(3, 11)}`);
    const second = await readTranscriptRecords(path, "claude", first.position);
    assert.isNotNull(second);
    assert.isTrue(second.resumed);
    assert.deepStrictEqual(
      second.records.map((record) => record.totals.outputTokens),
      [7, 11],
    );
    assert.strictEqual(second.tailRecords.length, 0);
  });

  it("re-parses from the start when the guard bytes no longer match", async () => {
    const path = NodePath.join(dir, "claude.jsonl");
    await NodeFSP.writeFile(path, claudeLine(1, 5));
    const first = await readTranscriptRecords(path, "claude");
    assert.isNotNull(first);

    // Same path, larger size, different content: a replaced file, not growth.
    await NodeFSP.writeFile(path, claudeLine(4, 13) + claudeLine(5, 17));
    const second = await readTranscriptRecords(path, "claude", first.position);
    assert.isNotNull(second);
    assert.isFalse(second.resumed);
    assert.deepStrictEqual(
      second.records.map((record) => record.totals.outputTokens),
      [13, 17],
    );
  });

  it("re-parses from the start when the file shrank below the resume point", async () => {
    const path = NodePath.join(dir, "claude.jsonl");
    await NodeFSP.writeFile(path, claudeLine(1, 5) + claudeLine(2, 7));
    const first = await readTranscriptRecords(path, "claude");
    assert.isNotNull(first);

    await NodeFSP.writeFile(path, claudeLine(3, 11));
    const second = await readTranscriptRecords(path, "claude", first.position);
    assert.isNotNull(second);
    assert.isFalse(second.resumed);
    assert.deepStrictEqual(
      second.records.map((record) => record.totals.outputTokens),
      [11],
    );
  });

  it("parses a line larger than one stream chunk", async () => {
    // Tool-heavy transcripts carry multi-megabyte single lines; they arrive
    // split across many chunks and must reassemble into one record.
    const path = NodePath.join(dir, "claude.jsonl");
    const bigLine = `${JSON.stringify({
      type: "assistant",
      timestamp: "2026-08-01T10:00:00Z",
      requestId: "req_big",
      sessionId: "session-1",
      padding: "x".repeat(512 * 1024),
      message: {
        id: "msg_big",
        model: "claude-fable-5",
        usage: { input_tokens: 10, output_tokens: 42 },
      },
    })}\n`;
    await NodeFSP.writeFile(path, bigLine + claudeLine(2, 7));

    const parsed = await readTranscriptRecords(path, "claude");
    assert.isNotNull(parsed);
    assert.deepStrictEqual(
      parsed.records.map((record) => record.totals.outputTokens),
      [42, 7],
    );
  });

  it("returns null for an unreadable file", async () => {
    assert.isNull(await readTranscriptRecords(NodePath.join(dir, "missing.jsonl"), "claude"));
  });

  it("parses only appended grok usage lines when resuming a grown file", async () => {
    const path = NodePath.join(dir, "updates.jsonl");
    const firstLine = grokUsageLine("sess", "p1");
    await NodeFSP.writeFile(path, firstLine);
    const first = await readTranscriptRecords(path, "grok");
    assert.isNotNull(first);
    assert.strictEqual(first.records.length, 1);
    assert.isFalse(first.resumed);

    await NodeFSP.appendFile(path, grokUsageLine("sess", "p2"));
    const second = await readTranscriptRecords(path, "grok", first.position);
    assert.isNotNull(second);
    assert.isTrue(second.resumed);
    assert.strictEqual(second.records.length, 1);
    assert.strictEqual(second.records[0]?.dedupeKey, "sess:p2:grok");
  });
});

function grokUsageLine(sessionId: string, promptId: string): string {
  return `${JSON.stringify({
    timestamp: 1_786_372_566,
    method: "_x.ai/session/update",
    params: {
      sessionId,
      update: {
        sessionUpdate: "turn_completed",
        prompt_id: promptId,
        usage: {
          inputTokens: 10,
          outputTokens: 4,
          costUsdTicks: GROK_COST_USD_TICKS_PER_DOLLAR,
        },
      },
      _meta: { eventId: promptId, agentTimestampMs: 1_786_372_566_485 },
    },
  })}\n`;
}

describe("grokHomeSessionWorkspaceDirNames", () => {
  it("encodes the Windows homedir the way Grok names session workspaces", () => {
    assert.ok(
      grokHomeSessionWorkspaceDirNames("C:\\Users\\stans").includes("C%3A%5CUsers%5Cstans"),
    );
  });

  it("also encodes the forward-slash form so mixed separators still skip", () => {
    const names = grokHomeSessionWorkspaceDirNames("C:\\Users\\stans");
    assert.ok(names.includes("C%3A%5CUsers%5Cstans"));
    assert.ok(names.includes("C%3A%2FUsers%2Fstans"));
  });
});

describe("listTranscriptFiles", () => {
  it("restricts the walk to a basename when given fileName", async () => {
    await NodeFSP.mkdir(NodePath.join(dir, "proj", "sess"), { recursive: true });
    await NodeFSP.writeFile(NodePath.join(dir, "proj", "sess", "updates.jsonl"), "a\n");
    await NodeFSP.writeFile(NodePath.join(dir, "proj", "sess", "chat_history.jsonl"), "b\n");
    await NodeFSP.writeFile(NodePath.join(dir, "proj", "sess", "events.jsonl"), "c\n");

    const files = await listTranscriptFiles(dir, 0, { fileName: "updates.jsonl" });

    assert.deepStrictEqual(
      files.map((file) => NodePath.basename(file.path)),
      ["updates.jsonl"],
    );
  });

  it("does not descend into skipped workspace directory names", async () => {
    const homeWorkspace = "C%3A%5CUsers%5Cstans";
    await NodeFSP.mkdir(NodePath.join(dir, homeWorkspace, "sess-1"), { recursive: true });
    await NodeFSP.mkdir(NodePath.join(dir, "C%3A%5CUsers%5Cstans%5CProjects", "sess-2"), {
      recursive: true,
    });
    await NodeFSP.writeFile(NodePath.join(dir, homeWorkspace, "sess-1", "updates.jsonl"), "home\n");
    await NodeFSP.writeFile(
      NodePath.join(dir, "C%3A%5CUsers%5Cstans%5CProjects", "sess-2", "updates.jsonl"),
      "proj\n",
    );

    const files = await listTranscriptFiles(dir, 0, {
      fileName: "updates.jsonl",
      skipDirNames: new Set(grokHomeSessionWorkspaceDirNames("C:\\Users\\stans")),
    });

    assert.strictEqual(files.length, 1);
    const listed = files[0]!.path.replaceAll("\\", "/");
    assert.ok(listed.includes("C%3A%5CUsers%5Cstans%5CProjects"));
    assert.ok(!listed.includes(`${homeWorkspace}/sess-1`));
  });
});
