export const PERFORMANCE_BAR_DOCUMENT_DATASET_KEY = "performanceBar";

export function applyPerformanceBarLayout(root: HTMLElement, visible: boolean): void {
  if (visible) {
    root.dataset[PERFORMANCE_BAR_DOCUMENT_DATASET_KEY] = "true";
    return;
  }

  delete root.dataset[PERFORMANCE_BAR_DOCUMENT_DATASET_KEY];
}
