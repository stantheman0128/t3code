/**
 * Official CLI login commands. T3 never writes provider OAuth tokens itself.
 *
 * @module providerLogin
 */
import type { ProviderDriverKind } from "@t3tools/contracts";

export interface ProviderLoginSpec {
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
  readonly command: string;
}

const SPECS: Record<string, ProviderLoginSpec> = {
  claudeAgent: { executable: "claude", args: ["auth", "login"], command: "claude auth login" },
  codex: { executable: "codex", args: ["login"], command: "codex login" },
  grok: { executable: "grok", args: ["login"], command: "grok login" },
  cursor: { executable: "cursor-agent", args: ["login"], command: "cursor-agent login" },
  opencode: { executable: "opencode", args: ["auth", "login"], command: "opencode auth login" },
};

export function providerLoginSpec(driver: ProviderDriverKind | string): ProviderLoginSpec | null {
  return SPECS[driver] ?? null;
}
