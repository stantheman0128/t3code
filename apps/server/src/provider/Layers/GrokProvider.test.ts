import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { GrokSettings } from "@t3tools/contracts";

import {
  buildGrokDiscoveredModelsFromSessionConfigOptions,
  buildGrokDiscoveredModelsFromSessionModelState,
  buildInitialGrokProviderSnapshot,
  checkGrokProviderStatus,
  selectDiscoveredGrokModels,
} from "./GrokProvider.ts";

const decodeGrokSettings = Schema.decodeSync(GrokSettings);

describe("Grok Bot ACP model discovery", () => {
  it("keeps only the grokbot namespace from OMP's multi-provider model list", () => {
    const models = buildGrokDiscoveredModelsFromSessionModelState(
      {
        currentModelId: "grokbot/sand-default",
        availableModels: [
          { modelId: "anthropic/claude-opus-4-6", name: "Claude Opus" },
          { modelId: "grokbot/sand-default", name: "Sand Default" },
          { modelId: "grokbot/grok-4.6", name: "Grok 4.6" },
          { modelId: "openai/gpt-5.4", name: "GPT-5.4" },
        ],
      },
      "grokbot/",
    );

    expect(models.map((model) => model.slug)).toEqual(["grokbot/sand-default", "grokbot/grok-4.6"]);
  });

  it("reads OMP's standard model config option and filters other providers", () => {
    const models = buildGrokDiscoveredModelsFromSessionConfigOptions(
      [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "grokbot/sand-default",
          options: [
            { value: "mistral/codestral-latest", name: "Codestral" },
            { value: "grokbot/sand-default", name: "Sand Default" },
            { value: "grokbot/sand-automation", name: "Sand Automation" },
            { value: "grokbot/sand-cua", name: "Sand CUA" },
          ],
        },
      ],
      "grokbot/",
    );

    expect(models.map((model) => model.slug)).toEqual([
      "grokbot/sand-default",
      "grokbot/sand-automation",
      "grokbot/sand-cua",
    ]);
  });

  it("keeps advertised Grok Bot models when they omit the grokbot/ prefix", () => {
    const models = buildGrokDiscoveredModelsFromSessionConfigOptions(
      [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "sand-default",
          options: [
            { value: "sand-default", name: "Sand Default" },
            { value: "sand-automation", name: "Sand Automation" },
          ],
        },
      ],
      "grokbot/",
    );
    expect(models).toEqual([]);

    const unprefixed = buildGrokDiscoveredModelsFromSessionConfigOptions([
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "sand-default",
        options: [
          { value: "sand-default", name: "Sand Default" },
          { value: "sand-automation", name: "Sand Automation" },
        ],
      },
    ]);
    expect(unprefixed.map((model) => model.slug)).toEqual(["sand-default", "sand-automation"]);
  });

  it("does not dump unprefixed OMP catalogs that are not Grok models", () => {
    const models = selectDiscoveredGrokModels({
      useGrokbotBackend: true,
      models: {
        currentModelId: "codestral-latest",
        availableModels: [
          { modelId: "codestral-latest", name: "Codestral" },
          { modelId: "devstral-latest", name: "Devstral" },
          { modelId: "mistral-large-latest", name: "Mistral Large" },
        ],
      },
    });

    expect(models.map((model) => model.slug)).toEqual([]);
  });

  it("does not dump OMP's other-provider catalog when grokbot/ is missing", () => {
    const models = selectDiscoveredGrokModels({
      useGrokbotBackend: true,
      models: {
        currentModelId: "anthropic/claude-opus-4-6",
        availableModels: [
          { modelId: "anthropic/claude-opus-4-6", name: "Claude Opus" },
          { modelId: "openai/gpt-5.4", name: "GPT-5.4" },
          { modelId: "mistral/codestral-latest", name: "Codestral" },
        ],
      },
    });

    expect(models.map((model) => model.slug)).toEqual([]);
  });

  it("keeps unprefixed grokbot-only catalogs when OMP omits grokbot/", () => {
    const models = selectDiscoveredGrokModels({
      useGrokbotBackend: true,
      configOptions: [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "sand-default",
          options: [
            { value: "sand-default", name: "Sand Default" },
            { value: "sand-automation", name: "Sand Automation" },
          ],
        },
      ],
    });

    expect(models.map((model) => model.slug)).toEqual(["sand-default", "sand-automation"]);
  });

  it("still keeps grokbot/ models from a mixed OMP catalog", () => {
    const models = selectDiscoveredGrokModels({
      useGrokbotBackend: true,
      models: {
        currentModelId: "grokbot/sand-default",
        availableModels: [
          { modelId: "anthropic/claude-opus-4-6", name: "Claude Opus" },
          { modelId: "grokbot/sand-default", name: "Sand Default" },
          { modelId: "openai/gpt-5.4", name: "GPT-5.4" },
        ],
      },
    });

    expect(models.map((model) => model.slug)).toEqual(["grokbot/sand-default"]);
  });

  it("drops OCX and grok-build from the Grok CLI picker", () => {
    const models = selectDiscoveredGrokModels({
      useGrokbotBackend: false,
      models: {
        currentModelId: "grok-4.6",
        availableModels: [
          { modelId: "grok-4.6", name: "Grok 4.6" },
          { modelId: "grok-4.5", name: "Grok 4.5" },
          { modelId: "grok-build", name: "Grok Build" },
          { modelId: "grok-fill", name: "Grok Fill" },
          { modelId: "ocx-gpt-5.5", name: "GPT-5.5" },
          { modelId: "ocx-gpt-5-6-sol", name: "GPT-5.6 Sol" },
          { modelId: "grok-code-fast-1", name: "Grok Code Fast" },
        ],
      },
    });

    expect(models.map((model) => model.slug)).toEqual(["grok-4.6", "grok-4.5"]);
  });

  it("hides grokbot catalog rows that cannot run T3 tool turns", () => {
    const models = selectDiscoveredGrokModels({
      useGrokbotBackend: true,
      models: {
        currentModelId: "grokbot/sand-default",
        availableModels: [
          { modelId: "grokbot/sand-default", name: "Sand Default" },
          { modelId: "grokbot/sand-cua", name: "Sand CUA" },
          { modelId: "grokbot/grok-4.6", name: "Grok 4.6" },
          { modelId: "grokbot/claude-opus-5", name: "Claude Opus 5" },
          { modelId: "grokbot/codestral-latest", name: "Codestral" },
          { modelId: "grokbot/grok-4.5", name: "Grok 4.5" },
          { modelId: "grokbot/sand-automation", name: "Sand Automation" },
        ],
      },
    });

    expect(models.map((model) => model.slug)).toEqual([
      "grokbot/sand-default",
      "grokbot/grok-4.6",
      "grokbot/grok-4.5",
      "grokbot/sand-automation",
    ]);
  });
});

