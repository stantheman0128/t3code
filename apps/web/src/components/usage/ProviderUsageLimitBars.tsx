import type { ProviderUsageLimitWindow } from "@t3tools/contracts";
import {
  clampRemainingPercent,
  formatUsageLeftPercent,
  formatUsageResetLabel,
} from "@t3tools/shared/usageFormat";

export function ProviderUsageLimitBars(props: {
  readonly windows: ReadonlyArray<ProviderUsageLimitWindow>;
  readonly now?: Date;
}) {
  if (props.windows.length === 0) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {props.windows.map((window) => {
        const resetLabel = formatUsageResetLabel(window.resetsAt, props.now);
        const leftPercent = clampRemainingPercent(window.remainingPercent);
        const leftLabel = formatUsageLeftPercent(window.remainingPercent);
        const overloaded = leftPercent < 10;
        return (
          <div key={window.id} className="flex min-w-0 flex-col gap-0.5 text-[12px]">
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-16 shrink-0 truncate text-muted-foreground">{window.label}</span>
              <div
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={leftPercent}
                aria-label={`${window.label} ${leftLabel}`}
              >
                <div
                  className={`h-full rounded-full ${overloaded ? "bg-error" : "bg-primary"}`}
                  style={{ width: `${leftPercent}%` }}
                />
              </div>
              <span className="w-[4.75rem] shrink-0 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                {leftLabel}
              </span>
            </div>
            {resetLabel ? (
              <span className="pl-[4.5rem] text-[11px] leading-4 text-muted-foreground/80">
                {resetLabel}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
