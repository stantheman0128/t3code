import type { PerformanceBarFpsMode } from "@t3tools/contracts/settings";

import {
  formatPerformanceBarFps,
  formatPerformanceBarHeap,
  formatPerformanceBarJank,
  formatPerformanceBarMs,
  mapSparklinePoints,
  PERFORMANCE_BAR_SPARKLINE_HEIGHT,
  PERFORMANCE_BAR_SPARKLINE_WIDTH,
  performanceBarDelayTone,
  performanceBarFpsTone,
  performanceBarJankTone,
  type PerformanceBarSnapshot,
  type PerformanceBarTone,
} from "./performanceBarMetrics";

export const PERFORMANCE_BAR_TONE_CLASS: Record<PerformanceBarTone, string> = {
  good: "text-foreground",
  warn: "text-amber-400",
  bad: "text-red-400",
};

const TONE_CLASSES = Object.values(PERFORMANCE_BAR_TONE_CLASS);
const SPARKLINE_FILL: Record<PerformanceBarTone, string> = {
  good: "rgb(52 211 153)",
  warn: "rgb(251 191 36)",
  bad: "rgb(248 113 113)",
};

export function applyPerformanceBarTone(element: Element, tone: PerformanceBarTone): void {
  for (const className of TONE_CLASSES) {
    element.classList.remove(className);
  }
  element.classList.add(PERFORMANCE_BAR_TONE_CLASS[tone]);
}

export function patchPerformanceBarDom(
  root: HTMLElement,
  snapshot: PerformanceBarSnapshot,
  fpsMode: PerformanceBarFpsMode,
  parts: { readonly numbers?: boolean; readonly sparkline?: boolean } = {},
): void {
  const patchNumbers = parts.numbers ?? true;
  const patchSparkline = parts.sparkline ?? true;
  const fpsTone = performanceBarFpsTone(snapshot.fps);

  if (patchNumbers) {
    patchMetric(
      root,
      "delay",
      formatPerformanceBarMs(snapshot.delayMs),
      performanceBarDelayTone(snapshot.delayMs),
    );
    patchMetric(root, "fps", formatPerformanceBarFps(snapshot.fps), fpsTone);
    patchMetric(
      root,
      "jank",
      formatPerformanceBarJank(snapshot.jankRatio),
      performanceBarJankTone(snapshot.jankRatio),
    );
    if (snapshot.heapBytes !== null) {
      patchMetric(root, "heap", formatPerformanceBarHeap(snapshot.heapBytes), "good");
    }
    const fpsButton = root.querySelector("[data-performance-fps-toggle]");
    if (fpsButton instanceof HTMLElement) {
      fpsButton.setAttribute(
        "aria-label",
        `FPS ${formatPerformanceBarFps(snapshot.fps)}. Switch indicator.`,
      );
    }
  }

  if (patchSparkline) {
    const canvas = root.querySelector("[data-performance-sparkline]");
    if (canvas instanceof HTMLCanvasElement) {
      drawPerformanceBarSparkline(canvas, snapshot.sparklineFps, fpsMode, fpsTone);
    }
  }
}

export function drawPerformanceBarSparkline(
  canvas: HTMLCanvasElement,
  fpsSamples: ReadonlyArray<number>,
  mode: PerformanceBarFpsMode,
  tone: PerformanceBarTone,
): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const cssWidth = PERFORMANCE_BAR_SPARKLINE_WIDTH;
  const cssHeight = PERFORMANCE_BAR_SPARKLINE_HEIGHT;
  const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
  const pixelWidth = Math.round(cssWidth * dpr);
  const pixelHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  if (fpsSamples.length === 0) return;

  const color = SPARKLINE_FILL[tone];
  if (mode === "wave") {
    const points = mapSparklinePoints(fpsSamples, cssWidth, cssHeight);
    const first = points[0];
    if (!first) return;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index]!;
      context.lineTo(point.x, point.y);
    }
    context.strokeStyle = color;
    context.lineWidth = 1.6;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
    return;
  }

  const range = mapSparklinePoints(fpsSamples, cssWidth, cssHeight);
  const barGap = 1;
  const barWidth = Math.max(1, cssWidth / fpsSamples.length - barGap);
  context.fillStyle = color;
  for (let index = 0; index < range.length; index += 1) {
    const point = range[index]!;
    const height = Math.max(1, cssHeight - point.y);
    context.fillRect(index * (barWidth + barGap), cssHeight - height, barWidth, height);
  }
}

function patchMetric(
  root: HTMLElement,
  name: string,
  value: string,
  tone: PerformanceBarTone,
): void {
  const element = root.querySelector(`[data-performance-metric="${name}"]`);
  if (!(element instanceof HTMLElement)) return;
  if (element.textContent !== value) {
    element.textContent = value;
  }
  applyPerformanceBarTone(element, tone);
}
