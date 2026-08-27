import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ComposerPromptQueue } from "./ComposerPromptQueue";

describe("ComposerPromptQueue", () => {
  it("renders a compact chip instead of a full-width queued input", () => {
    const markup = renderToStaticMarkup(
      <ComposerPromptQueue
        items={[{ id: "q1", prompt: "follow up after this turn finishes" }]}
        onRemove={vi.fn()}
      />,
    );

    expect(markup).toContain('data-composer-prompt-queue="true"');
    expect(markup).toContain("Queued");
    expect(markup).toContain("follow up after this turn finishes");
    expect(markup).toContain("w-fit max-w-full");
    expect(markup).not.toContain("rounded-full");
  });

  it("numbers multiple queued prompts", () => {
    const markup = renderToStaticMarkup(
      <ComposerPromptQueue
        items={[
          { id: "q1", prompt: "first" },
          { id: "q2", prompt: "second" },
        ]}
        onRemove={vi.fn()}
      />,
    );

    expect(markup).toContain("Queue 1");
    expect(markup).toContain("Queue 2");
  });
});
