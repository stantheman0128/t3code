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
  it("summarizes the next item and photo count when collapsed", () => {
    const markup = renderToStaticMarkup(
      <ComposerPromptQueue
        items={[
          queueItem("q1", "look at the screenshot", ["shot.png", "other.png"]),
          queueItem("q2", "then ship it"),
        ]}
        onRemove={vi.fn()}
      />,
    );

    expect(markup).toContain('data-composer-prompt-queue="true"');
    expect(markup).toContain("Queue 2");
    expect(markup).toContain("look at the screenshot");
    expect(markup).toContain("shot.png");
    expect(markup).toContain("blob:shot.png");
    expect(markup).toContain("max-h-56 overflow-y-auto");
  });

  it("keeps a photo-only follow-up visible", () => {
    const markup = renderToStaticMarkup(
      <ComposerPromptQueue items={[queueItem("q1", "", ["hero.png"])]} onRemove={vi.fn()} />,
    );

    expect(markup).toContain("hero.png");
    expect(markup).toContain("Photo follow-up");
  });
});
