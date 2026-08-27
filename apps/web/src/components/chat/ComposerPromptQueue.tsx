import { ListOrdered, X } from "lucide-react";

import {
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
} from "../composerInlineChip";
import { cn } from "~/lib/utils";
import type { PromptQueueItem } from "../../promptQueueStore";

interface ComposerPromptQueueProps {
  items: ReadonlyArray<PromptQueueItem>;
  onRemove: (id: string) => void;
  className?: string;
}

export function ComposerPromptQueue({ items, onRemove, className }: ComposerPromptQueueProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      data-composer-prompt-queue="true"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {items.map((item, index) => (
        <span
          key={item.id}
          className={cn(COMPOSER_INLINE_CHIP_CLASS_NAME, "w-fit max-w-full pr-1")}
          title={item.prompt}
        >
          <ListOrdered className={cn(COMPOSER_INLINE_CHIP_ICON_CLASS_NAME, "size-3.5")} />
          <span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>
            {items.length > 1 ? `Queue ${index + 1}` : "Queued"}
            {item.prompt.trim() ? ` · ${item.prompt.trim()}` : ""}
          </span>
          <button
            type="button"
            aria-label="Remove queued prompt"
            className={COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove(item.id);
            }}
          >
            <X className="size-[0.85em]" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
