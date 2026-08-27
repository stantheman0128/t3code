import { describe, expect, it } from "vite-plus/test";

import { openCodeAuthFileCandidates, openCodeGoApiKeyFromDocument } from "./openCodeUsage.ts";
import { mapOpenCodeGoUsage } from "./providerUsageLimits.ts";

describe("openCodeGoApiKeyFromDocument", () => {
  it("prefers the opencode-go slot", () => {
    expect(
      openCodeGoApiKeyFromDocument({
        "opencode-go": { type: "api", key: "go-key" },
        opencode: { type: "api", key: "zen-key" },
      }),
    ).toBe("go-key");
  });
});

describe("openCodeAuthFileCandidates", () => {
  it("includes the XDG data home auth file", () => {
    const files = openCodeAuthFileCandidates("C:\\Users\\ada", {
      XDG_DATA_HOME: "C:\\Users\\ada\\.local\\share",
    });
    expect(files.some((file) => file.includes("opencode") && file.endsWith("auth.json"))).toBe(
      true,
    );
  });
});

describe("mapOpenCodeGoUsage", () => {
  it("turns used percents into remaining windows", () => {
    expect(
      mapOpenCodeGoUsage(
        {
          usage: {
            rolling: { percent: 12, resetsAt: "2026-08-27T16:00:00.000Z" },
            weekly: { percent: 25, resetsAt: "2026-08-31T00:00:00.000Z" },
            monthly: { percent: 40 },
          },
        },
        "2026-08-27T12:00:00.000Z",
        "OpenCode Go",
      ),
    ).toMatchObject({
      status: "available",
      planLabel: "OpenCode Go",
      windows: [
        { id: "rolling", label: "5h", remainingPercent: 88 },
        { id: "weekly", label: "Week", remainingPercent: 75 },
        { id: "monthly", label: "Month", remainingPercent: 60 },
      ],
    });
  });
});
