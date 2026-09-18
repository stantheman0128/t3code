import { TargetIcon } from "lucide-react";
import type { CodexGoal, CodexGoalStatus } from "@t3tools/contracts";
import {
  buildGoalStripContent,
  formatCodexGoalDescription,
  formatCodexGoalStatus,
  formatPromptGoalElapsedLabel,
  formatPromptGoalTitle,
  type PromptGoal,
} from "@t3tools/client-runtime/state/threads";

import type { SessionPhase } from "../../types";
import { Button } from "../ui/button";
import { ComposerBanner } from "./ComposerBanner";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

export type ComposerGoalStripModel = {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly durationLabel: string | null;
  readonly running: boolean;
  readonly status: CodexGoalStatus;
};

export function composeGoalControlPrompt(action: "pause" | "resume" | "clear"): string {
  return `/goal ${action}`;
}

export function resolveComposerGoalStrip(input: {
  readonly threadId?: string | null;
  readonly phase: SessionPhase;
  readonly codexGoal: CodexGoal | null;
  readonly promptGoal: PromptGoal | null;
  readonly now?: Date;
}): ComposerGoalStripModel | null {
  const threadId = input.threadId ?? "unknown";
  if (input.codexGoal !== null) {
    return {
      id: `codex-goal:${threadId}`,
      title: `Goal ${formatCodexGoalStatus(input.codexGoal.status)}`,
      objective: formatCodexGoalDescription(input.codexGoal),
      durationLabel: formatPromptGoalElapsedLabel({
        timeUsedSeconds: input.codexGoal.timeUsedSeconds,
        now: input.now,
      }),
      running: input.phase === "running" && input.codexGoal.status === "active",
      status: input.codexGoal.status,
    };
  }
  if (input.promptGoal === null) {
    return null;
  }
  const running = input.phase === "running" && input.promptGoal.status === "active";
  return {
    id: `thread-goal:${threadId}`,
    title: formatPromptGoalTitle(input.promptGoal, running),
    objective: input.promptGoal.objective,
    durationLabel: formatPromptGoalElapsedLabel({
      startedAt: input.promptGoal.startedAt,
      now: input.now,
    }),
    running,
    status: input.promptGoal.status,
  };
}

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

/** Stack-item form kept for tests and any leftover notice-stack callers. */
export function resolveComposerGoalBanner(input: {
  readonly threadId?: string | null;
  readonly phase: SessionPhase;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly codexGoal: CodexGoal | null;
  readonly promptGoal: PromptGoal | null;
  readonly now?: Date;
}): ComposerBannerStackItem | null {
  const model = resolveComposerGoalStrip(input);
  if (model === null) {
    return null;
  }
  return createGoalBannerItem({
    ...model,
    expanded: input.expanded,
    onToggle: input.onToggle,
  });
}

export function GoalStripBar({
  model,
  expanded,
  busy = false,
  onToggle,
  onPause,
  onResume,
  onEdit,
}: {
  readonly model: ComposerGoalStripModel;
  readonly expanded: boolean;
  readonly busy?: boolean;
  readonly onToggle: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onEdit: () => void;
}) {
  const content = buildGoalStripContent({
    title: model.title,
    objective: model.objective,
    durationLabel: model.durationLabel,
    running: model.running,
    expanded,
  });
  const showPause = model.status === "active";
  const showResume = model.status === "paused";

  return (
    <ComposerBanner.Root data-composer-goal-strip="true" density="comfortable" variant="info">
      <ComposerBanner.Row layout="wrap-actions-narrow">
        <ComposerBanner.Icon className="h-(--composer-banner-icon-column) self-start">
          <TargetIcon />
        </ComposerBanner.Icon>
        <ComposerBanner.Content>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 rounded-[0.5rem] text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            aria-expanded={expanded}
            aria-label={content.activateLabel}
            onClick={onToggle}
          >
            <span className="min-w-0 shrink-0 font-medium leading-7 sm:leading-6">
              {content.title}
            </span>
            {expanded ? null : (
              <span className="min-w-0 shrink-[9999] truncate text-muted-foreground">
                {model.objective}
              </span>
            )}
          </button>
        </ComposerBanner.Content>
        <ComposerBanner.Actions>
          {showPause ? (
            <Button
              size="micro"
              variant="ghost-muted"
              disabled={busy}
              aria-label="Pause goal"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onPause();
              }}
            >
              Pause
            </Button>
          ) : null}
          {showResume ? (
            <Button
              size="micro"
              variant="ghost-muted"
              disabled={busy}
              aria-label="Resume goal"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onResume();
              }}
            >
              Resume
            </Button>
          ) : null}
          <Button
            size="micro"
            variant="ghost-muted"
            disabled={busy}
            aria-label="Edit goal"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            Edit
          </Button>
        </ComposerBanner.Actions>
      </ComposerBanner.Row>
      {expanded ? (
        <ComposerBanner.Children>
          <p className="whitespace-pre-wrap text-muted-foreground">{content.body}</p>
        </ComposerBanner.Children>
      ) : null}
    </ComposerBanner.Root>
  );
}
