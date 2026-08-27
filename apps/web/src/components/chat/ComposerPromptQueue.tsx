import { ListOrdered, SquarePenIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import type { PromptQueueItem } from "../../promptQueueStore";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { buildExpandedImagePreview, type ExpandedImagePreview } from "./ExpandedImagePreview";

interface ComposerPromptQueueProps {
  items: ReadonlyArray<PromptQueueItem>;
  onRemove: (id: string) => void;
  onUpdate: (id: string, prompt: string) => void;
  onExpandImage: (preview: ExpandedImagePreview) => void;
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
  onExpandImage,
}: {
  images: PromptQueueItem["images"];
  compact?: boolean;
  onExpandImage?: (preview: ExpandedImagePreview) => void;
}) {
  if (images.length === 0) {
    return null;
  }
  const visible = compact ? images.slice(0, 3) : images;
  const overflow = compact ? Math.max(0, images.length - visible.length) : 0;
  const sizeClass = compact ? "size-6" : "size-12";
  const expandImage = onExpandImage;

  return (
    <span className="flex shrink-0 items-center gap-1" data-user-message-edit-ignore="">
      {visible.map((image) => {
        const preview = expandImage ? buildExpandedImagePreview(images, image.id) : null;
        if (!preview || !expandImage) {
          return (
            <img
              key={image.id}
              src={image.previewUrl}
              alt={image.name}
              className={cn(sizeClass, "rounded-md object-cover")}
            />
          );
        }
        return (
          <button
            key={image.id}
            type="button"
            className={cn(sizeClass, "cursor-zoom-in overflow-hidden rounded-md")}
            aria-label={`Preview ${image.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              expandImage(preview);
            }}
          >
            <img src={image.previewUrl} alt={image.name} className="size-full object-cover" />
          </button>
        );
      })}
      {overflow > 0 ? (
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

function QueueItemCard({
  item,
  index,
  editing,
  onBeginEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onExpandImage,
}: {
  item: PromptQueueItem;
  index: number;
  editing: boolean;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onSave: (prompt: string) => void;
  onRemove: () => void;
  onExpandImage: (preview: ExpandedImagePreview) => void;
}) {
  const [draft, setDraft] = useState(item.prompt);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(item.prompt);
      return;
    }
    setDraft(item.prompt);
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(item.prompt.length, item.prompt.length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing, item.prompt]);

  return (
    <li
      className="rounded-xl border border-border/70 bg-muted/40 px-2.5 py-2"
      data-composer-prompt-queue-item={item.id}
      data-editing={editing ? "true" : "false"}
    >
      {editing ? (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="w-4 shrink-0 pt-1.5 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <Textarea
              ref={textareaRef}
              unstyled
              size="sm"
              value={draft}
              aria-label={`Edit queued follow-up ${index + 1}`}
              className="min-h-16 flex-1 bg-transparent"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelEdit();
                  return;
                }
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  onSave(draft);
                }
              }}
            />
          </div>
          <QueueThumbnails images={item.images} onExpandImage={onExpandImage} />
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={onCancelEdit}
              onPointerDown={(event) => event.preventDefault()}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="xs"
              onClick={() => onSave(draft)}
              onPointerDown={(event) => event.preventDefault()}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <span className="w-4 shrink-0 pt-0.5 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <button
            type="button"
            className="min-w-0 flex-1 space-y-1.5 rounded-md text-left"
            aria-label={`Edit queued follow-up ${index + 1}`}
            onClick={onBeginEdit}
          >
            <p className="whitespace-pre-wrap break-words text-sm leading-5 text-foreground/90">
              {item.prompt.trim() || <span className="text-muted-foreground">Photo follow-up</span>}
            </p>
            <QueueThumbnails images={item.images} onExpandImage={onExpandImage} />
          </button>
          <div className="flex shrink-0 items-center gap-0.5" data-user-message-edit-ignore="">
            <Button
              type="button"
              size="icon-micro"
              variant="ghost-muted"
              aria-label={`Edit queued follow-up ${index + 1}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onBeginEdit();
              }}
              onPointerDown={(event) => event.preventDefault()}
            >
              <SquarePenIcon className="size-3" aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon-micro"
              variant="ghost-muted"
              aria-label={`Remove queued follow-up ${index + 1}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemove();
              }}
              onPointerDown={(event) => event.preventDefault()}
            >
              <X className="size-3" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ComposerPromptQueue({
  items,
  onRemove,
  onUpdate,
  onExpandImage,
  className,
}: ComposerPromptQueueProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (editingId && !items.some((item) => item.id === editingId)) {
      setEditingId(null);
    }
  }, [editingId, items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      data-composer-prompt-queue="true"
      className={cn("min-w-0", className)}
      aria-label="Queued follow-ups"
    >
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <ListOrdered aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
          Queued · sends after this turn
        </p>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </div>
      <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto">
        {items.map((item, index) => (
          <QueueItemCard
            key={item.id}
            item={item}
            index={index}
            editing={editingId === item.id}
            onBeginEdit={() => setEditingId(item.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={(prompt) => {
              onUpdate(item.id, prompt);
              setEditingId(null);
            }}
            onRemove={() => onRemove(item.id)}
            onExpandImage={onExpandImage}
          />
        ))}
      </ul>
    </section>
  );
}

export { previewLabel as queuedFollowUpPreviewLabel };
