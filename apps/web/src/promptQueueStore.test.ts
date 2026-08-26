import { beforeEach, describe, expect, it } from "vite-plus/test";

import { usePromptQueueStore } from "./promptQueueStore";

describe("promptQueueStore", () => {
  beforeEach(() => {
    usePromptQueueStore.setState({ byThreadKey: {} });
  });

  it("enqueues then dequeues in FIFO order", () => {
    usePromptQueueStore.getState().enqueue("thread-a", "first");
    usePromptQueueStore.getState().enqueue("thread-a", "second");

    expect(usePromptQueueStore.getState().dequeue("thread-a")?.prompt).toBe("first");
    expect(usePromptQueueStore.getState().dequeue("thread-a")?.prompt).toBe("second");
    expect(usePromptQueueStore.getState().dequeue("thread-a")).toBeUndefined();
  });

  it("keeps queues isolated per thread", () => {
    usePromptQueueStore.getState().enqueue("thread-a", "alpha");
    usePromptQueueStore.getState().enqueue("thread-b", "beta");

    expect(usePromptQueueStore.getState().dequeue("thread-b")?.prompt).toBe("beta");
    expect(usePromptQueueStore.getState().byThreadKey["thread-a"]?.[0]?.prompt).toBe("alpha");
  });
});
