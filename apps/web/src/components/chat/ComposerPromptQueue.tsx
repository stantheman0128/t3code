import { ImagePlus, ListOrdered, SquarePenIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import type { PromptQueueImage, PromptQueueItem } from "../../promptQueueStore";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { buildExpandedImagePreview, type ExpandedImagePreview } from "./ExpandedImagePreview";

interface ComposerPromptQueueProps {
  items: ReadonlyArray<PromptQueueItem>;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: { prompt?: string; images?: readonly PromptQueueImage[] }) => void;
  onExpandImage: (preview: ExpandedImagePreview) => void;
  className?: string;
  initialEditingId?: string | null;
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

export function promptQueueImageFromFile(file: File): PromptQueueImage {
  return {
    id: `queue-img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name || "image",
    previewUrl: URL.createObjectURL(file),
    mimeType: file.type || "image/png",
    sizeBytes: file.size,
    file,
  };
}

function QueueThumbnails({
  images,
  compact,
  editing,
  onExpandImage,
  onRemoveImage,
}: {
  images: PromptQueueItem["images"];
  compact?: boolean;
  editing?: boolean;
  onExpandImage?: (preview: ExpandedImagePreview) => void;
  onRemoveImage?: (imageId: string) => void;
}) {
  if (images.length === 0) {
    return null;
  }
  const visible = compact && !editing ? images.slice(0, 3) : images;
  const overflow = compact && !editing ? Math.max(0, images.length - visible.length) : 0;
  const sizeClass = compact && !editing ? "size-6" : "size-12";
  const expandImage = onExpandImage;

  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1" data-user-message-edit-ignore="">
      {visible.map((image) => {
        const preview = expandImage ? buildExpandedImagePreview(images, image.id) : null;
        const thumb =
          !preview || !expandImage ? (
            <img
              src={image.previewUrl}
              alt={image.name}
              className={cn(sizeClass, "rounded-md object-cover")}
            />
          ) : (
            <button
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

        if (!editing || !onRemoveImage) {
          return (
            <span key={image.id} className="relative inline-flex">
              {thumb}
            </span>
          );
        }

        return (
          <span key={image.id} className="relative inline-flex">
            {thumb}
            <button
              type="button"
              className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border/70 hover:text-foreground"
              aria-label={`Remove ${image.name}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemoveImage(image.id);
              }}
            >
              <X className="size-2.5" aria-hidden />
            </button>
          </span>
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
  onSave: (prompt: string, images: readonly PromptQueueImage[]) => void;
  onRemove: () => void;
  onExpandImage: (preview: ExpandedImagePreview) => void;
}) {
  const [draft, setDraft] = useState(item.prompt);
  const [draftImages, setDraftImages] = useState<readonly PromptQueueImage[]>(item.images);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLLIElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  const imagesRef = useRef(draftImages);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    imagesRef.current = draftImages;
  }, [draftImages]);

  useEffect(() => {
    if (!editing) {
      setDraft(item.prompt);
      setDraftImages(item.images);
      return;
    }
    setDraft(item.prompt);
    setDraftImages(item.images);
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(item.prompt.length, item.prompt.length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing, item.prompt, item.images]);

  useEffect(() => {
    if (!editing) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (rootRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest("[data-expanded-image-preview]")) {
        return;
      }
      onSave(draftRef.current, imagesRef.current);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [editing, onSave]);

  const revokeDraftOnlyImages = (images: readonly PromptQueueImage[]) => {
    const originalIds = new Set(item.images.map((image) => image.id));
    for (const image of images) {
      if (!originalIds.has(image.id) && image.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(image.previewUrl);
      }
    }
  };

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }
    const next = [...draftImages];
    for (const file of fileList) {
      if (!file.type.startsWith("image/")) {
        continue;
      }
      next.push(promptQueueImageFromFile(file));
    }
    setDraftImages(next);
  };

  return (
    <li
      ref={rootRef}
      className="rounded-lg px-0.5 py-1.5"
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
              className="min-h-24 flex-1 [field-sizing:content] max-h-[min(24rem,60vh)] overflow-y-auto bg-transparent"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  revokeDraftOnlyImages(imagesRef.current);
                  onCancelEdit();
                  return;
                }
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  onSave(draft, draftImages);
                }
              }}
            />
            <Button
              type="button"
              size="icon-micro"
              variant="ghost-muted"
              className="mt-1"
              aria-label={`Remove queued follow-up ${index + 1}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                revokeDraftOnlyImages(imagesRef.current);
                onRemove();
              }}
              onPointerDown={(event) => event.preventDefault()}
            >
              <X className="size-3" aria-hidden />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pl-6">
            <QueueThumbnails
              images={draftImages}
              editing
              onExpandImage={onExpandImage}
              onRemoveImage={(imageId) => {
                setDraftImages((current) => {
                  const removed = current.find((image) => image.id === imageId);
                  if (removed) {
                    revokeDraftOnlyImages([removed]);
                  }
                  return current.filter((image) => image.id !== imageId);
                });
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label={`Add photos to queued follow-up ${index + 1}`}
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-7 gap-1 px-2"
              onClick={() => fileInputRef.current?.click()}
              onPointerDown={(event) => event.preventDefault()}
            >
              <ImagePlus className="size-3.5" aria-hidden />
              Add photos
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
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-5 text-foreground/90">
              {item.prompt.trim() || <span className="text-muted-foreground">Photo follow-up</span>}
            </p>
            <QueueThumbnails images={item.images} compact onExpandImage={onExpandImage} />
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
  initialEditingId = null,
}: ComposerPromptQueueProps) {
  const [editingId, setEditingId] = useState<string | null>(initialEditingId);

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
      className={cn(
        "chat-composer-drawer-slot chat-composer-drawer-attached relative z-0 isolate min-w-0 overflow-hidden rounded-t-2xl border border-b-0 border-border/70 bg-[var(--chat-composer-glass-surface,var(--card))] px-3 pt-2 pb-[calc(var(--chat-composer-attachment-overlap)_+_0.375rem)] sm:px-4",
        className,
      )}
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
      <ul
        className={cn(
          "flex flex-col gap-1.5 overflow-y-auto",
          editingId ? "max-h-[min(28rem,70vh)]" : "max-h-40",
        )}
      >
        {items.map((item, index) => (
          <QueueItemCard
            key={item.id}
            item={item}
            index={index}
            editing={editingId === item.id}
            onBeginEdit={() => setEditingId(item.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={(prompt, images) => {
              onUpdate(item.id, { prompt, images });
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
