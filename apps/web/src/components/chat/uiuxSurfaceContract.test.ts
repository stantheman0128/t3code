import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { DISMISS_TRANSITION_MS } from "./ComposerBannerStack";

const webSrc = NodePath.join(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "../..");

function readWebSrc(relativePath: string): string {
  return NodeFS.readFileSync(NodePath.join(webSrc, relativePath), "utf8");
}

describe("T3 desktop UI/UX surfaces cited in the competitor comparison", () => {
  it("keeps composer banner dismiss motion at 220ms ease-in, matching the stack CSS", () => {
    const stack = readWebSrc("components/chat/ComposerBannerStack.tsx");
    expect(DISMISS_TRANSITION_MS).toBe(220);
    expect(stack).toContain("transition-[translate,opacity] duration-220 ease-in");
    expect(stack).toContain("<ComposerBannerStackAlert");
  });

  it("mounts the banner stack on the shipped composer, not a parallel chrome", () => {
    const composer = readWebSrc("components/chat/ChatComposer.tsx");
    expect(composer).toContain("<ComposerBannerStack");
    expect(composer).toContain("items={bannerStackItems}");
    expect(composer).toContain("data-chat-composer-form");
  });

  it("uses glass composer chrome plus independent panel and tool-shine motion", () => {
    const css = readWebSrc("index.css");
    expect(css).toContain("--glass-blur:");
    expect(css).toContain("--chat-composer-glass-surface");
    expect(css).toContain("animation: live-tool-shine 2.2s steps(30) infinite");
    expect(css).toContain(".right-panel-inline-gap");
    expect(css).toContain("transition: width 200ms linear");
    expect(css).toContain(".terminal-drawer-inline-gap");
    expect(css).toContain("transition: height 200ms linear");
  });

  it("renders expandable activity-group thinking rows", () => {
    const timeline = readWebSrc("components/chat/MessagesTimeline.tsx");
    expect(timeline).toContain("function ActivityGroupTimelineRow");
    expect(timeline).toContain("function ReasoningTraceBlock");
    expect(timeline).toContain(
      '{row.kind === "activity-group" ? <ActivityGroupTimelineRow row={row} /> : null}',
    );
    expect(timeline).toContain("onToggleReasoning");
  });

  it("spins the Working dashed circle in the sidebar and the live Working row", () => {
    const sidebar = readWebSrc("components/Sidebar.tsx");
    const timeline = readWebSrc("components/chat/MessagesTimeline.tsx");
    expect(sidebar).toContain("motion-safe:animate-working-spin");
    expect(timeline).toContain("motion-safe:animate-working-spin");
    expect(timeline).toContain('<span data-live-working-spinner=""');
  });

  it("keeps the send control scale hover on the real primary actions", () => {
    const actions = readWebSrc("components/chat/ComposerPrimaryActions.tsx");
    expect(actions).toContain("hover:scale-105");
    expect(actions).toContain("transition-all duration-150");
  });
});
