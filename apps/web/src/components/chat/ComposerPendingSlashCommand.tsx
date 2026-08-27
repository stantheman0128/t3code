import { X } from "lucide-react";

import {
  COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME,
  COMPOSER_INLINE_SLASH_CHIP_CLASS_NAME,
} from "../composerInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import type { ComposerPendingSlashCommand } from "../ChatView.logic";

interface ComposerPendingSlashCommandChipProps {
  command: ComposerPendingSlashCommand;
  onRemove: () => void;
  className?: string;
}

export function ComposerPendingSlashCommandChip({
  command,
  onRemove,
  className,
}: ComposerPendingSlashCommandChipProps) {
  const chip = (
    <span
      className={cn(COMPOSER_INLINE_SLASH_CHIP_CLASS_NAME, "pr-1")}
      data-testid="composer-pending-slash-command"
    >
      <span className="font-medium leading-relaxed">{`/${command.name}`}</span>
      <button
        type="button"
        aria-label={`Remove /${command.name}`}
        className={COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemove();
        }}
      >
        <X className="size-[0.85em]" aria-hidden />
      </button>
    </span>
  );

  return (
    <span className={cn("inline-flex max-w-full items-center", className)}>
      {command.hint ? (
        <Tooltip>
          <TooltipTrigger render={chip} />
          <TooltipPopup side="top" className="max-w-96 whitespace-normal leading-tight">
            {command.hint}
          </TooltipPopup>
        </Tooltip>
      ) : (
        chip
      )}
    </span>
  );
}
