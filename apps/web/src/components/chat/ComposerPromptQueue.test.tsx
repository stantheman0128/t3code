import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ComposerPromptQueue } from "./ComposerPromptQueue";
import type { PromptQueueItem } from "../../promptQueueStore";

function queueItem(id: string, prompt: string, imageNames: string[] = []): PromptQueueItem {
  return {
    id,
    prompt,
    images: imageNames.map((name, index) => ({
      id: `${id}-img-${index}`,
      name,
      previewUrl: `blob:${name}`,
      mimeType: "image/png",
      sizeBytes: 12,
      file: new File(["x"], name, { type: "image/png" }),
    })),
  };
}

describe("ComposerPromptQueue", () => {
  it("renders queued follow-ups as separate cards above the composer", () => {
    const markup = renderToStaticMarkup(
      <ComposerPromptQueue
        items={[
          queueItem("q1", "look at the screenshot", ["shot.png", "other.png"]),
          queueItem("q2", "then ship it"),
        ]}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        onExpandImage={vi.fn()}
      />,
    );

    expect(markup).toContain('data-composer-prompt-queue="true"');
    expect(markup).toContain("Queued · sends after this turn");
    expect(markup).toContain("look at the screenshot");
    expect(markup).toContain("then ship it");
    expect(markup).toContain("shot.png");
    expect(markup).toContain("blob:shot.png");
    expect(markup).toContain("line-clamp-3");
    expect(markup).toContain("chat-composer-drawer-attached");
    expect(markup).toContain("bg-[var(--chat-composer-glass-surface,var(--card))]");
    expect(markup).not.toContain("chat-composer-drawer-surface");
    expect(markup).toContain("Preview shot.png");
    expect(markup).toContain("max-h-40");
    expect(markup).toContain("relative z-0");
    expect(markup).not.toContain("relative z-10");
  });

  it("expands a queued follow-up for full-text edit with photo add and remove", () => {
    const markup = renderToStaticMarkup(
      <ComposerPromptQueue
        items={[queueItem("q1", "look at the screenshot\nand keep going", ["shot.png"])]}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        onExpandImage={vi.fn()}
        initialEditingId="q1"
      />,
    );

    expect(markup).toContain('data-editing="true"');
    expect(markup).toContain("look at the screenshot");
    expect(markup).toContain("and keep going");
    expect(markup).toContain("Add photos");
    expect(markup).toContain("Remove shot.png");
    expect(markup).toContain('accept="image/*"');
    expect(markup).not.toContain("Cancel");
    expect(markup).not.toContain(">Save</");
    expect(markup).toContain("max-h-[min(28rem,70vh)]");
  });

  it("keeps a photo-only follow-up visible", () => {
    const markup = renderToStaticMarkup(
      <ComposerPromptQueue
        items={[queueItem("q1", "", ["hero.png"])]}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        onExpandImage={vi.fn()}
      />,
    );

    expect(markup).toContain("hero.png");
    expect(markup).toContain("Photo follow-up");
    expect(markup).toContain("Preview hero.png");
  });

  it("keeps a long queued prompt to three lines until edit", () => {
    const longPrompt = Array.from(
      { length: 12 },
      (_, index) => `Line ${index + 1} of a long follow-up`,
    ).join("\n");
    const markup = renderToStaticMarkup(
      <ComposerPromptQueue
        items={[queueItem("q1", longPrompt)]}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        onExpandImage={vi.fn()}
      />,
    );

    expect(markup).toContain("Line 1 of a long follow-up");
    expect(markup).toContain("line-clamp-3");
    expect(markup).not.toContain("max-h-40 min-h-16");
    expect(markup).toContain('data-editing="false"');
  });
});
