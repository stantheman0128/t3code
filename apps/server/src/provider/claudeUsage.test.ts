import { describe, expect, it } from "vite-plus/test";

import {
  claudeAccessTokenFromDocument,
  claudeCredentialsFileCandidates,
  claudeDesktopPlanUsageFileCandidates,
  claudeUsageStateFileCandidates,
} from "./claudeUsage.ts";

describe("claudeAccessTokenFromDocument", () => {
  it("reads the Claude Code oauth access token when it is still valid", () => {
    expect(
      claudeAccessTokenFromDocument(
        {
          claudeAiOauth: {
            accessToken: "sk-ant-oat01-test",
            expiresAt: 2_000_000_000_000,
          },
        },
        1_700_000_000_000,
      ),
    ).toBe("sk-ant-oat01-test");
  });

  it("ignores expired tokens instead of refreshing them", () => {
    expect(
      claudeAccessTokenFromDocument(
        {
          claudeAiOauth: {
            accessToken: "sk-ant-oat01-expired",
            expiresAt: 1_000,
          },
        },
        1_700_000_000_000,
      ),
    ).toBeUndefined();
  });
});

describe("claudeCredentialsFileCandidates", () => {
  it("includes CLAUDE_CONFIG_DIR and the default .claude credentials file", () => {
    const files = claudeCredentialsFileCandidates("C:\\Users\\ada", {
      CLAUDE_CONFIG_DIR: "C:\\Users\\ada\\.claude_work",
      USERPROFILE: "C:\\Users\\ada",
    });
    expect(files.some((file) => file.endsWith(".claude_work\\.credentials.json"))).toBe(true);
    expect(
      files.some((file) => file.includes(".claude") && file.endsWith(".credentials.json")),
    ).toBe(true);
  });
});

describe("claudeUsageStateFileCandidates", () => {
  it("includes the Claude Code statusline usage-state file", () => {
    const files = claudeUsageStateFileCandidates("C:\\Users\\ada", {
      USERPROFILE: "C:\\Users\\ada",
    });
    expect(files.some((file) => file.endsWith(".claude\\usage-state.json"))).toBe(true);
  });
});

describe("claudeDesktopPlanUsageFileCandidates", () => {
  it("reads Claude Desktop's plan-usage-history.json from AppData", () => {
    const files = claudeDesktopPlanUsageFileCandidates({
      APPDATA: "C:\\Users\\ada\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\ada\\AppData\\Local",
    });
    expect(files).toContain("C:\\Users\\ada\\AppData\\Roaming\\Claude\\plan-usage-history.json");
    expect(files).toContain("C:\\Users\\ada\\AppData\\Local\\Claude\\plan-usage-history.json");
  });
});
