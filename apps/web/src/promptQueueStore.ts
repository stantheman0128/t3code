import { create } from "zustand";

export interface PromptQueueItem {
  readonly id: string;
  readonly prompt: string;
}

interface PromptQueueState {
  readonly byThreadKey: Readonly<Record<string, readonly PromptQueueItem[]>>;
  enqueue: (threadKey: string, prompt: string) => PromptQueueItem;
  remove: (threadKey: string, id: string) => void;
  dequeue: (threadKey: string) => PromptQueueItem | undefined;
}

const EMPTY_QUEUE: readonly PromptQueueItem[] = [];

export const usePromptQueueStore = create<PromptQueueState>((set, get) => ({
  byThreadKey: {},
  enqueue: (threadKey, prompt) => {
    const item: PromptQueueItem = {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      prompt,
    };
    set((state) => ({
      byThreadKey: {
        ...state.byThreadKey,
        [threadKey]: [...(state.byThreadKey[threadKey] ?? EMPTY_QUEUE), item],
      },
    }));
    return item;
  },
  remove: (threadKey, id) => {
    set((state) => {
      const current = state.byThreadKey[threadKey] ?? EMPTY_QUEUE;
      const next = current.filter((item) => item.id !== id);
      if (next.length === current.length) {
        return state;
      }
      const byThreadKey = { ...state.byThreadKey };
      if (next.length === 0) {
        delete byThreadKey[threadKey];
      } else {
        byThreadKey[threadKey] = next;
      }
      return { byThreadKey };
    });
  },
  dequeue: (threadKey) => {
    const current = get().byThreadKey[threadKey] ?? EMPTY_QUEUE;
    const [first, ...rest] = current;
    if (!first) {
      return undefined;
    }
    set((state) => {
      const byThreadKey = { ...state.byThreadKey };
      if (rest.length === 0) {
        delete byThreadKey[threadKey];
      } else {
        byThreadKey[threadKey] = rest;
      }
      return { byThreadKey };
    });
    return first;
  },
}));

export function selectPromptQueue(threadKey: string) {
  return (state: PromptQueueState) => state.byThreadKey[threadKey] ?? EMPTY_QUEUE;
}
