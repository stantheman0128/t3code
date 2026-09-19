import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ClientSettingsSchema } from "@t3tools/contracts/settings";

import { resolveProviderChromeDriver } from "./providerChrome";

const webSrc = NodePath.join(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "../..");
const decodeClientSettings = Schema.decodeUnknownSync(ClientSettingsSchema);

function readWebSrc(relativePath: string): string {
  return NodeFS.readFileSync(NodePath.join(webSrc, relativePath), "utf8");
}

function skinBlock(css: string, driver: string): string {
  const needle = `[data-provider-chrome="${driver}"] {`;
  const start = css.indexOf(needle);
  expect(start).toBeGreaterThan(-1);
  const next = css.indexOf("\n[data-provider-chrome=", start + needle.length);
  const end = next === -1 ? css.length : next;
  return css.slice(start, end);
}

describe("resolveProviderChromeDriver", () => {
  it("maps Claude, Codex, and Cursor through and aliases Grok Bot onto Grok", () => {
    expect(resolveProviderChromeDriver("claudeAgent")).toBe("claudeAgent");
    expect(resolveProviderChromeDriver("codex")).toBe("codex");
    expect(resolveProviderChromeDriver("cursor")).toBe("cursor");
    expect(resolveProviderChromeDriver("grokbot")).toBe("grok");
    expect(resolveProviderChromeDriver(null)).toBe(null);
    expect(resolveProviderChromeDriver("")).toBe(null);
  });
});

describe("provider chrome defaults off", () => {
  it("decodes missing providerChrome as false on the shipped settings schema", () => {
    expect(decodeClientSettings({}).providerChrome).toBe(false);
    expect(decodeClientSettings({ providerChrome: true }).providerChrome).toBe(true);
  });
});

describe("provider chrome wiring", () => {
  it("stays off until Appearance enables it, then stamps the active driver on ChatView", () => {
    const view = readWebSrc("components/ChatView.tsx");
    expect(view).toContain("settings.providerChrome");
    expect(view).toContain('"data-provider-chrome"');
    expect(view).toContain("resolveProviderChromeDriver");
    expect(view).not.toContain("<<<<<<<");
  });

  it("exposes the Appearance switch and restores the default off state", () => {
    const settings = readWebSrc("components/settings/SettingsPanels.tsx");
    expect(settings).toContain('searchableSetting("provider-chrome")');
    expect(settings).toContain('aria-label="Provider chrome"');
    expect(settings).toContain("providerChrome: DEFAULT_UNIFIED_SETTINGS.providerChrome");
    expect(settings).not.toContain("<<<<<<<");
  });

  it("encodes Claude, Codex, and Cursor duration ladders, one status actor, and optical icons", () => {
    const css = readWebSrc("index.css");
    const claude = skinBlock(css, "claudeAgent");
    const codex = skinBlock(css, "codex");
    const cursor = skinBlock(css, "cursor");

    expect(claude).toContain("--provider-dur-fast: 60ms");
    expect(claude).toContain("--provider-dur-snap: 120ms");
    expect(claude).toContain("--provider-icon-size: 16px");
    expect(css).toContain('[data-provider-chrome="claudeAgent"] [data-provider-status-actor]');

    expect(codex).toContain("--provider-dur-fast: 80ms");
    expect(codex).toContain("--provider-chrome-radius: 1.75rem");
    expect(css).toContain('[data-provider-chrome="codex"] [data-provider-status-actor]');

    expect(cursor).toContain("--provider-dur-base: 150ms");
    expect(cursor).toContain("--provider-icon-size: 12px");
    expect(css).toContain('[data-provider-chrome="cursor"] [data-provider-status-actor]');

    expect(css).toContain("[data-provider-chrome] :is(.live-tool-shine");
    expect(css).toContain("[data-provider-chrome] [data-banner-stack-rest]");
    expect(css).toContain('[data-slot="composer-shell"]');
    expect(css).not.toContain("Anthropicons");
    expect(css).not.toContain("cursor-icons-16");
    expect(css).not.toContain("busy-bar");
  });

  it("routes layout, bubbles, and live work through chrome tokens on the live DOM", () => {
    const surface = readWebSrc("components/chat/ComposerSurface.tsx");
    const timeline = readWebSrc("components/chat/MessagesTimeline.tsx");
    expect(surface).toContain("--provider-chrome-column,48rem");
    expect(surface).toContain("--provider-chrome-radius,22px");
    expect(timeline).toContain("data-user-bubble");
    expect(timeline).toContain("data-provider-status-actor");
    expect(timeline).toContain("data-assistant-thinking");
    expect(timeline).not.toContain("<<<<<<<");
  });

  it("records smoothness, cohesion, and animation gaps for Codex, Cursor, and Claude", () => {
    const notes = readWebSrc("components/chat/providerChromeComparison.md");
    for (const product of ["## Codex", "## Cursor", "## Claude"] as const) {
      expect(notes).toContain(product);
    }
    for (const axis of ["**Smoothness:**", "**Cohesion:**", "**Animation:**"] as const) {
      const hits = notes.split(axis).length - 1;
      expect(hits).toBe(3);
    }
  });
});
