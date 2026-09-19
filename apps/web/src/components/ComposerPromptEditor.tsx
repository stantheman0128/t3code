import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";

import { COMPOSER_INLINE_CHIP_LINE_STRUT_CLASS_NAME } from "./composerInlineChip";
import { ComposerPromptEditorTiptap } from "./ComposerPromptEditorTiptap";
import type { ComposerPromptEditorProps as TiptapComposerPromptEditorProps } from "./ComposerPromptEditorTiptap";

export type {
  ComposerCitationCommentRequest,
  ComposerPromptEditorHandle,
} from "./ComposerPromptEditorTiptap";

export type ComposerPromptEditorProps = TiptapComposerPromptEditorProps & {
  /** First-line token (slash chip). Sits in the same line box as the prompt. */
  prefix?: ReactNode;
};

/**
 * The composer editor. Tiptap in both modes: the `richTextEnabled` setting
 * toggles Markdown styling, never the engine. Plain mode renders every
 * marker as a literal character and serializes byte-identically.
 *
 * `prefix` is the inline slash chip from the fork: overlayed on the first
 * line with text-indent so the caret shares that line box.
 */
export function ComposerPromptEditor({
  prefix,
  containerClassName,
  className,
  ...props
}: ComposerPromptEditorProps) {
  const prefixRef = useRef<HTMLSpanElement>(null);
  const [firstLineIndentPx, setFirstLineIndentPx] = useState(0);

  useLayoutEffect(() => {
    if (!prefix) {
      setFirstLineIndentPx(0);
      return;
    }
    const node = prefixRef.current;
    if (!node) {
      return;
    }
    const update = () => {
      const width = node.offsetWidth;
      setFirstLineIndentPx(width > 0 ? width + 6 : 0);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [prefix]);

  const prefixIndentStyle =
    firstLineIndentPx > 0
      ? ({
          ["--composer-prefix-indent" as string]: `${firstLineIndentPx}px`,
        } as CSSProperties)
      : undefined;

  return (
    <div className={cn("relative", containerClassName)} style={prefixIndentStyle}>
      {prefix ? (
        <span
          ref={prefixRef}
          className={cn(
            "pointer-events-none absolute left-0 top-0 z-1",
            COMPOSER_INLINE_CHIP_LINE_STRUT_CLASS_NAME,
          )}
          data-testid="composer-inline-chip-line"
        >
          <span className="pointer-events-auto inline-flex max-w-full items-center">{prefix}</span>
        </span>
      ) : null}
      <ComposerPromptEditorTiptap
        {...props}
        className={cn(
          firstLineIndentPx > 0 && "[text-indent:var(--composer-prefix-indent)]",
          className,
        )}
      />
    </div>
  );
}
