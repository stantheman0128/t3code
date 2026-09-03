import { describe, expect, it } from "@effect/vitest";
import { GrokSettings } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { grokSettingsFromGrokBotConfig, resolveGrokBotBinaryPath } from "./GrokDriver.ts";

const decodeGrokSettings = Schema.decodeSync(GrokSettings);

describe("resolveGrokBotBinaryPath", () => {
  it("prefers the Grok Bot instance binaryPath over the GrokSettings omp default", () => {
    const decoded = decodeGrokSettings({
      binaryPath: "C:\\Users\\stans\\.bun\\bin\\omp-grokbot.exe",
    });
    expect(decoded.grokbotBinaryPath).toBe("omp");
    expect(resolveGrokBotBinaryPath(decoded)).toBe("C:\\Users\\stans\\.bun\\bin\\omp-grokbot.exe");
  });

  it("keeps an explicit grokbotBinaryPath when instance binaryPath is the Grok CLI default", () => {
    expect(
      resolveGrokBotBinaryPath({
        binaryPath: "grok",
        grokbotBinaryPath: "C:\\tools\\omp-grokbot.exe",
      }),
    ).toBe("C:\\tools\\omp-grokbot.exe");
  });

  it("falls back to omp", () => {
    expect(resolveGrokBotBinaryPath({})).toBe("omp");
  });
});

describe("grokSettingsFromGrokBotConfig", () => {
  it("writes the resolved path onto both binary fields", () => {
    const settings = grokSettingsFromGrokBotConfig({
      enabled: true,
      binaryPath: "C:\\Users\\stans\\.bun\\bin\\omp-grokbot.exe",
    });
    expect(settings.useGrokbotBackend).toBe(true);
    expect(settings.binaryPath).toBe("C:\\Users\\stans\\.bun\\bin\\omp-grokbot.exe");
    expect(settings.grokbotBinaryPath).toBe("C:\\Users\\stans\\.bun\\bin\\omp-grokbot.exe");
  });
});