it.layer(NodeServices.layer)("buildInitialGrokProviderSnapshot", (it) => {
  it.effect("returns a disabled snapshot when settings.enabled is false", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialGrokProviderSnapshot(
        decodeGrokSettings({ enabled: false }),
      );
      expect(snapshot.enabled).toBe(false);
      expect(snapshot.status).toBe("disabled");
      expect(snapshot.installed).toBe(false);
      expect(snapshot.message).toContain("disabled");
    }),
  );

  it.effect("returns a disabled snapshot by default — Grok is opt-in", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialGrokProviderSnapshot(decodeGrokSettings({}));
      expect(snapshot.enabled).toBe(false);
      expect(snapshot.status).toBe("disabled");
    }),
  );

  it.effect("returns a pending snapshot when enabled", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialGrokProviderSnapshot(
        decodeGrokSettings({ enabled: true }),
      );
      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(true);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.version).toBeNull();
      expect(snapshot.message).toContain("Checking Grok");
      expect(snapshot.requiresNewThreadForModelChange).toBe(false);
      expect(snapshot.showInteractionModeToggle).toBe(true);
      expect(snapshot.slashCommands.map((command) => command.name)).toEqual(
        expect.arrayContaining([
          "workflow",
          "workflow pause",
          "workflow resume",
          "workflow stop",
          "loop",
          "compact",
          "create-workflow",
          "deep-research",
          "btw",
          "goal",
        ]),
      );
      expect(snapshot.models[0]?.capabilities?.optionDescriptors?.map((d) => d.id)).toEqual([
        "reasoningEffort",
        "fastMode",
      ]);
    }),
  );

  it.effect("drops custom OCX, Fill, and Build slugs from the Grok CLI snapshot", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialGrokProviderSnapshot(
        decodeGrokSettings({
          enabled: true,
          customModels: ["ocx-gpt-5.5", "grok-fill", "grok-build", "grok-4.6"],
        }),
      );
      expect(snapshot.models.map((model) => model.slug)).toEqual(["grok-4.6", "grok-4.5"]);
    }),
  );
});

