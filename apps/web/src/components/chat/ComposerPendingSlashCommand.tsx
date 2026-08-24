import { Terminal, X } from "lucide-react";

import {
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
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
      className={cn(COMPOSER_INLINE_CHIP_CLASS_NAME, "pr-1")}
      data-testid="composer-pending-slash-command"
    >
      <Terminal className={cn(COMPOSER_INLINE_CHIP_ICON_CLASS_NAME, "size-3.5")} />
      <span className={cn(COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME, "font-mono")}>
        /{command.name}
      </span>
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
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );

  return (
    <span className={cn("inline-flex max-w-full", className)}>
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
