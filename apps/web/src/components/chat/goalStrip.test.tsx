import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerBannerStack } from "./ComposerBannerStack";
import { createGoalBannerItem } from "./goalStrip";

describe("createGoalBannerItem", () => {
  it("lets a Grok Goal active strip be opened to the full objective and duration", () => {
    const collapsed = renderToStaticMarkup(
      <ComposerBannerStack
        items={[
          createGoalBannerItem({
            id: "thread-goal:1",
            title: "Goal active",
            objective: "Prove Klaus Pinn's D-sequence claims C1, C2, and C5.",
            durationLabel: "12m",
            running: false,
            expanded: false,
            onToggle: () => {},
          }),
        ]}
      />,
    );
    const expanded = renderToStaticMarkup(
      <ComposerBannerStack
        items={[
          createGoalBannerItem({
            id: "thread-goal:1",
            title: "Goal running",
            objective: "Prove Klaus Pinn's D-sequence claims C1, C2, and C5.",
            durationLabel: "12m",
            running: true,
            expanded: true,
            onToggle: () => {},
          }),
        ]}
      />,
    );

    expect(collapsed).toContain("Goal active");
    expect(collapsed).toContain('aria-label="Show full goal"');
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain("line-clamp-2");
    expect(expanded).toContain("Goal running");
    expect(expanded).toContain('aria-label="Hide full goal"');
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).not.toContain("not running");
    expect(expanded).toContain("running");
    expect(expanded).toContain("12m");
    expect(expanded).toContain("D-sequence claims C1, C2, and C5.");
  });

  it("shows Codex elapsed time from timeUsedSeconds", () => {
    const markup = renderToStaticMarkup(
      <ComposerBannerStack
        items={[
          createGoalBannerItem({
            id: "codex-goal:1",
            title: "Goal active",
            objective: "Ship it",
            durationLabel: "90s",
            running: false,
            expanded: true,
            onToggle: () => {},
          }),
        ]}
      />,
    );
    expect(markup).toContain("Ship it");
    expect(markup).toContain("90s");
    expect(markup).toContain("not running");
  });
});
