import { useEffect, useRef, type ReactNode } from "react";
import type {
  ModelSelection,
  ProviderDriverKind,
  ScopedThreadRef,
  ServerProvider,
} from "@t3tools/contracts";
import type { UnifiedSettings } from "@t3tools/contracts/settings";

import type { DraftId } from "../../composerDraftStore";
import { useEffectiveComposerModelState } from "../../composerDraftStore";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { renderProviderTraitsPicker } from "./composerProviderState";

export interface UserMessageEditSession {
  readonly provider: ProviderDriverKind;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly threadRef?: ScopedThreadRef;
  readonly draftId?: DraftId;
  readonly settings: UnifiedSettings;
  readonly threadModelSelection: ModelSelection | null | undefined;
  readonly projectModelSelection: ModelSelection | null | undefined;
}

export function UserMessageEditTraits({
  prompt,
  onPromptChange,
  session,
}: {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  session: UserMessageEditSession;
}) {
  const providerEntries = deriveProviderInstanceEntries(session.providers);
  const selectedEntry =
    providerEntries.find((entry) => entry.driverKind === session.provider) ?? providerEntries[0];
  const { selectedModel, modelOptions } = useEffectiveComposerModelState({
    ...(session.threadRef ? { threadRef: session.threadRef } : {}),
    ...(session.draftId ? { draftId: session.draftId } : {}),
    providers: session.providers,
    selectedProvider: session.provider,
    ...(selectedEntry ? { selectedInstanceId: selectedEntry.instanceId } : {}),
    threadModelSelection: session.threadModelSelection,
    projectModelSelection: session.projectModelSelection,
    settings: session.settings,
  });
  const selectedModelOptions = selectedEntry
    ? (modelOptions?.[selectedEntry.instanceId] ?? undefined)
    : undefined;

  return renderProviderTraitsPicker({
    provider: session.provider,
    ...(selectedEntry ? { instanceId: selectedEntry.instanceId } : {}),
    ...(session.threadRef ? { threadRef: session.threadRef } : {}),
    ...(session.draftId ? { draftId: session.draftId } : {}),
    model: selectedModel,
    models: selectedEntry?.models ?? [],
    modelOptions: selectedModelOptions,
    prompt,
    onPromptChange,
    planModeEnabled: session.settings.planModeEnabled,
  });
}

export function UserMessageEditPanel({
  draft,
  onDraftChange,
  onSubmit,
  onCancel,
  traits,
  canSend,
  sendDisabledReason,
  isBusy,
}: {
  draft: string;
  onDraftChange: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  traits: ReactNode;
  canSend: boolean;
  sendDisabledReason: string | null;
  isBusy: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const length = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(length, length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="space-y-2" data-user-message-editor="true">
      <Textarea
        ref={textareaRef}
        unstyled
        value={draft}
        aria-label="Edit message"
        className="min-h-24 w-full bg-transparent text-sm leading-5"
        disabled={isBusy}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSend && !isBusy) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={cn("min-w-0", !traits && "hidden")}>{traits}</div>
        <div className="ml-auto flex flex-col items-end gap-1">
          {sendDisabledReason ? (
            <p className="max-w-64 text-right text-[11px] text-muted-foreground">
              {sendDisabledReason}
            </p>
          ) : null}
          <div className="flex items-center gap-1">
            <Button type="button" size="xs" variant="ghost" disabled={isBusy} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              size="xs"
              disabled={!canSend || isBusy}
              title={sendDisabledReason ?? undefined}
              onClick={onSubmit}
            >
              {isBusy ? "Sending" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
