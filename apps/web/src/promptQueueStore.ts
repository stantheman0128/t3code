import { create } from "zustand";

export interface PromptQueueImage {
  readonly id: string;
  readonly name: string;
  readonly previewUrl: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly file: File;
}

export interface PromptQueueItem {
  readonly id: string;
  readonly prompt: string;
  readonly images: readonly PromptQueueImage[];
}

export interface PromptQueueEnqueueInput {
  readonly prompt: string;
  readonly images?: readonly PromptQueueImage[];
}

interface PromptQueueState {
  readonly byThreadKey: Readonly<Record<string, readonly PromptQueueItem[]>>;
  enqueue: (threadKey: string, input: PromptQueueEnqueueInput) => PromptQueueItem;
  remove: (threadKey: string, id: string) => void;
  dequeue: (threadKey: string) => PromptQueueItem | undefined;
}

const EMPTY_QUEUE: readonly PromptQueueItem[] = [];

export const usePromptQueueStore = create<PromptQueueState>((set, get) => ({
  byThreadKey: {},
  enqueue: (threadKey, input) => {
    const item: PromptQueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      prompt: input.prompt,
      images: input.images ? [...input.images] : [],
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
