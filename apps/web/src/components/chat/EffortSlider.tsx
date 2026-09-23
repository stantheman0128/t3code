import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ProviderDriverKind, ProviderOptionDescriptor } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { effortProgress, effortStopIndexFromClientX } from "./effortControlStyle";

type EffortOption = Extract<ProviderOptionDescriptor, { type: "select" }>["options"][number];

/**
 * Discrete effort capsule.
 * The track is the thick blue-to-purple pill from the Codex and ChatGPT composer,
 * with the current level named above it. Dragging tracks the pointer. A settle pops the thumb.
 */

const EFFORT_SPARKS = [
  { left: "16%", top: "32%", delay: "0s" },
  { left: "34%", top: "64%", delay: "0.35s" },
  { left: "48%", top: "28%", delay: "0.7s" },
  { left: "63%", top: "60%", delay: "0.15s" },
  { left: "78%", top: "34%", delay: "1s" },
  { left: "90%", top: "58%", delay: "0.55s" },
] as const;
export function EffortSlider({
  provider,
  options,
  value,
  disabled = false,
  onValueChange,
}: {
  provider: ProviderDriverKind;
  options: ReadonlyArray<EffortOption>;
  value: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const settleTimerRef = useRef<number | null>(null);
  const selectedIndex = options.findIndex((option) => option.id === value);
  const index = selectedIndex >= 0 ? selectedIndex : 0;
  const progress = effortProgress(index, options.length);
  const selected = options[index];
  const labelColor = `color-mix(in oklab, #93c5fd ${Math.round((1 - progress) * 100)}%, #d8b4fe)`;

  useEffect(() => {
    return () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  const selectIndex = (nextIndex: number) => {
    const option = options[nextIndex];
    if (!option || option.id === value || disabled) return;
    onValueChange(option.id);
    setSettling(true);
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => setSettling(false), 420);
  };

  const selectFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    selectIndex(
      effortStopIndexFromClientX({
        clientX,
        left: rect.left,
        width: rect.width,
        count: options.length,
      }),
    );
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    selectFromClientX(event.clientX);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled) return;
    selectFromClientX(event.clientX);
  };

  const stopDragging = () => setDragging(false);

  return (
    <div
      className="effort-slider px-2 pt-1 pb-2"
      data-effort-slider="true"
      data-effort-provider={provider}
      data-dragging={dragging ? "true" : "false"}
      data-settling={settling ? "true" : "false"}
      style={{
        ["--effort-progress" as string]: String(progress),
        ["--effort-label" as string]: labelColor,
      }}
    >
      <p className="effort-slider-heading">{selected?.label ?? value}</p>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Reasoning effort"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, options.length - 1)}
        aria-valuenow={index}
        aria-valuetext={selected?.label ?? value}
        aria-disabled={disabled || undefined}
        className={cn(
          "effort-slider-track relative h-11 cursor-pointer touch-none outline-none",
          disabled && "cursor-default opacity-50",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={(event) => {
          if (disabled) return;
          const last = options.length - 1;
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            selectIndex(Math.min(last, index + 1));
          } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            selectIndex(Math.max(0, index - 1));
          } else if (event.key === "Home") {
            event.preventDefault();
            selectIndex(0);
          } else if (event.key === "End") {
            event.preventDefault();
            selectIndex(last);
          }
        }}
      >
        <span className="effort-slider-rail" />
        <span className="effort-slider-fill">
          {EFFORT_SPARKS.map((spark) => (
            <span
              key={`${spark.left}-${spark.top}`}
              className="effort-slider-spark"
              style={{ left: spark.left, top: spark.top, animationDelay: spark.delay }}
            />
          ))}
        </span>
        {options.map((option, optionIndex) => (
          <span
            key={option.id}
            className="effort-slider-tick"
            data-filled={optionIndex <= index ? "true" : "false"}
            style={{ ["--tick" as string]: String(effortProgress(optionIndex, options.length)) }}
          />
        ))}
        <span className="effort-slider-thumb" />
      </div>
    </div>
  );
}
