#!/usr/bin/env node
/**
 * Simulates a PyInstaller onefile bootloader for Antigravity ACP tests.
 *
 * Unpacks a marker directory under TEMP, then either hangs (leaving the
 * unpack behind if force-killed) or runs the ACP mock agent and deletes the
 * unpack directory only after a normal child exit.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const temp = process.env.TEMP || process.env.TMP || process.env.TMPDIR || NodeOS.tmpdir();
const mei = NodePath.join(temp, `_MEI${process.pid}`);
NodeFS.mkdirSync(mei, { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(mei, "agy_acp_licenses.txt"),
  `temp=${temp}\nmei=${mei}\n`,
  "utf8",
);

if (process.env.T3_AGY_UNPACK_HOLD === "1") {
  setInterval(() => undefined, 1 << 30);
} else {
  const mockAgentPath = NodePath.join(
    NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
    "acp-mock-agent.ts",
  );
  const child = NodeChildProcess.spawn(process.execPath, [mockAgentPath], {
    stdio: ["pipe", "inherit", "inherit"],
    env: process.env,
    windowsHide: true,
  });
  const shutdown = (code = 0) => {
    try {
      NodeFS.rmSync(mei, { recursive: true, force: true });
    } catch {
      // The owned extract-root cleanup still removes leftovers.
    }
    process.exit(code);
  };
  child.on("exit", (code) => shutdown(code ?? 0));
  process.stdin.pipe(child.stdin);
  const stopChild = () => {
    child.stdin?.end();
    if (!child.killed) child.kill();
  };
  process.stdin.on("end", stopChild);
  process.stdin.on("close", stopChild);
}
