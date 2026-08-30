import type { ProviderUsageLimitWindow, UsagePercentDisplay } from "@t3tools/contracts";
import {
  clampRemainingPercent,
  formatUsagePercent,
  formatUsageResetLabel,
  usageFillPercent,
} from "@t3tools/shared/usageFormat";

export function ProviderUsageLimitBars(props: {
  readonly windows: ReadonlyArray<ProviderUsageLimitWindow>;
  readonly now?: Date;
  readonly percentDisplay?: UsagePercentDisplay;
}) {
  if (props.windows.length === 0) {
    return null;
  }
  const percentDisplay = props.percentDisplay ?? "left";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {props.windows.map((window) => {
        const resetLabel = formatUsageResetLabel(window.resetsAt, props.now);
        const remaining = clampRemainingPercent(window.remainingPercent);
        const fillPercent = usageFillPercent(window.remainingPercent, percentDisplay);
        const percentLabel = formatUsagePercent(window.remainingPercent, percentDisplay);
        const overloaded = remaining < 10;
        return (
          <div key={window.id} className="flex min-w-0 flex-col gap-0.5 text-[12px]">
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-16 shrink-0 truncate text-muted-foreground">{window.label}</span>
              <div
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={fillPercent}
                aria-label={`${window.label} ${percentLabel}`}
              >
                <div
                  className={`h-full rounded-full ${overloaded ? "bg-error" : "bg-primary"}`}
                  style={{ width: `${fillPercent}%` }}
                />
              </div>
              <span className="w-[4.75rem] shrink-0 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                {percentLabel}
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
