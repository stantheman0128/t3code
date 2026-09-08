import {
  DEFAULT_MODEL_BY_PROVIDER,
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type ModelSelection,
  type ProviderInstanceId,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { truncate } from "./String.ts";

export const SPAWN_PROVIDER_COMMANDS = ["spawn-codex", "spawn-grok", "spawn-grokbot"] as const;
export type SpawnProviderCommand = (typeof SPAWN_PROVIDER_COMMANDS)[number];

export interface SpawnProviderTarget {
  readonly command: SpawnProviderCommand;
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
}

export const SPAWN_PROVIDER_TARGETS: Record<SpawnProviderCommand, SpawnProviderTarget> = {
  "spawn-codex": {
    command: "spawn-codex",
    driverKind: ProviderDriverKind.make("codex"),
    displayName: "Codex",
  },
  "spawn-grok": {
    command: "spawn-grok",
    driverKind: ProviderDriverKind.make("grok"),
    displayName: "Grok",
  },
  "spawn-grokbot": {
    command: "spawn-grokbot",
    driverKind: ProviderDriverKind.make("grokbot"),
    displayName: "Grok Bot",
  },
};

const SPAWN_PROVIDER_COMMAND_RE = /^\/(spawn-grokbot|spawn-codex|spawn-grok)(?:\s+([\s\S]*))?$/i;

export type SpawnProviderSnapshot = Pick<
  ServerProvider,
  "instanceId" | "driver" | "enabled" | "availability" | "status" | "models"
>;

export interface ParsedSpawnProviderSlashCommand {
  readonly command: SpawnProviderCommand;
  readonly prompt: string | null;
}

export function isSpawnProviderSlashCommandName(command: string): command is SpawnProviderCommand {
  return command === "spawn-codex" || command === "spawn-grok" || command === "spawn-grokbot";
}

export function parseSpawnProviderSlashCommand(
  text: string,
): ParsedSpawnProviderSlashCommand | null {
  const match = SPAWN_PROVIDER_COMMAND_RE.exec(text.trim());
  if (!match) {
    return null;
  }
  const rawCommand = match[1]?.toLowerCase();
  if (!rawCommand || !isSpawnProviderSlashCommandName(rawCommand)) {
    return null;
  }
  const rest = match[2]?.trim() ?? "";
  return { command: rawCommand, prompt: rest.length > 0 ? rest : null };
}

export function spawnProviderSlashMenuItems(): ReadonlyArray<{
  readonly command: SpawnProviderCommand;
  readonly label: string;
  readonly description: string;
}> {
  return SPAWN_PROVIDER_COMMANDS.map((command) => {
    const target = SPAWN_PROVIDER_TARGETS[command];
    return {
      command,
      label: `/${command}`,
      description: `Start a ${target.displayName} thread in this project`,
    };
  });
}

export function isSpawnProviderReady(
  provider: Pick<SpawnProviderSnapshot, "enabled" | "availability" | "status">,
): boolean {
  return provider.enabled && provider.availability !== "unavailable" && provider.status === "ready";
}

function defaultModelForSnapshot(snapshot: SpawnProviderSnapshot): string | undefined {
  const models: ReadonlyArray<Pick<ServerProviderModel, "slug" | "isCustom" | "isDefault">> =
    snapshot.models;
  return (
    models.find((model) => model.isDefault && !model.isCustom)?.slug ??
    models.find((model) => !model.isCustom)?.slug ??
    models[0]?.slug ??
    DEFAULT_MODEL_BY_PROVIDER[snapshot.driver]
  );
}

/**
 * Ready instance for a driver kind: the built-in default if it can start,
 * otherwise the first ready instance of that kind. Grok and Grok Bot stay
 * distinct because they are different driver kinds.
 */
export function resolveSpawnProviderModelSelection(
  providers: ReadonlyArray<SpawnProviderSnapshot>,
  driverKind: ProviderDriverKind,
): ModelSelection | null {
  const ready = providers.filter(
    (provider) => provider.driver === driverKind && isSpawnProviderReady(provider),
  );
  if (ready.length === 0) {
    return null;
  }
  const defaultId: ProviderInstanceId = defaultInstanceIdForDriver(driverKind);
  const snapshot = ready.find((provider) => provider.instanceId === defaultId) ?? ready[0];
  if (!snapshot) {
    return null;
  }
  const model = defaultModelForSnapshot(snapshot);
  if (!model) {
    return null;
  }
  return { instanceId: snapshot.instanceId, model };
}

export function buildSpawnProviderThreadTitle(input: {
  readonly displayName: string;
  readonly prompt: string | null;
}): string {
  if (input.prompt) {
    return truncate(input.prompt.replace(/\s+/g, " ").trim());
  }
  return `${input.displayName} session`;
}

export interface SpawnableProviderDriver {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
}

/** Built-in T3 drivers an agent can spawn as a new thread. */
export const SPAWNABLE_PROVIDER_DRIVERS: ReadonlyArray<SpawnableProviderDriver> = [
  { driverKind: ProviderDriverKind.make("codex"), displayName: "Codex" },
  { driverKind: ProviderDriverKind.make("claudeAgent"), displayName: "Claude" },
  { driverKind: ProviderDriverKind.make("cursor"), displayName: "Cursor" },
  { driverKind: ProviderDriverKind.make("grok"), displayName: "Grok" },
  { driverKind: ProviderDriverKind.make("grokbot"), displayName: "Grok Bot" },
  { driverKind: ProviderDriverKind.make("opencode"), displayName: "OpenCode" },
  { driverKind: ProviderDriverKind.make("antigravity"), displayName: "Antigravity" },
];

const SPAWN_PROVIDER_ALIASES: ReadonlyArray<readonly [string, ProviderDriverKind]> = [
  ["claude", ProviderDriverKind.make("claudeAgent")],
  ["claudecode", ProviderDriverKind.make("claudeAgent")],
  ["claudeagent", ProviderDriverKind.make("claudeAgent")],
  ["gemini", ProviderDriverKind.make("antigravity")],
  ["google", ProviderDriverKind.make("antigravity")],
  ["agy", ProviderDriverKind.make("antigravity")],
];

const SPAWNABLE_DRIVER_BY_QUERY: ReadonlyMap<string, SpawnableProviderDriver> = (() => {
  const byKind = new Map(
    SPAWNABLE_PROVIDER_DRIVERS.map((driver) => [driver.driverKind, driver] as const),
  );
  const entries = new Map<string, SpawnableProviderDriver>();
  for (const driver of SPAWNABLE_PROVIDER_DRIVERS) {
    entries.set(normalizeSpawnProviderQuery(driver.displayName), driver);
    entries.set(normalizeSpawnProviderQuery(String(driver.driverKind)), driver);
  }
  for (const [alias, driverKind] of SPAWN_PROVIDER_ALIASES) {
    const driver = byKind.get(driverKind);
    if (driver) {
      entries.set(normalizeSpawnProviderQuery(alias), driver);
    }
  }
  return entries;
})();

export function normalizeSpawnProviderQuery(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/**
 * Map a spoken or typed provider name onto a driver kind.
 * Gemini/Google resolve to Antigravity. Grok Bot stays distinct from Grok.
 */
export function resolveSpawnProviderDriver(input: string): SpawnableProviderDriver | null {
  const query = normalizeSpawnProviderQuery(input);
  if (query.length === 0) {
    return null;
  }
  return SPAWNABLE_DRIVER_BY_QUERY.get(query) ?? null;
}

export function spawnProviderDisplayName(driverKind: ProviderDriverKind): string {
  return (
    SPAWNABLE_PROVIDER_DRIVERS.find((driver) => driver.driverKind === driverKind)?.displayName ??
    String(driverKind)
  );
}

export function listReadySpawnProviders(
  providers: ReadonlyArray<SpawnProviderSnapshot>,
): ReadonlyArray<{
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly instanceId: ProviderInstanceId;
  readonly model: string;
}> {
  const ready: Array<{
    readonly driverKind: ProviderDriverKind;
    readonly displayName: string;
    readonly instanceId: ProviderInstanceId;
    readonly model: string;
  }> = [];
  for (const driver of SPAWNABLE_PROVIDER_DRIVERS) {
    const selection = resolveSpawnProviderModelSelection(providers, driver.driverKind);
    if (!selection) {
      continue;
    }
    ready.push({
      driverKind: driver.driverKind,
      displayName: driver.displayName,
      instanceId: selection.instanceId,
      model: selection.model,
    });
  }
  return ready;
}
