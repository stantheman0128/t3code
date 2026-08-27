import { beforeEach, describe, expect, it } from "vite-plus/test";

import { usePromptQueueStore } from "./promptQueueStore";

describe("promptQueueStore", () => {
  beforeEach(() => {
    usePromptQueueStore.setState({ byThreadKey: {} });
  });

  it("enqueues then dequeues in FIFO order", () => {
    usePromptQueueStore.getState().enqueue("thread-a", { prompt: "first" });
    usePromptQueueStore.getState().enqueue("thread-a", { prompt: "second" });

    expect(usePromptQueueStore.getState().dequeue("thread-a")?.prompt).toBe("first");
    expect(usePromptQueueStore.getState().dequeue("thread-a")?.prompt).toBe("second");
    expect(usePromptQueueStore.getState().dequeue("thread-a")).toBeUndefined();
  });

  it("keeps queued images with the prompt", () => {
    const file = new File(["photo"], "shot.png", { type: "image/png" });
    usePromptQueueStore.getState().enqueue("thread-a", {
      prompt: "look at this",
      images: [
        {
          id: "img-1",
          name: "shot.png",
          previewUrl: "blob:queued",
          mimeType: "image/png",
          sizeBytes: 4,
          file,
        },
      ],
    });

    expect(usePromptQueueStore.getState().dequeue("thread-a")).toMatchObject({
      prompt: "look at this",
      images: [{ id: "img-1", name: "shot.png" }],
    });
  });

  it("keeps queues isolated per thread", () => {
    usePromptQueueStore.getState().enqueue("thread-a", { prompt: "alpha" });
    usePromptQueueStore.getState().enqueue("thread-b", { prompt: "beta" });

    expect(usePromptQueueStore.getState().dequeue("thread-b")?.prompt).toBe("beta");
    expect(usePromptQueueStore.getState().byThreadKey["thread-a"]?.[0]?.prompt).toBe("alpha");
  });
});
