import type { CodexGoal } from "@t3tools/contracts";
import {
  derivePromptGoalFromUserTexts,
  formatPromptGoalElapsedLabel,
} from "@t3tools/client-runtime/state/threads";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerBannerStack } from "./ComposerBannerStack";
import {
  composeGoalControlPrompt,
  GoalStripBar,
  resolveComposerGoalBanner,
  resolveComposerGoalStrip,
} from "./goalStrip";

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

function renderGoalStrip(input: {
  readonly phase?: Parameters<typeof resolveComposerGoalStrip>[0]["phase"];
  readonly expanded?: boolean;
  readonly promptGoal?: ReturnType<typeof grokPromptGoal>;
  readonly codexGoal?: CodexGoal | null;
  readonly paused?: boolean;
}) {
  const promptGoal = input.paused
    ? derivePromptGoalFromUserTexts([
        { text: `/goal ${GROK_OBJECTIVE}`, createdAt: GOAL_STARTED_AT },
        { text: "/goal pause", createdAt: GOAL_STARTED_AT },
      ])
    : (input.promptGoal ?? grokPromptGoal());
  const model = resolveComposerGoalStrip({
    threadId: "1",
    phase: input.phase ?? "ready",
    codexGoal: input.codexGoal ?? null,
    promptGoal: input.codexGoal ? null : promptGoal,
    now: GOAL_NOW,
  });
  if (model === null) {
    return { model: null, markup: "" };
  }
  return {
    model,
    markup: renderToStaticMarkup(
      <GoalStripBar
        model={model}
        expanded={input.expanded ?? false}
        onToggle={() => {}}
        onPause={() => {}}
        onResume={() => {}}
        onEdit={() => {}}
      />,
    ),
  };
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
    expect(collapsed).toContain("line-clamp-1");
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

describe("GoalStripBar", () => {
  it("keeps Pause, Resume, and Edit off the expand control", () => {
    const active = renderGoalStrip({ expanded: false });
    const paused = renderGoalStrip({ paused: true });
    const elapsed = formatPromptGoalElapsedLabel({
      startedAt: GOAL_STARTED_AT,
      now: GOAL_NOW,
    });

    expect(active.model?.status).toBe("active");
    expect(active.markup).toContain('data-composer-goal-strip="true"');
    expect(active.markup).toContain("Goal active");
    expect(active.markup).toContain("D-sequence claims C1, C2, and C5.");
    expect(active.markup).toContain('aria-label="Pause goal"');
    expect(active.markup).toContain(">Pause</button>");
    expect(active.markup).toContain('aria-label="Edit goal"');
    expect(active.markup).toContain(">Edit</button>");
    expect(active.markup).not.toContain('aria-label="Resume goal"');
    expect(active.markup).toContain('aria-label="Show full goal"');

    expect(paused.model?.status).toBe("paused");
    expect(paused.markup).toContain("Goal paused");
    expect(paused.markup).toContain('aria-label="Resume goal"');
    expect(paused.markup).toContain(">Resume</button>");
    expect(paused.markup).not.toContain('aria-label="Pause goal"');
    expect(paused.markup).toContain('aria-label="Edit goal"');

    const expanded = renderGoalStrip({ phase: "running", expanded: true });
    expect(expanded.markup).toContain("Goal running");
    expect(expanded.markup).toContain("running");
    expect(elapsed).toBe("12m");
    expect(expanded.markup).toContain("12m");
  });

  it("composes provider control slashes for pause and resume", () => {
    expect(composeGoalControlPrompt("pause")).toBe("/goal pause");
    expect(composeGoalControlPrompt("resume")).toBe("/goal resume");
    expect(composeGoalControlPrompt("clear")).toBe("/goal clear");
  });
});
