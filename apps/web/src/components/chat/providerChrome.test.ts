import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { resolveProviderChromeDriver } from "./providerChrome";

const webSrc = NodePath.join(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "../..");

function readWebSrc(relativePath: string): string {
  return NodeFS.readFileSync(NodePath.join(webSrc, relativePath), "utf8");
}

describe("resolveProviderChromeDriver", () => {
  it("aliases Grok Bot onto the Grok skin and passes other drivers through", () => {
    expect(resolveProviderChromeDriver("grokbot")).toBe("grok");
    expect(resolveProviderChromeDriver("claudeAgent")).toBe("claudeAgent");
    expect(resolveProviderChromeDriver("codex")).toBe("codex");
    expect(resolveProviderChromeDriver(null)).toBe(null);
  });
});

describe("provider chrome wiring", () => {
  it("stays off until Appearance enables it, then stamps the active driver on ChatView", () => {
    const view = readWebSrc("components/ChatView.tsx");
    expect(view).toContain("settings.providerChrome");
    expect(view).toContain('"data-provider-chrome"');
    expect(view).toContain("resolveProviderChromeDriver");
  });

  it("exposes the Appearance switch and restores the default off state", () => {
    const settings = readWebSrc("components/settings/SettingsPanels.tsx");
    expect(settings).toContain('searchableSetting("provider-chrome")');
    expect(settings).toContain('aria-label="Provider chrome"');
    expect(settings).toContain("providerChrome: DEFAULT_UNIFIED_SETTINGS.providerChrome");
  });

  it("encodes the full method: duration ladder, one status actor, optical icons, no vendor fonts", () => {
    const css = readWebSrc("index.css");
    expect(css).toContain("--provider-dur-fast:");
    expect(css).toContain("--provider-dur-snap:");
    expect(css).toContain("--provider-ease-snap:");
    expect(css).toContain("[data-provider-status-actor]");
    expect(css).toContain("[data-banner-stack-rest]");
    expect(css).toContain('[data-slot="composer-shell"]');
    expect(css).toContain('[data-provider-chrome="claudeAgent"]');
    expect(css).toContain('[data-provider-chrome="codex"]');
    expect(css).toContain('[data-provider-chrome="cursor"]');
    expect(css).not.toContain("Anthropicons");
    expect(css).not.toContain("cursor-icons-16");
  });

  it("routes layout, bubbles, and live work through chrome tokens instead of hardcoded T3 chrome", () => {
    const surface = readWebSrc("components/chat/ComposerSurface.tsx");
    const timeline = readWebSrc("components/chat/MessagesTimeline.tsx");
    expect(surface).toContain("--provider-chrome-column,48rem");
    expect(surface).toContain("--provider-chrome-radius,22px");
    expect(timeline).toContain("data-user-bubble");
    expect(timeline).toContain("data-provider-status-actor");
    expect(timeline).toContain("data-assistant-thinking");
  });
});
