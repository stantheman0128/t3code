import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerBannerStack, type ComposerBannerStackItem } from "./ComposerBannerStack";

const banner = (
  id: string,
  variant: ComposerBannerStackItem["variant"] = "warning",
): ComposerBannerStackItem => ({
  id,
  variant,
  icon: <span aria-hidden="true">!</span>,
  title: `${id} warning`,
});

describe("ComposerBannerStack", () => {
  it("keeps expanded banners in layout flow so surrounding content moves out of their way", () => {
    const markup = renderToStaticMarkup(
      <ComposerBannerStack items={[banner("front"), banner("stacked")]} />,
    );

    const expandedItems = markup.match(
      /<div data-composer-banner-stack-expanded-items="true" class="([^"]+)">/,
    );

    expect(expandedItems?.[1]).toContain("grid-rows-[0fr]");
    expect(expandedItems?.[1]).toContain("group-hover/banner-stack:grid-rows-[1fr]");
    expect(expandedItems?.[1]).toContain("z-20");
    expect(expandedItems?.[1]).not.toContain("absolute");
    expect(markup.indexOf("front warning")).toBeLessThan(markup.indexOf("stacked warning"));
    expect(markup).toContain("invisible pointer-events-none");
    expect(markup).toContain("group-focus-within/banner-stack:visible");
  });

  it("colors the collapsed stack cap by the hidden banner's variant, not a fixed warning", () => {
    const neutralBehind = renderToStaticMarkup(
      <ComposerBannerStack items={[banner("front", "default"), banner("stacked", "default")]} />,
    );
    expect(neutralBehind).toContain("chat-composer-banner-stack-cap");
    expect(neutralBehind).toContain("border-[var(--chat-composer-attached-outline)]");
    expect(neutralBehind).not.toContain("border-warning/24");

    const warningBehind = renderToStaticMarkup(
      <ComposerBannerStack items={[banner("front", "default"), banner("stacked", "warning")]} />,
    );
    expect(warningBehind).toContain("border-warning/24");
  });

  it("does not render an expandable region for a single banner", () => {
    const markup = renderToStaticMarkup(<ComposerBannerStack items={[banner("front")]} />);

    expect(markup).not.toContain("data-composer-banner-stack-expanded-items");
    expect(markup).toContain("chat-composer-drawer-attached");
    expect(markup).toContain("bg-[var(--chat-composer-glass-surface,var(--card))]");
    expect(markup).not.toContain("chat-composer-drawer-surface");
    expect(markup).not.toContain("before:mask-none");
    expect(markup).toContain("text-xs");
    expect(markup).toContain('data-composer-banner-drawer="true"');
    expect(markup).toContain('data-variant="warning"');
    expect(markup).toContain("transform:none");
    expect(markup).not.toContain("will-change:transform");
  });
  it("applies item-specific surface and action layout classes", () => {
    const markup = renderToStaticMarkup(
      <ComposerBannerStack
        items={[
          {
            ...banner("branch"),
            className: "branch-surface",
            actionClassName: "branch-actions",
            actions: <button type="button">Repair</button>,
          },
        ]}
      />,
    );

    expect(markup).toContain("branch-surface");
    expect(markup).toContain("branch-actions");
    expect(markup).toContain("ml-auto");
    expect(markup).toContain("w-full");
  });

  it("keeps Monitoring title and Stop on one first-line row", () => {
    const markup = renderToStaticMarkup(
      <ComposerBannerStack
        items={[
          {
            id: "background-liveness:1",
            variant: "default",
            icon: <span aria-hidden="true">•</span>,
            title: "Monitoring",
            actions: <button type="button">Stop</button>,
          },
        ]}
      />,
    );

    expect(markup).toContain("Monitoring");
    expect(markup).toContain("Stop");
    expect(markup.indexOf("Monitoring")).toBeLessThan(markup.indexOf("Stop"));
    expect(markup).toContain("min-w-0 truncate");
    expect(markup).toContain("ml-auto");
    expect(markup).toContain("bg-[var(--chat-composer-glass-surface,var(--card))]");
    expect(markup).not.toContain("chat-composer-drawer-surface");
    expect(markup).toContain("overflow-hidden");
    expect(markup).not.toContain("absolute inset-y-0");
    expect(markup).toMatch(
      /data-slot="alert-title"[^>]*>Monitoring[\s\S]*data-slot="alert-action"[\s\S]*Stop/,
    );
  });

  it("renders a disabled compaction action on the shared accessible banner surface", () => {
    const markup = renderToStaticMarkup(
      <ComposerBannerStack
        items={[
          {
            id: "resume-compaction",
            variant: "info",
            icon: <span aria-hidden="true">!</span>,
            title: "Resume with less context",
            description: "250k tokens from an older session",
            actions: (
              <button type="button" disabled>
                Compact
              </button>
            ),
            dismissLabel: "Keep full history",
            onDismiss: () => {},
          },
        ]}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("chat-composer-drawer-attached");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-label="Keep full history"');
  });

  it("exposes a keyboard control that reveals the full Grok goal", () => {
    const markup = renderToStaticMarkup(
      <ComposerBannerStack
        items={[
          {
            id: "thread-goal:1",
            variant: "info",
            icon: <span aria-hidden="true">◎</span>,
            title: "Goal active",
            description: <span>Prove Klaus Pinn's D-sequence claims</span>,
            onActivate: () => {},
            activateLabel: "Show full goal",
            expanded: false,
          },
        ]}
      />,
    );

    expect(markup).toContain("Goal active");
    expect(markup).toContain('aria-label="Show full goal"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("D-sequence claims");
  });
});
