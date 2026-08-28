import type { PerformanceBarFpsMode } from "@t3tools/contracts/settings";
import { ActivityIcon, ChevronDownIcon, HelpCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import {
  toggleShowPerformanceBar,
  useClientSettings,
  useUpdateClientSettings,
} from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import {
  derivePerformanceBarSnapshot,
  formatPerformanceBarFps,
  formatPerformanceBarHeap,
  formatPerformanceBarJank,
  formatPerformanceBarMs,
  isPerformanceBarDelayHot,
  isPerformanceBarJankHot,
  PERFORMANCE_BAR_DELAY_WARN_MS,
  PERFORMANCE_BAR_JANK_WARN_RATIO,
  type PerformanceBarSnapshot,
  readRendererHeapBytes,
  trimFrameTimes,
} from "./performanceBarMetrics";

const METRIC_HELP = [
  {
    label: "Delay",
    definition: `Longest gap between frames in the last 500 ms. Flashes red at ${PERFORMANCE_BAR_DELAY_WARN_MS} ms or higher.`,
  },
  {
    label: "FPS",
    definition:
      "Renderer frames per second over the last 500 ms. Click to switch between bars and a scrolling wave.",
  },
  {
    label: "Jank",
    definition: `Share of frames slower than ${PERFORMANCE_BAR_DELAY_WARN_MS} ms. Turns red at ${Math.round(PERFORMANCE_BAR_JANK_WARN_RATIO * 100)}% or higher.`,
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

  useEffect(() => {
    if (!visible) {
      setSnapshot(null);
      return;
    }
    let frameTimes: number[] = [];
    let raf = 0;
    const tick = (now: number) => {
      frameTimes = trimFrameTimes([...frameTimes, now], now);
      setSnapshot(
        derivePerformanceBarSnapshot({
          frameTimes,
          now,
          heapBytes: readRendererHeapBytes(),
        }),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible || snapshot === null) {
    return null;
  }

  return (
    <PerformanceBarView
      snapshot={snapshot}
      fpsMode={fpsMode}
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
  readonly onCycleFpsMode: () => void;
  readonly onHide: () => void;
}) {
  const { snapshot, fpsMode, onCycleFpsMode, onHide } = props;
  const delayHot = isPerformanceBarDelayHot(snapshot.delayMs);
  const jankHot = isPerformanceBarJankHot(snapshot.jankRatio);

  return (
    <footer
      data-component="t3-dev-performance-toolbar"
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-[80] flex h-7 items-center gap-3 border-t border-border/70 bg-background/92 px-3 font-mono text-[11px] leading-none text-muted-foreground backdrop-blur-sm"
    >
      <span className="flex items-center gap-1.5 text-foreground">
        <ActivityIcon className="size-3.5" aria-hidden />
        Perf
      </span>
      <div
        data-component="t3-dev-performance-toolbar-metrics"
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <Metric label="Delay" value={formatPerformanceBarMs(snapshot.delayMs)} hot={delayHot} />
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`FPS ${formatPerformanceBarFps(snapshot.fps)}. Switch indicator.`}
          onClick={onCycleFpsMode}
        >
          <span className="text-muted-foreground">FPS</span>
          <span className="tabular-nums text-foreground">
            {formatPerformanceBarFps(snapshot.fps)}
          </span>
          <FpsSparkline gapsMs={snapshot.sparklineGapsMs} mode={fpsMode} hot={delayHot} />
        </button>
        <Metric label="Jank" value={formatPerformanceBarJank(snapshot.jankRatio)} hot={jankHot} />
        {snapshot.heapBytes !== null ? (
          <Metric label="Heap" value={formatPerformanceBarHeap(snapshot.heapBytes)} />
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

function Metric(props: { readonly label: string; readonly value: string; readonly hot?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span>{props.label}</span>
      <span className={cn("tabular-nums", props.hot ? "text-destructive" : "text-foreground")}>
        {props.value}
      </span>
    </span>
  );
}

function FpsSparkline(props: {
  readonly gapsMs: ReadonlyArray<number>;
  readonly mode: PerformanceBarFpsMode;
  readonly hot: boolean;
}) {
  const { gapsMs, mode, hot } = props;
  const max = Math.max(PERFORMANCE_BAR_DELAY_WARN_MS, ...gapsMs, 1);
  if (mode === "wave") {
    const points = gapsMs
      .map((gap, index) => {
        const x = gapsMs.length <= 1 ? 0 : (index / (gapsMs.length - 1)) * 36;
        const y = 10 - (Math.min(gap, max) / max) * 10;
        return `${x},${y}`;
      })
      .join(" ");
    return (
      <svg
        aria-hidden
        viewBox="0 0 36 10"
        className={cn("h-2.5 w-9", hot ? "text-destructive" : "text-foreground")}
      >
        <polyline fill="none" stroke="currentColor" strokeWidth="1.2" points={points} />
      </svg>
    );
  }
  return (
    <span aria-hidden className="flex h-2.5 w-9 items-end gap-px">
      {gapsMs.map((gap, index) => (
        <span
          key={index}
          className={cn(
            "min-h-px flex-1 rounded-[1px]",
            gap >= PERFORMANCE_BAR_DELAY_WARN_MS ? "bg-destructive" : "bg-foreground/70",
          )}
          style={{ height: `${Math.max(12, (Math.min(gap, max) / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}
