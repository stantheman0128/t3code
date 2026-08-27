import { ListOrdered, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import type { PromptQueueItem } from "../../promptQueueStore";
import { ComposerTasksDrawerClip } from "./ComposerTasksBadge";
import { Button } from "../ui/button";

interface ComposerPromptQueueProps {
  items: ReadonlyArray<PromptQueueItem>;
  onRemove: (id: string) => void;
  className?: string;
}

function previewLabel(item: PromptQueueItem): string {
  const prompt = item.prompt.trim();
  if (prompt) {
    return prompt;
  }
  if (item.images.length === 1) {
    return item.images[0]?.name ?? "Photo";
  }
  if (item.images.length > 1) {
    return `${item.images.length} photos`;
  }
  return "Empty follow-up";
}

function QueueThumbnails({
  images,
  compact,
}: {
  images: PromptQueueItem["images"];
  compact?: boolean;
}) {
  if (images.length === 0) {
    return null;
  }
  const visible = compact ? images.slice(0, 3) : images;
  const overflow = compact ? Math.max(0, images.length - visible.length) : 0;
  const sizeClass = compact ? "size-6" : "size-12";

  return (
    <span className="flex shrink-0 items-center gap-1">
      {visible.map((image) => (
        <img
          key={image.id}
          src={image.previewUrl}
          alt={image.name}
          className={cn(sizeClass, "rounded-md object-cover")}
        />
      ))}
      {overflow > 0 ? (
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

export function ComposerPromptQueue({ items, onRemove, className }: ComposerPromptQueueProps) {
  const [open, setOpen] = useState(false);
  const previousCountRef = useRef(0);

  useEffect(() => {
    if (items.length > previousCountRef.current) {
      setOpen(true);
    }
    if (items.length === 0) {
      setOpen(false);
    }
    previousCountRef.current = items.length;
  }, [items.length]);

  if (items.length === 0) {
    return null;
  }

  const nextItem = items[0];
  const photoCount = items.reduce((sum, item) => sum + item.images.length, 0);
  const collapsedLabel =
    items.length === 1 ? previewLabel(nextItem!) : `Next: ${previewLabel(nextItem!)}`;

  return (
    <div data-composer-prompt-queue="true" className={cn("min-w-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="composer-prompt-queue-list"
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-0.5 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((current) => !current)}
        onPointerDown={(event) => event.preventDefault()}
      >
        <ListOrdered aria-hidden className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium text-foreground">Queue {items.length}</span>
        {!open ? (
          <>
            <span className="min-w-0 flex-1 truncate">{collapsedLabel}</span>
            <QueueThumbnails images={nextItem?.images ?? []} compact />
            {photoCount > 0 && items.length > 1 ? (
              <span className="shrink-0 tabular-nums">{photoCount} photos</span>
            ) : null}
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate">Sends after this turn, in order</span>
        )}
      </button>
      <ComposerTasksDrawerClip open={open}>
        <div id="composer-prompt-queue-list" className="max-h-56 overflow-y-auto pt-1" role="list">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-start gap-2 rounded-md px-0.5 py-1.5"
              role="listitem"
            >
              <span className="w-4 shrink-0 pt-0.5 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="whitespace-pre-wrap break-words text-sm leading-5 text-foreground/90">
                  {item.prompt.trim() || (
                    <span className="text-muted-foreground">Photo follow-up</span>
                  )}
                </p>
                <QueueThumbnails images={item.images} />
              </div>
              <Button
                type="button"
                size="icon-micro"
                variant="ghost-muted"
                aria-label={`Remove queued follow-up ${index + 1}`}
                className="shrink-0"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(item.id);
                }}
                onPointerDown={(event) => event.preventDefault()}
              >
                <X className="size-3" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      </ComposerTasksDrawerClip>
    </div>
  );
}
