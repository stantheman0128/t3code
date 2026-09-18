import { assert, describe, it } from "@effect/vitest";

import {
  bumpPatchVersion,
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
  serializePackState,
} from "./local-desktop-pack.ts";

describe("local-desktop-pack", () => {
  it("uses the package version when it is newer than the feed", () => {
    assert.equal(
      resolveLocalDesktopPackVersion({
        packageVersion: "0.0.99",
        feedVersion: "0.0.98",
      }),
      "0.0.99",
    );
  });

  it("bumps the artifact version when the feed already has the package version", () => {
    assert.equal(bumpPatchVersion("0.0.99"), "0.0.100");
    assert.equal(
      resolveLocalDesktopPackVersion({
        packageVersion: "0.0.99",
        feedVersion: "0.0.99",
      }),
      "0.0.100",
    );
    assert.equal(
      resolveLocalDesktopPackVersion({
        packageVersion: "0.0.99",
        feedVersion: "0.0.101",
      }),
      "0.0.102",
    );
  });

  it("reads the version from latest.yml", () => {
    assert.equal(
      parseFeedVersion(
        [
          "version: 0.0.98",
          "files:",
          "  - url: T3-Code-0.0.98-x64.exe",
          "    sha512: abc",
          "    size: 12",
          "path: T3-Code-0.0.98-x64.exe",
          "sha512: abc",
          "releaseDate: '2026-09-02T09:54:12.984Z'",
          "",
        ].join("\n"),
      ),
      "0.0.98",
    );
    assert.isUndefined(parseFeedVersion("not yaml"));
  });

  it("round-trips pack state and accepts a bare pid lock", () => {
    const state = { sha: "abc", version: "0.0.99", packedAt: "2026-09-09T00:00:00.000Z" };
    assert.deepStrictEqual(parsePackState(serializePackState(state)), state);
    assert.isUndefined(parsePackState("{"));
    assert.deepStrictEqual(parsePackLock('{"pid":42,"startedAt":"now"}'), {
      pid: 42,
      startedAt: "now",
    });
    assert.deepStrictEqual(parsePackLock("99\n"), { pid: 99, startedAt: "" });
  });

  it("resets debounce when HEAD changes and packs after it settles", () => {
    const first = noteHeadObservation({
      previousSha: undefined,
      currentSha: "aaa",
      previousChangedAtMs: 0,
      nowMs: 1_000,
    });
    assert.equal(first.lastChangedAtMs, 1_000);
    const same = noteHeadObservation({
      previousSha: "aaa",
      currentSha: "aaa",
      previousChangedAtMs: 1_000,
      nowMs: 2_000,
    });
    assert.equal(same.lastChangedAtMs, 1_000);

    const base = {
      nowMs: 1_000,
      currentSha: "aaa",
      packedSha: "bbb",
      packing: false,
      lastChangedAtMs: 1_000,
      debounceMs: 5_000,
      ignoreDebounce: false,
      lastFailureSha: undefined,
      lastFailureAtMs: undefined,
      failureBackoffMs: 10_000,
    };
    assert.deepStrictEqual(decideLocalDesktopPackTick(base), {
      action: "skip",
      reason: "debounce",
    });
    assert.deepStrictEqual(decideLocalDesktopPackTick({ ...base, nowMs: 6_000 }), {
      action: "pack",
      reason: "head-ready",
    });
    assert.deepStrictEqual(decideLocalDesktopPackTick({ ...base, ignoreDebounce: true }), {
      action: "pack",
      reason: "head-ready",
    });
    assert.deepStrictEqual(
      decideLocalDesktopPackTick({ ...base, nowMs: 6_000, packedSha: "aaa" }),
      { action: "skip", reason: "already-packed" },
    );
    assert.deepStrictEqual(decideLocalDesktopPackTick({ ...base, packing: true }), {
      action: "skip",
      reason: "packing",
    });
    assert.deepStrictEqual(
      decideLocalDesktopPackTick({
        ...base,
        nowMs: 6_000,
        lastFailureSha: "aaa",
        lastFailureAtMs: 5_000,
        failureBackoffMs: 10_000,
      }),
      { action: "skip", reason: "backoff" },
    );
  });

  it("keeps the newest installers and their blockmaps", () => {
    assert.deepStrictEqual(
      installerArtifactsToPrune(
        [
          "latest.yml",
          "pack-state.json",
          "T3-Code-0.0.97-x64.exe",
          "T3-Code-0.0.97-x64.exe.blockmap",
          "T3-Code-0.0.98-x64.exe",
          "T3-Code-0.0.98-x64.exe.blockmap",
          "T3-Code-0.0.96-x64.exe",
          "T3-Code-0.0.96-x64.exe.blockmap",
          "T3-Code-0.0.95-x64.exe",
        ],
        2,
      ),
      ["T3-Code-0.0.96-x64.exe", "T3-Code-0.0.96-x64.exe.blockmap", "T3-Code-0.0.95-x64.exe"],
    );
  });

  it("prefers vite-plus node over a Cursor agent runtime", () => {
    assert.equal(
      resolvePreferredNodePath({
        envNode: undefined,
        vitePlusNode: "C:\\Users\\stan\\.vite-plus\\bin\\node.exe",
        programFilesNode: "C:\\Program Files\\nodejs\\node.exe",
        execPath: "C:\\Users\\stan\\AppData\\Local\\cursor-agent\\versions\\x\\node.exe",
        exists: (filePath) => filePath.includes(".vite-plus"),
      }),
      "C:\\Users\\stan\\.vite-plus\\bin\\node.exe",
    );
  });

  it("puts repo and toolchain bins ahead of the inherited PATH", () => {
    const next = packProcessPath({
      inheritedPath: "C:\\Windows\\System32",
      repoRoot: "C:\\src\\t3",
      homedir: "C:\\Users\\stan",
      programFiles: "C:\\Program Files",
      pathJoin: (...parts) => parts.join("\\"),
      platform: "win32",
    });
    assert.equal(
      next,
      [
        "C:\\src\\t3\\node_modules\\.bin",
        "C:\\Users\\stan\\.vite-plus\\bin",
        "C:\\Users\\stan\\.cargo\\bin",
        "C:\\Program Files\\Git\\cmd",
        "C:\\Windows\\System32",
      ].join(";"),
    );
  });

  it("treats pid 0 as dead", () => {
    assert.isFalse(isProcessAlive(0, () => true));
    assert.isTrue(isProcessAlive(12, (pid) => pid === 12));
  });
});
