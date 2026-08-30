import type { PerformanceBarFpsMode } from "@t3tools/contracts/settings";
import { ChevronDownIcon, HelpCircleIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";

import { APP_BASE_NAME, APP_STAGE_LABEL, APP_VERSION } from "../../branding";
import { cn } from "~/lib/utils";
import {
  toggleShowPerformanceBar,
  useClientSettings,
  useUpdateClientSettings,
} from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { PERFORMANCE_BAR_TONE_CLASS, patchPerformanceBarDom } from "./performanceBarDom";
import { applyPerformanceBarLayout } from "./performanceBarLayout";
import {
  derivePerformanceBarSnapshot,
  formatPerformanceBarFps,
  formatPerformanceBarHeap,
  formatPerformanceBarJank,
  formatPerformanceBarMs,
  PERFORMANCE_BAR_DELAY_HOT_MS,
  PERFORMANCE_BAR_DELAY_WARN_MS,
  PERFORMANCE_BAR_JANK_WARN_RATIO,
  PERFORMANCE_BAR_NUMBER_INTERVAL_MS,
  PERFORMANCE_BAR_SPARKLINE_HEIGHT,
  PERFORMANCE_BAR_SPARKLINE_WIDTH,
  performanceBarDelayTone,
  performanceBarFpsTone,
  performanceBarJankTone,
  type PerformanceBarSnapshot,
  readRendererHeapBytes,
  trimFrameTimes,
} from "./performanceBarMetrics";

const METRIC_HELP = [
  {
    label: "Delay",
    definition: `Duration of the latest animation frame. Turns amber at ${PERFORMANCE_BAR_DELAY_WARN_MS} ms and red at ${PERFORMANCE_BAR_DELAY_HOT_MS} ms.`,
  },
  {
    label: "FPS",
    definition:
      "Frames per second from the latest animation frame. Click to switch between bars and a scrolling wave.",
  },
  {
    label: "Jank",
    definition: `Share of frames slower than ${PERFORMANCE_BAR_DELAY_HOT_MS} ms in the last 500 ms. Turns red at ${Math.round(PERFORMANCE_BAR_JANK_WARN_RATIO * 100)}% or higher.`,
  },
  {
    label: "Heap",
    definition: "JavaScript heap used by this renderer.",
  },
] as const;

export function PerformanceBar() {
  const visible = useClientSettings((settings) => settings.showPerformanceBar);
  const fpsMode = useClientSettings((settings) => settings.performanceBarFpsMode);
  const updateClientSettings = useUpdateClientSettings();
  const [snapshot, setSnapshot] = useState<PerformanceBarSnapshot | null>(null);
  const toolbarRef = useRef<HTMLFooterElement>(null);
  const snapshotRef = useRef<PerformanceBarSnapshot | null>(null);
  const fpsModeRef = useRef(fpsMode);
  fpsModeRef.current = fpsMode;

  useLayoutEffect(() => {
    applyPerformanceBarLayout(document.documentElement, visible);
    return () => applyPerformanceBarLayout(document.documentElement, false);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      snapshotRef.current = null;
      setSnapshot(null);
      return;
    }
    let frameTimes: number[] = [];
    let raf = 0;
    let lastNumbersAt = Number.NEGATIVE_INFINITY;
    const tick = (now: number) => {
      frameTimes = trimFrameTimes([...frameTimes, now], now);
      const next = derivePerformanceBarSnapshot({
        frameTimes,
        now,
        heapBytes: readRendererHeapBytes(),
      });
      snapshotRef.current = next;
      const toolbar = toolbarRef.current;
      if (toolbar === null) {
        setSnapshot(next);
      } else {
        const numbers = now - lastNumbersAt >= PERFORMANCE_BAR_NUMBER_INTERVAL_MS;
        if (numbers) lastNumbersAt = now;
        patchPerformanceBarDom(toolbar, next, fpsModeRef.current, {
          numbers,
          sparkline: true,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  useLayoutEffect(() => {
    const live = snapshotRef.current;
    if (live === null || toolbarRef.current === null) return;
    patchPerformanceBarDom(toolbarRef.current, live, fpsMode);
  }, [fpsMode, snapshot]);

  if (!visible || snapshot === null) {
    return null;
  }

  return (
    <PerformanceBarView
      snapshot={snapshot}
      fpsMode={fpsMode}
      toolbarRef={toolbarRef}
      onCycleFpsMode={() =>
        updateClientSettings({
          performanceBarFpsMode: fpsMode === "bars" ? "wave" : "bars",
        })
      }
      onHide={toggleShowPerformanceBar}
    />
  );
}

export function PerformanceBarView(props: {
  readonly snapshot: PerformanceBarSnapshot;
  readonly fpsMode: PerformanceBarFpsMode;
  readonly toolbarRef?: Ref<HTMLFooterElement>;
  readonly onCycleFpsMode: () => void;
  readonly onHide: () => void;
}) {
  const { snapshot, fpsMode, toolbarRef, onCycleFpsMode, onHide } = props;
  const delayTone = performanceBarDelayTone(snapshot.delayMs);
  const fpsTone = performanceBarFpsTone(snapshot.fps);
  const jankTone = performanceBarJankTone(snapshot.jankRatio);
  const stage = APP_STAGE_LABEL.trim().toLowerCase();

  return (
    <footer
      ref={toolbarRef}
      data-component="t3-dev-performance-toolbar"
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-[80] flex h-(--dev-performance-bar-height) items-center gap-3 border-t border-border/70 bg-background/95 px-3 font-mono text-[11px] leading-none text-muted-foreground"
    >
      <span data-performance-toolbar-brand="" className="min-w-0 truncate text-muted-foreground">
        {APP_BASE_NAME} {APP_VERSION}
        {stage ? ` (${stage})` : ""}
      </span>
      <div
        data-component="t3-dev-performance-toolbar-metrics"
        className="ml-auto flex min-w-0 items-center gap-3.5"
      >
        <Metric
          name="delay"
          label="Delay"
          value={formatPerformanceBarMs(snapshot.delayMs)}
          tone={delayTone}
        />
        <button
          type="button"
          data-performance-fps-toggle=""
          className="flex items-center gap-2 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`FPS ${formatPerformanceBarFps(snapshot.fps)}. Switch indicator.`}
          onClick={onCycleFpsMode}
        >
          <canvas
            data-performance-sparkline=""
            data-fps-mode={fpsMode}
            width={PERFORMANCE_BAR_SPARKLINE_WIDTH}
            height={PERFORMANCE_BAR_SPARKLINE_HEIGHT}
            className="block"
            style={{
              width: PERFORMANCE_BAR_SPARKLINE_WIDTH,
              height: PERFORMANCE_BAR_SPARKLINE_HEIGHT,
            }}
            aria-hidden
          />
          <span className="text-muted-foreground">FPS</span>
          <span
            data-performance-metric="fps"
            className={cn("min-w-[3ch] tabular-nums", PERFORMANCE_BAR_TONE_CLASS[fpsTone])}
          >
            {formatPerformanceBarFps(snapshot.fps)}
          </span>
        </button>
        <Metric
          name="jank"
          label="Jank"
          value={formatPerformanceBarJank(snapshot.jankRatio)}
          tone={jankTone}
        />
        {snapshot.heapBytes !== null ? (
          <Metric
            name="heap"
            label="Heap"
            value={formatPerformanceBarHeap(snapshot.heapBytes)}
            tone="good"
          />
        ) : null}
      </div>
      <div className="flex items-center gap-0.5">
        <Popover>
          <PopoverTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="What do these metrics mean?"
                className="size-6 text-muted-foreground"
              >
                <HelpCircleIcon className="size-3.5" />
              </Button>
            }
          />
          <PopoverPopup side="top" align="end" className="w-72 p-3 text-xs">
            <ul className="space-y-2">
              {METRIC_HELP.map((item) => (
                <li key={item.label}>
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-muted-foreground">{item.definition}</p>
                </li>
              ))}
            </ul>
          </PopoverPopup>
        </Popover>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Hide performance bar"
          className="size-6 text-muted-foreground"
          onClick={onHide}
        >
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </div>
    </footer>
  );
}

function Metric(props: {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly tone: keyof typeof PERFORMANCE_BAR_TONE_CLASS;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span>{props.label}</span>
      <span
        data-performance-metric={props.name}
        className={cn("tabular-nums", PERFORMANCE_BAR_TONE_CLASS[props.tone])}
      >
        {props.value}
      </span>
    </span>
  );
}
