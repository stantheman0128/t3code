/**
 * Antigravity ACP is a PyInstaller onefile. Each launch unpacks ~1.2 GiB under
 * TEMP. Health probes must not spawn that process on every refresh, and the
 * unpack directory has to be one this process created so leftover cleanup
 * cannot touch unrelated `_MEI*` trees.
 *
 * Windows Effect process teardown uses `taskkill /F /T`, which kills the
 * PyInstaller bootloader before it can delete `_MEI*`. Closing stdin and
 * waiting for a normal exit is the actual graceful path; `forceKillAfter`
 * only bounds how long that wait may last.
 *
 * @module antigravityAcpLifecycle
 */

export const ANTIGRAVITY_EXTRACT_DIR_PREFIX = "t3-agy-extract-";
export const ANTIGRAVITY_ACP_FORCE_KILL_AFTER = "1 second";
export const ANTIGRAVITY_ACP_GRACEFUL_SHUTDOWN_WAIT = "15 seconds";
export const DEFAULT_ANTIGRAVITY_HEALTH_PROBE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_ANTIGRAVITY_HEALTH_PROBE_FAILURE_BACKOFF_MS = 5 * 60 * 1000;
export const ANTIGRAVITY_EXTRACT_CLEANUP_ATTEMPTS = 5;
export const ANTIGRAVITY_EXTRACT_CLEANUP_RETRY_DELAY = "200 millis";

export function withAntigravityExtractTempEnv(
  env: NodeJS.ProcessEnv,
  extractRoot: string,
): NodeJS.ProcessEnv {
  return {
    ...env,
    TMP: extractRoot,
    TEMP: extractRoot,
    TMPDIR: extractRoot,
  };
}

export function extractDirectoryName(extractRoot: string): string {
  const trimmed = extractRoot.replace(/[\\/]+$/, "");
  const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return separator === -1 ? trimmed : trimmed.slice(separator + 1);
}

export function isOwnedAntigravityExtractRoot(directoryName: string): boolean {
  return directoryName.startsWith(ANTIGRAVITY_EXTRACT_DIR_PREFIX);
}

export function shouldRemoveAntigravityExtractRoot(extractRoot: string): boolean {
  return isOwnedAntigravityExtractRoot(extractDirectoryName(extractRoot));
}

export function shouldSkipAntigravityHealthProbe(input: {
  readonly nowMs: number;
  readonly lastProbeAtMs: number | undefined;
  readonly lastProbeCompleted: boolean;
  readonly ttlMs: number;
  readonly failureBackoffMs: number;
}): boolean {
  if (!input.lastProbeCompleted || input.lastProbeAtMs === undefined) {
    return false;
  }
  const elapsedMs = input.nowMs - input.lastProbeAtMs;
  if (elapsedMs < 0) {
    return false;
  }
  return elapsedMs < input.ttlMs;
}

export function shouldSkipFailedAntigravityHealthProbe(input: {
  readonly nowMs: number;
  readonly lastFailureAtMs: number | undefined;
  readonly failureBackoffMs: number;
}): boolean {
  if (input.lastFailureAtMs === undefined) {
    return false;
  }
  const elapsedMs = input.nowMs - input.lastFailureAtMs;
  return elapsedMs >= 0 && elapsedMs < input.failureBackoffMs;
}
