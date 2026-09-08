import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";

import {
  buildSpawnProviderThreadTitle,
  listReadySpawnProviders,
  parseSpawnProviderSlashCommand,
  resolveSpawnProviderDriver,
  resolveSpawnProviderModelSelection,
  type SpawnProviderSnapshot,
} from "./spawnProviderSession.ts";

const CODEX = ProviderDriverKind.make("codex");
const GROK = ProviderDriverKind.make("grok");
const GROKBOT = ProviderDriverKind.make("grokbot");

function snapshot(
  overrides: Partial<SpawnProviderSnapshot> & Pick<SpawnProviderSnapshot, "instanceId" | "driver">,
): SpawnProviderSnapshot {
  return {
    enabled: true,
    status: "ready",
    models: [{ slug: `${overrides.driver}-default`, isCustom: false, isDefault: true }],
    ...overrides,
  };
}

describe("parseSpawnProviderSlashCommand", () => {
  it("parses a bare spawn command", () => {
    expect(parseSpawnProviderSlashCommand(" /spawn-codex ")).toEqual({
      command: "spawn-codex",
      prompt: null,
    });
  });

  it("keeps Grok Bot independent of Grok", () => {
    expect(parseSpawnProviderSlashCommand("/spawn-grok")).toEqual({
      command: "spawn-grok",
      prompt: null,
    });
    expect(parseSpawnProviderSlashCommand("/spawn-grokbot")).toEqual({
      command: "spawn-grokbot",
      prompt: null,
    });
  });

  it("captures a multi-line prompt after the command", () => {
    expect(parseSpawnProviderSlashCommand("/spawn-grok\nfix the tests")).toEqual({
      command: "spawn-grok",
      prompt: "fix the tests",
    });
  });

  it("ignores unknown spawn slugs", () => {
    expect(parseSpawnProviderSlashCommand("/spawn-codexfoo")).toBeNull();
    expect(parseSpawnProviderSlashCommand("/spawn-cursor")).toBeNull();
    expect(parseSpawnProviderSlashCommand("/plan")).toBeNull();
  });
});

describe("resolveSpawnProviderModelSelection", () => {
  it("prefers the default instance of that driver kind", () => {
    expect(
      resolveSpawnProviderModelSelection(
        [
          snapshot({
            instanceId: ProviderInstanceId.make("codex_work"),
            driver: CODEX,
            models: [{ slug: "custom-codex", isCustom: false, isDefault: true }],
          }),
          snapshot({
            instanceId: ProviderInstanceId.make("codex"),
            driver: CODEX,
            models: [{ slug: "gpt-5.6-sol", isCustom: false, isDefault: true }],
          }),
        ],
        CODEX,
      ),
    ).toEqual({ instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.6-sol" });
  });

  it("does not fold Grok Bot into Grok", () => {
    const providers = [
      snapshot({
        instanceId: ProviderInstanceId.make("grok"),
        driver: GROK,
        models: [{ slug: "grok-4.6", isCustom: false, isDefault: true }],
      }),
      snapshot({
        instanceId: ProviderInstanceId.make("grokbot"),
        driver: GROKBOT,
        models: [{ slug: "grokbot/sand-default", isCustom: false, isDefault: true }],
      }),
    ];

    expect(resolveSpawnProviderModelSelection(providers, GROK)).toEqual({
      instanceId: ProviderInstanceId.make("grok"),
      model: "grok-4.6",
    });
    expect(resolveSpawnProviderModelSelection(providers, GROKBOT)).toEqual({
      instanceId: ProviderInstanceId.make("grokbot"),
      model: "grokbot/sand-default",
    });
  });

  it("returns null when that driver is not ready", () => {
    expect(
      resolveSpawnProviderModelSelection(
        [
          snapshot({
            instanceId: ProviderInstanceId.make("codex"),
            driver: CODEX,
            status: "error",
          }),
          snapshot({
            instanceId: ProviderInstanceId.make("grok"),
            driver: GROK,
          }),
        ],
        CODEX,
      ),
    ).toBeNull();
  });
});

describe("buildSpawnProviderThreadTitle", () => {
  it("uses the provider name when there is no prompt", () => {
    expect(buildSpawnProviderThreadTitle({ displayName: "Codex", prompt: null })).toBe(
      "Codex session",
    );
  });

  it("uses the first line of the prompt", () => {
    expect(
      buildSpawnProviderThreadTitle({
        displayName: "Grok",
        prompt: "  ship the sidebar  ",
      }),
    ).toBe("ship the sidebar");
  });
});

describe("resolveSpawnProviderDriver", () => {
  it("maps spoken names including Gemini onto Antigravity", () => {
    expect(resolveSpawnProviderDriver("Gemini")?.driverKind).toBe(
      ProviderDriverKind.make("antigravity"),
    );
    expect(resolveSpawnProviderDriver("google")?.displayName).toBe("Antigravity");
    expect(resolveSpawnProviderDriver("Claude Code")?.driverKind).toBe(
      ProviderDriverKind.make("claudeAgent"),
    );
  });

  it("keeps Grok Bot independent of Grok", () => {
    expect(resolveSpawnProviderDriver("Grok")?.driverKind).toBe(ProviderDriverKind.make("grok"));
    expect(resolveSpawnProviderDriver("Grok Bot")?.driverKind).toBe(
      ProviderDriverKind.make("grokbot"),
    );
    expect(resolveSpawnProviderDriver("grok-bot")?.displayName).toBe("Grok Bot");
  });

  it("rejects unknown names", () => {
    expect(resolveSpawnProviderDriver("agent computer")).toBeNull();
    expect(resolveSpawnProviderDriver("")).toBeNull();
  });
});

describe("listReadySpawnProviders", () => {
  it("includes Antigravity when it is ready and skips drivers that are not", () => {
    expect(
      listReadySpawnProviders([
        snapshot({
          instanceId: ProviderInstanceId.make("antigravity"),
          driver: ProviderDriverKind.make("antigravity"),
          models: [{ slug: "gemini-3", isCustom: false, isDefault: true }],
        }),
        snapshot({
          instanceId: ProviderInstanceId.make("codex"),
          driver: CODEX,
          status: "error",
        }),
      ]),
    ).toEqual([
      {
        driverKind: ProviderDriverKind.make("antigravity"),
        displayName: "Antigravity",
        instanceId: ProviderInstanceId.make("antigravity"),
        model: "gemini-3",
      },
    ]);
  });
});