it.layer(NodeServices.layer)("buildInitialGrokProviderSnapshot workflows", (it) => {
  it.effect("includes project workflow slash commands on the initial snapshot", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-grok-initial-wf-" });
          const home = path.join(dir, "home");
          const project = path.join(dir, "project");
          yield* fs.makeDirectory(path.join(home, ".grok", "workflows"), { recursive: true });
          yield* fs.makeDirectory(path.join(project, ".grok", "workflows"), { recursive: true });
          yield* fs.writeFileString(
            path.join(project, ".grok", "workflows", "from-project.rhai"),
            `let meta = #{ name: "from-project", description: "project script" };\n`,
          );
          return yield* buildInitialGrokProviderSnapshot(decodeGrokSettings({ enabled: true }), {
            environment: { HOME: home },
            projectRoot: project,
          });
        }),
      );

      expect(snapshot.slashCommands.map((command) => command.name)).toEqual(
        expect.arrayContaining(["workflow pause", "workflow from-project"]),
      );
    }),
  );

  it.effect("discovers user workflow scripts from USERPROFILE when HOME is unset", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-grok-userprofile-wf-" });
          const home = path.join(dir, "home");
          yield* fs.makeDirectory(path.join(home, ".grok", "workflows"), { recursive: true });
          yield* fs.writeFileString(
            path.join(home, ".grok", "workflows", "from-profile.rhai"),
            `let meta = #{ name: "from-profile", description: "userprofile script" };\n`,
          );
          return yield* buildInitialGrokProviderSnapshot(decodeGrokSettings({ enabled: true }), {
            environment: { USERPROFILE: home },
          });
        }),
      );

      expect(snapshot.slashCommands.map((command) => command.name)).toEqual(
        expect.arrayContaining(["workflow pause", "workflow from-profile"]),
      );
    }),
  );
});

