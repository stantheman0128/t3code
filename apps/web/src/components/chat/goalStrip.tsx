import { TargetIcon } from "lucide-react";
import type { CodexGoal } from "@t3tools/contracts";
import {
  buildGoalStripContent,
  formatCodexGoalDescription,
  formatCodexGoalStatus,
  formatPromptGoalElapsedLabel,
  formatPromptGoalTitle,
  type PromptGoal,
} from "@t3tools/client-runtime/state/threads";

import type { SessionPhase } from "../../types";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

export function createGoalBannerItem(input: {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly durationLabel: string | null;
  readonly running: boolean;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}): ComposerBannerStackItem {
  const content = buildGoalStripContent(input);
  return {
    id: input.id,
    variant: "info",
    icon: <TargetIcon />,
    title: content.title,
    description: (
      <span className={input.expanded ? "whitespace-pre-wrap" : "line-clamp-1"}>
        {content.body}
      </span>
    ),
    onActivate: input.onToggle,
    activateLabel: content.activateLabel,
    expanded: input.expanded,
  };
}

/** Same Goal-strip assembly ChatView puts above the composer. */
export function resolveComposerGoalBanner(input: {
  readonly threadId?: string | null;
  readonly phase: SessionPhase;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly codexGoal: CodexGoal | null;
  readonly promptGoal: PromptGoal | null;
  readonly now?: Date;
}): ComposerBannerStackItem | null {
  const threadId = input.threadId ?? "unknown";
  if (input.codexGoal !== null) {
    const running = input.phase === "running" && input.codexGoal.status === "active";
    return createGoalBannerItem({
      id: `codex-goal:${threadId}`,
      title: `Goal ${formatCodexGoalStatus(input.codexGoal.status)}`,
      objective: formatCodexGoalDescription(input.codexGoal),
      durationLabel: formatPromptGoalElapsedLabel({
        timeUsedSeconds: input.codexGoal.timeUsedSeconds,
        now: input.now,
      }),
      running,
      expanded: input.expanded,
      onToggle: input.onToggle,
    });
  }
  if (input.promptGoal === null) {
    return null;
  }
  const running = input.phase === "running" && input.promptGoal.status === "active";
  return createGoalBannerItem({
    id: `thread-goal:${threadId}`,
    title: formatPromptGoalTitle(input.promptGoal, running),
    objective: input.promptGoal.objective,
    durationLabel: formatPromptGoalElapsedLabel({
      startedAt: input.promptGoal.startedAt,
      now: input.now,
    }),
    running,
    expanded: input.expanded,
    onToggle: input.onToggle,
  });
}
