import type { CodexGoal } from "@t3tools/contracts";
import {
  derivePromptGoalFromUserTexts,
  formatPromptGoalElapsedLabel,
} from "@t3tools/client-runtime/state/threads";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerBannerStack } from "./ComposerBannerStack";
import { resolveComposerGoalBanner } from "./goalStrip";

const GROK_OBJECTIVE = "Prove Klaus Pinn's D-sequence claims C1, C2, and C5.";
const GOAL_STARTED_AT = "2026-08-28T12:00:00.000Z";
const GOAL_NOW = new Date("2026-08-28T12:12:00.000Z");

function grokPromptGoal() {
  return derivePromptGoalFromUserTexts([
    { text: `/goal ${GROK_OBJECTIVE}`, createdAt: GOAL_STARTED_AT },
  ]);
}

function renderGoalBanner(input: Parameters<typeof resolveComposerGoalBanner>[0]) {
  const item = resolveComposerGoalBanner(input);
  if (item === null) {
    return "";
  }
  return renderToStaticMarkup(<ComposerBannerStack items={[item]} />);
}

describe("resolveComposerGoalBanner", () => {
  it("lets a Grok Goal active strip be opened to the full objective and duration", () => {
    const promptGoal = grokPromptGoal();
    const collapsed = renderGoalBanner({
      threadId: "1",
      phase: "ready",
      expanded: false,
      onToggle: () => {},
      codexGoal: null,
      promptGoal,
      now: GOAL_NOW,
    });
    const expanded = renderGoalBanner({
      threadId: "1",
      phase: "running",
      expanded: true,
      onToggle: () => {},
      codexGoal: null,
      promptGoal,
      now: GOAL_NOW,
    });
    const elapsed = formatPromptGoalElapsedLabel({
      startedAt: GOAL_STARTED_AT,
      now: GOAL_NOW,
    });

    expect(promptGoal?.objective).toBe(GROK_OBJECTIVE);
    expect(collapsed).toContain("Goal active");
    expect(collapsed).toContain('aria-label="Show full goal"');
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain("line-clamp-2");
    expect(expanded).toContain("Goal running");
    expect(expanded).toContain('aria-label="Hide full goal"');
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).not.toContain("not running");
    expect(expanded).toContain("running");
    expect(elapsed).toBe("12m");
    expect(expanded).toContain("12m");
    expect(expanded).toContain("D-sequence claims C1, C2, and C5.");
  });

  it("shows Codex elapsed time from timeUsedSeconds", () => {
    const codexGoal = {
      objective: "Ship it",
      status: "active",
      tokenBudget: 100_000,
      tokensUsed: 12_000,
      timeUsedSeconds: 90,
      createdAt: 1_777_000_000,
      updatedAt: 1_777_000_090,
    } satisfies CodexGoal;
    const markup = renderGoalBanner({
      threadId: "1",
      phase: "ready",
      expanded: true,
      onToggle: () => {},
      codexGoal,
      promptGoal: null,
    });
    const elapsed = formatPromptGoalElapsedLabel({ timeUsedSeconds: 90 });

    expect(elapsed).toBe("2m");
    expect(markup).toContain("Ship it");
    expect(markup).toContain("2m");
    expect(markup).toContain("not running");
  });
});