it.layer(NodeServices.layer)("checkGrokProviderStatus", (it) => {
  it.effect("reports the binary as missing when the binary path does not resolve", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkGrokProviderStatus(
        decodeGrokSettings({
          enabled: true,
          binaryPath: "/definitely/not/installed/grok-binary",
        }),
      );
      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(false);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toMatch(/not installed|not on PATH|Failed to execute/);
    }),
  );

  it.effect("reports an installed CLI as unhealthy when --version exits non-zero", () =>
    Effect.gen(function* () {
      const secretStderr = "broken grok install: secret-token-value";
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-grok-version-" });
          const grokPath =
            process.platform === "win32" ? path.join(dir, "grok.cmd") : path.join(dir, "grok");
          yield* fs.writeFileString(
            grokPath,
            process.platform === "win32"
              ? ["@echo off", `echo ${secretStderr} 1>&2`, "exit /b 2", ""].join("\n")
              : ["#!/bin/sh", `printf "%s\\n" "${secretStderr}" >&2`, "exit 2", ""].join("\n"),
          );
          if (process.platform !== "win32") {
            yield* fs.chmod(grokPath, 0o755);
          }

          return yield* checkGrokProviderStatus(
            decodeGrokSettings({ enabled: true, binaryPath: grokPath }),
          );
        }),
      );

      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(true);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toBe("Grok CLI is installed but failed to run.");
      expect(snapshot.message).not.toContain(secretStderr);
    }),
  );

  it.effect("reports an error when ACP model discovery is unavailable", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-grok-success-" });
          const grokPath =
            process.platform === "win32" ? path.join(dir, "grok.cmd") : path.join(dir, "grok");
          yield* fs.writeFileString(
            grokPath,
            process.platform === "win32"
              ? ["@echo off", "echo grok-cli 0.0.99", "exit /b 0", ""].join("\n")
              : ["#!/bin/sh", 'printf "grok-cli 0.0.99\\n"', "exit 0", ""].join("\n"),
          );
          if (process.platform !== "win32") {
            yield* fs.chmod(grokPath, 0o755);
          }

          return yield* checkGrokProviderStatus(
            decodeGrokSettings({ enabled: true, binaryPath: grokPath }),
            { HOME: dir, PATH: process.env.PATH ?? "", XAI_API_KEY: "probe-only" },
          );
        }),
      );

      expect(snapshot.status).toBe("error");
      expect(snapshot.installed).toBe(true);
      expect(snapshot.models.map((model) => model.slug)).toEqual(["grok-4.6", "grok-4.5"]);
      expect(snapshot.message).toContain("ACP startup failed");
    }),
  );

  it.effect("does not advertise Grok CLI models when Grok Bot ACP discovery fails", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-grokbot-models-" });
          const ompPath = path.join(dir, "omp");
          yield* fs.writeFileString(
            ompPath,
            ["#!/bin/sh", 'printf "omp 0.0.1\\n"', "exit 0", ""].join("\n"),
          );
          yield* fs.chmod(ompPath, 0o755);

          return yield* checkGrokProviderStatus(
            decodeGrokSettings({
              enabled: true,
              useGrokbotBackend: true,
              grokbotBinaryPath: ompPath,
              binaryPath: ompPath,
            }),
            { HOME: dir, PATH: process.env.PATH ?? "" },
          );
        }),
      );

      expect(snapshot.displayName).toBe("Grok Bot");
      expect(snapshot.models.map((model) => model.slug)).toEqual([
        "grokbot/grok-4.6",
        "grokbot/grok-4.5",
        "grokbot/sand-default",
        "grokbot/sand-automation",
      ]);
      expect(snapshot.models.map((model) => model.slug)).not.toContain("grok-build");
    }),
  );

  it.effect("discovers workflow slash commands from injected home and project roots", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-grok-wf-" });
          const home = path.join(dir, "home");
          const project = path.join(dir, "project");
          const grokPath = path.join(dir, "grok");
          yield* fs.makeDirectory(path.join(home, ".grok", "workflows"), { recursive: true });
          yield* fs.makeDirectory(path.join(project, ".grok", "workflows"), { recursive: true });
          yield* fs.writeFileString(
            path.join(home, ".grok", "workflows", "from-home.rhai"),
            `let meta = #{ name: "from-home", description: "home script" };\n`,
          );
          yield* fs.writeFileString(
            path.join(project, ".grok", "workflows", "from-project.rhai"),
            `let meta = #{ name: "from-project", description: "project script" };\n`,
          );
          yield* fs.writeFileString(
            grokPath,
            ["#!/bin/sh", 'printf "grok-cli 0.0.99\\n"', "exit 0", ""].join("\n"),
          );
          yield* fs.chmod(grokPath, 0o755);

          return yield* checkGrokProviderStatus(
            decodeGrokSettings({ enabled: true, binaryPath: grokPath }),
            { HOME: home, PATH: process.env.PATH ?? "", XAI_API_KEY: "probe-only" },
            project,
          );
        }),
      );

      expect(snapshot.slashCommands.map((command) => command.name)).toEqual(
        expect.arrayContaining(["workflow pause", "workflow from-home", "workflow from-project"]),
      );
    }),
  );
});
