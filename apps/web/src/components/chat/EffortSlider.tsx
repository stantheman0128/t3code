import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ProviderDriverKind, ProviderOptionDescriptor } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { effortProgress, effortStopIndexFromClientX } from "./effortControlStyle";

type EffortOption = Extract<ProviderOptionDescriptor, { type: "select" }>["options"][number];

/**
 * Discrete effort slider.
 * Codex uses an OpenAI-green fill with a sheen and a thumb that pulses on settle.
 * Claude uses the same motion with the coral already used for its fast bolt.
 * The thumb eases with a fast-out curve and tracks the pointer 1:1 while dragging.
 */
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
      style={{ ["--effort-progress" as string]: String(progress) }}
    >
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
          "effort-slider-track relative h-7 cursor-pointer touch-none outline-none",
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
        <span className="effort-slider-fill" />
        {options.map((option, optionIndex) => (
          <span
            key={option.id}
            className="effort-slider-tick"
            data-active={optionIndex === index ? "true" : "false"}
            style={{
              left: `${effortProgress(optionIndex, options.length) * 100}%`,
            }}
          />
        ))}
        <span className="effort-slider-thumb" />
      </div>
      <div
        className="mt-1 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option, optionIndex) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            title={option.label}
            className="effort-slider-label truncate"
            data-active={optionIndex === index ? "true" : "false"}
            onClick={() => selectIndex(optionIndex)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
