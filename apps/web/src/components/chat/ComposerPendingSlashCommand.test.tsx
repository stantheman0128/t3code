import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  COMPOSER_INLINE_CHIP_LINE_STRUT_CLASS_NAME,
  COMPOSER_INLINE_SLASH_CHIP_CLASS_NAME,
} from "../composerInlineChip";
import { ComposerPendingSlashCommandChip } from "./ComposerPendingSlashCommand";

describe("ComposerPendingSlashCommandChip", () => {
  it("renders the command as an inline same-line-height token", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingSlashCommandChip command={{ name: "goal", hint: null }} onRemove={vi.fn()} />,
    );

    expect(markup).toContain('data-testid="composer-pending-slash-command"');
    expect(markup).toContain("/goal");
    expect(markup).toContain("text-sky-700");
    expect(markup).toContain("leading-relaxed");
    expect(markup).not.toContain("bg-[var(--chat-composer-glass-surface,var(--card))]");
    expect(markup).not.toContain("h-[1.41em]");
    expect(markup).not.toContain("mt-[0.35em]");
    expect(COMPOSER_INLINE_SLASH_CHIP_CLASS_NAME).toContain("leading-relaxed");
    expect(COMPOSER_INLINE_SLASH_CHIP_CLASS_NAME).not.toContain("ring-");
    expect(COMPOSER_INLINE_SLASH_CHIP_CLASS_NAME).not.toContain("h-[1.41em]");
  });

  it("keeps a hinted chip as a tooltip trigger", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingSlashCommandChip
        command={{ name: "goal", hint: "objective" }}
        onRemove={vi.fn()}
      />,
    );

    expect(markup).toContain("goal");
    expect(markup).toContain('data-slot="tooltip-trigger"');
  });
});

describe("COMPOSER_INLINE_CHIP_LINE_STRUT_CLASS_NAME", () => {
  it("matches the composer first line box", () => {
    expect(COMPOSER_INLINE_CHIP_LINE_STRUT_CLASS_NAME).toContain("h-[1lh]");
    expect(COMPOSER_INLINE_CHIP_LINE_STRUT_CLASS_NAME).toContain("leading-relaxed");
    expect(COMPOSER_INLINE_CHIP_LINE_STRUT_CLASS_NAME).toContain("items-center");
    expect(COMPOSER_INLINE_CHIP_LINE_STRUT_CLASS_NAME).not.toContain(
      "bg-[var(--chat-composer-glass-surface,var(--card))]",
    );
    expect(COMPOSER_INLINE_CHIP_LINE_STRUT_CLASS_NAME).not.toContain("h-[1.41em]");
  });
});
