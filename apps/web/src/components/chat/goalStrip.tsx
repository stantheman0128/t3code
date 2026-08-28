import { TargetIcon } from "lucide-react";
import { buildGoalStripContent } from "@t3tools/client-runtime/state/threads";

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
      <span className={input.expanded ? "whitespace-pre-wrap" : "line-clamp-2"}>
        {content.body}
      </span>
    ),
    onActivate: input.onToggle,
    activateLabel: content.activateLabel,
    expanded: input.expanded,
  };
}
