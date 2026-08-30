import { describe, expect, it } from "vite-plus/test";

import { providerLoginSpec } from "./providerLogin.ts";

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
