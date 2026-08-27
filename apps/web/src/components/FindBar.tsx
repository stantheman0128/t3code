import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type Ref } from "react";

import { onOpenFindBar } from "../findBarBus";
import {
  applyFindHighlights,
  clearFindHighlights,
  collectFindRanges,
  formatFindStatus,
  revealFindRange,
  selectedFindQuery,
  stepFindIndex,
} from "../lib/findInPage";
import { cn, isMacPlatform } from "../lib/utils";
import { Button } from "./ui/button";

export function FindBarView(props: {
  readonly query: string;
  readonly status: string;
  readonly hasQuery: boolean;
  readonly hasMatches: boolean;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly onQueryChange: (value: string) => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onClose: () => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
  }

  return (
    <form
      data-find-bar="true"
      role="search"
      className="fixed top-[calc(var(--workspace-controls-top)+var(--workspace-topbar-height)+0.5rem)] right-[var(--workspace-controls-right)] z-[80] flex items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-lg [-webkit-app-region:no-drag]"
      onSubmit={handleSubmit}
    >
      <input
        ref={props.inputRef}
        aria-label="Find in page"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="h-7 w-48 bg-transparent px-2 text-sm outline-none placeholder:text-placeholder"
        placeholder="Find"
        spellCheck={false}
        type="search"
        value={props.query}
        onChange={(event) => props.onQueryChange(event.target.value)}
      />
      <span
        aria-live="polite"
        className={cn(
          "min-w-16 px-1 text-center text-xs tabular-nums",
          props.hasQuery && !props.hasMatches ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {props.status}
      </span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Previous match"
        disabled={!props.hasMatches}
        onClick={props.onPrevious}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Next match"
        disabled={!props.hasMatches}
        onClick={props.onNext}
      >
        <ChevronDown />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Close find"
        onClick={props.onClose}
      >
        <X />
      </Button>
    </form>
  );
}

export function FindBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef(query);
  const currentIndexRef = useRef(currentIndex);

  queryRef.current = query;
  currentIndexRef.current = currentIndex;

  const applySearch = useCallback((nextQuery: string, direction: 0 | 1 | -1) => {
    clearFindHighlights();
    const ranges = collectFindRanges(document.body, nextQuery);
    const count = ranges.length;
    const nextIndex =
      direction === 0 ? 0 : stepFindIndex(currentIndexRef.current, count, direction);
    setMatchCount(count);
    setCurrentIndex(count === 0 ? 0 : nextIndex);
    applyFindHighlights(ranges, nextIndex);
    const current = ranges[nextIndex];
    if (current) revealFindRange(current);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    clearFindHighlights();
  }, []);

  const openBar = useCallback(() => {
    const seed = selectedFindQuery(window.getSelection()?.toString() ?? "");
    setOpen(true);
    setQuery((current) => {
      const next = seed.length > 0 ? seed : current;
      queueMicrotask(() => applySearch(next, 0));
      return next;
    });
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [applySearch]);

  useEffect(() => onOpenFindBar(openBar), [openBar]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      const usesMod = isMacPlatform(navigator.platform) ? event.metaKey : event.ctrlKey;
      const findNext =
        event.key === "F3" ||
        (event.key === "Enter" && event.target === inputRef.current) ||
        (usesMod && event.key.toLowerCase() === "g");
      if (!findNext) return;
      event.preventDefault();
      event.stopPropagation();
      applySearch(queryRef.current, event.shiftKey ? -1 : 1);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [applySearch, close, open]);

  useEffect(() => () => clearFindHighlights(), []);

  if (!open) return null;

  return (
    <FindBarView
      query={query}
      status={query.length === 0 ? "" : formatFindStatus(currentIndex, matchCount)}
      hasQuery={query.length > 0}
      hasMatches={matchCount > 0}
      inputRef={inputRef}
      onQueryChange={(value) => {
        setQuery(value);
        applySearch(value, 0);
      }}
      onNext={() => applySearch(query, 1)}
      onPrevious={() => applySearch(query, -1)}
      onClose={close}
    />
  );
}
