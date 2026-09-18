import { describe, expect, it } from "@effect/vitest";

import {
  ANTIGRAVITY_EXTRACT_DIR_PREFIX,
  extractDirectoryName,
  isOwnedAntigravityExtractRoot,
  shouldRemoveAntigravityExtractRoot,
  shouldSkipAntigravityHealthProbe,
  shouldSkipFailedAntigravityHealthProbe,
  withAntigravityExtractTempEnv,
} from "./antigravityAcpLifecycle.ts";

describe("antigravityAcpLifecycle", () => {
  it("points PyInstaller unpacking at an owned extract root", () => {
    const env = withAntigravityExtractTempEnv(
      { PATH: "/bin", TEMP: "C:\\Windows\\Temp" },
      "C:\\tmp\\t3-agy-extract-abc",
    );
    expect(env.TMP).toBe("C:\\tmp\\t3-agy-extract-abc");
    expect(env.TEMP).toBe("C:\\tmp\\t3-agy-extract-abc");
    expect(env.TMPDIR).toBe("C:\\tmp\\t3-agy-extract-abc");
    expect(env.PATH).toBe("/bin");
  });

  it("only treats T3-created extract directories as owned", () => {
    expect(isOwnedAntigravityExtractRoot(`${ANTIGRAVITY_EXTRACT_DIR_PREFIX}xyz`)).toBe(true);
    expect(isOwnedAntigravityExtractRoot("_MEI12345")).toBe(false);
    expect(isOwnedAntigravityExtractRoot("Temp")).toBe(false);
    expect(extractDirectoryName("C:\\tmp\\t3-agy-extract-abc\\")).toBe("t3-agy-extract-abc");
    expect(shouldRemoveAntigravityExtractRoot("C:\\tmp\\t3-agy-extract-abc")).toBe(true);
    expect(
      shouldRemoveAntigravityExtractRoot("C:\\Users\\stans\\AppData\\Local\\Temp\\_MEI123"),
    ).toBe(false);
  });

  it("reuses a successful health probe until the TTL elapses", () => {
    expect(
      shouldSkipAntigravityHealthProbe({
        nowMs: 10_000,
        lastProbeAtMs: 1_000,
        lastProbeCompleted: true,
        ttlMs: 10 * 60 * 1000,
        failureBackoffMs: 5 * 60 * 1000,
      }),
    ).toBe(true);
    expect(
      shouldSkipAntigravityHealthProbe({
        nowMs: 11 * 60 * 1000,
        lastProbeAtMs: 0,
        lastProbeCompleted: true,
        ttlMs: 10 * 60 * 1000,
        failureBackoffMs: 5 * 60 * 1000,
      }),
    ).toBe(false);
  });

  it("backs off after a failed probe without treating it as a success cache", () => {
    expect(
      shouldSkipFailedAntigravityHealthProbe({
        nowMs: 30_000,
        lastFailureAtMs: 1_000,
        failureBackoffMs: 5 * 60 * 1000,
      }),
    ).toBe(true);
    expect(
      shouldSkipFailedAntigravityHealthProbe({
        nowMs: 6 * 60 * 1000,
        lastFailureAtMs: 0,
        failureBackoffMs: 5 * 60 * 1000,
      }),
    ).toBe(false);
    expect(
      shouldSkipAntigravityHealthProbe({
        nowMs: 30_000,
        lastProbeAtMs: 1_000,
        lastProbeCompleted: false,
        ttlMs: 10 * 60 * 1000,
        failureBackoffMs: 5 * 60 * 1000,
      }),
    ).toBe(false);
  });
});
