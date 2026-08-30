import { describe, expect, it } from "vite-plus/test";

import { providerLoginSpec, visibleProviderLoginLaunch } from "./providerLogin.ts";

describe("providerLoginSpec", () => {
  it("uses each CLI's official login command", () => {
    expect(providerLoginSpec("claudeAgent")?.command).toBe("claude auth login");
    expect(providerLoginSpec("codex")?.command).toBe("codex login");
    expect(providerLoginSpec("grok")?.command).toBe("grok login");
    expect(providerLoginSpec("cursor")?.command).toBe("cursor-agent login");
    expect(providerLoginSpec("opencode")?.command).toBe("opencode auth login");
    expect(providerLoginSpec("unknown")).toBeNull();
  });
});

describe("visibleProviderLoginLaunch", () => {
  it("opens a visible Windows console with start", () => {
    const launch = visibleProviderLoginLaunch({
      executable: "claude",
      args: ["auth", "login"],
      platform: "win32",
      comSpec: "cmd.exe",
    });
    expect(launch.command).toBe("cmd.exe");
    expect(launch.args).toEqual(["/c", 'start "T3 provider login" claude auth login']);
    expect(launch.options.windowsHide).toBe(false);
  });

  it("opens Terminal on macOS", () => {
    const launch = visibleProviderLoginLaunch({
      executable: "codex",
      args: ["login"],
      platform: "darwin",
    });
    expect(launch.command).toBe("osascript");
    expect(launch.args[0]).toBe("-e");
    expect(launch.args[1]).toContain("codex");
    expect(launch.args[1]).toContain("login");
  });
});
