import {
  DEFAULT_PERFORMANCE_BAR_HEIGHT_PX,
  MAX_PERFORMANCE_BAR_HEIGHT_PX,
  MIN_PERFORMANCE_BAR_HEIGHT_PX,
} from "@t3tools/contracts/settings";

export const PERFORMANCE_BAR_DOCUMENT_DATASET_KEY = "performanceBar";
export const PERFORMANCE_BAR_HEIGHT_CSS_VAR = "--dev-performance-bar-height";

export function clampPerformanceBarHeightPx(heightPx: number): number {
  if (!Number.isFinite(heightPx)) {
    return DEFAULT_PERFORMANCE_BAR_HEIGHT_PX;
  }
  return Math.min(
    MAX_PERFORMANCE_BAR_HEIGHT_PX,
    Math.max(MIN_PERFORMANCE_BAR_HEIGHT_PX, Math.round(heightPx)),
  );
}

export function applyPerformanceBarLayout(
  root: HTMLElement,
  visible: boolean,
  heightPx: number = DEFAULT_PERFORMANCE_BAR_HEIGHT_PX,
): void {
  if (visible) {
    root.dataset[PERFORMANCE_BAR_DOCUMENT_DATASET_KEY] = "true";
    root.style.setProperty(
      PERFORMANCE_BAR_HEIGHT_CSS_VAR,
      `${clampPerformanceBarHeightPx(heightPx)}px`,
    );
    return;
  }

  delete root.dataset[PERFORMANCE_BAR_DOCUMENT_DATASET_KEY];
  root.style.removeProperty(PERFORMANCE_BAR_HEIGHT_CSS_VAR);
}
