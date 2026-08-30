import type { ProviderUsageLimits, UsagePercentDisplay } from "@t3tools/contracts";
import { formatContextUsagePercent } from "@t3tools/shared/usageFormat";
import { Button } from "../ui/button";
import {
  contextWindowBreakdown,
  type ContextWindowSnapshot,
  formatContextWindowPercent,
  formatContextWindowTokens,
} from "~/lib/contextWindow";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { formatContextWindowCompactionMessage } from "./ContextWindowMeter.logic";
import { ProviderUsageLimitBars } from "../usage/ProviderUsageLimitBars";
import { Minimize2Icon } from "lucide-react";

export function ContextWindowMeter(props: {
  usage?: ContextWindowSnapshot | null;
  planUsageLimits?: ProviderUsageLimits | null;
  modelDisplayName?: string | null;
  onCompact?: (() => void) | undefined;
  compactDisabled?: boolean | undefined;
  compactDisabledReason?: string | null | undefined;
  percentDisplay?: UsagePercentDisplay;
}) {
  const {
    usage,
    planUsageLimits,
    modelDisplayName,
    onCompact,
    compactDisabled,
    compactDisabledReason,
    percentDisplay = "left",
  } = props;
  const usagePercentLabel =
    usage?.usedPercentage != null && Number.isFinite(usage.usedPercentage)
      ? formatContextUsagePercent(usage.usedPercentage, percentDisplay)
      : null;
  const normalizedPercentage = Math.max(0, Math.min(100, usage?.usedPercentage ?? 0));
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - normalizedPercentage / 100);
  const isOverloaded = normalizedPercentage > 90;
  const usageColor = isOverloaded
    ? "var(--color-error)"
    : "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)";

  const planWindows = planUsageLimits?.status === "available" ? planUsageLimits.windows : [];
  const hasPlanLimits = planWindows.length > 0;
  const breakdown = usage ? contextWindowBreakdown(usage) : { rows: [], barSegments: [] };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost-muted"
            className="size-7 rounded-full hover:text-muted-foreground data-pressed:text-muted-foreground"
            aria-label={
              usage && usage.maxTokens !== null && usagePercentLabel
                ? `Context window ${usagePercentLabel}`
                : usage
                  ? `Context window ${formatContextWindowTokens(usage.usedTokens)} tokens used`
                  : "Plan usage limits"
            }
          >
            <span className="relative flex size-5 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="-rotate-90 absolute inset-0 size-full transform-gpu mx-0!"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke="color-mix(in oklab, var(--color-muted-foreground) 24%, transparent)"
                  strokeWidth="3"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke={usageColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
                />
              </svg>
            </span>
          </Button>
        }
      />
      <PopoverPopup
        tooltipStyle={!hasPlanLimits}
        side="top"
        align="end"
        viewportClassName="p-0"
        className="w-[18.5rem] max-w-none text-left whitespace-normal"
      >
        <div className="flex flex-col gap-2 p-[var(--floating-content-inset)]">
          {usage ? (
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-muted-foreground text-xs">Context window</div>
              {usage.maxTokens !== null && usagePercentLabel ? (
                <div className="text-secondary-label text-[11px] tabular-nums">
                  <span>
                    {formatContextWindowTokens(usage.usedTokens)} /{" "}
                    {formatContextWindowTokens(usage.maxTokens)}
                  </span>
                  <span className="ml-1 text-muted-foreground">({usagePercentLabel})</span>
                </div>
              ) : (
                <div className="text-secondary-label text-[11px] tabular-nums">
                  {formatContextWindowTokens(usage.usedTokens)}
                </div>
              )}
            </div>
          ) : null}
          {usage && usage.maxTokens !== null ? (
            <div
              className="flex h-1.5 w-full overflow-hidden rounded-[2px] bg-muted-foreground/25"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(normalizedPercentage)}
              aria-label="Context window usage"
            >
              {breakdown.barSegments.length > 0 ? (
                breakdown.barSegments.map((segment) => (
                  <div
                    key={segment.id}
                    className="h-full min-w-px"
                    style={{
                      width: `${segment.percent}%`,
                      backgroundColor: segment.color,
                    }}
                  />
                ))
              ) : (
                <div
                  className="h-full rounded-[2px] transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${normalizedPercentage}%`, backgroundColor: usageColor }}
                />
              )}
            </div>
          ) : null}
          {breakdown.rows.length > 0 ? (
            <div className="flex flex-col gap-[5px]">
              {breakdown.rows.map((row) => {
                const percentLabel = formatContextWindowPercent(row.percent);
                return (
                  <div key={row.id} className="flex items-center gap-2 text-[11px] leading-4">
                    {row.color ? (
                      <span
                        className="size-[8px] shrink-0 rounded-[2px]"
                        style={{ backgroundColor: row.color }}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="size-[8px] shrink-0" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-foreground">{row.label}</span>
                    <span className="shrink-0 tabular-nums text-secondary-label">{row.value}</span>
                    <span className="w-[2.75rem] shrink-0 text-right tabular-nums text-muted-foreground">
                      {percentLabel ?? (row.id === "tools" || row.id === "processed" ? "—" : "")}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {usage?.compactsAutomatically ? (
            <div className="mt-1 text-pretty text-secondary-label text-[11px] font-medium">
              {formatContextWindowCompactionMessage(modelDisplayName, usage.autoCompactThreshold)}
            </div>
          ) : null}
          {hasPlanLimits ? (
            <div
              className={`flex flex-col gap-1.5 ${usage ? "border-border/70 border-t pt-2" : ""}`}
            >
              <div className="font-medium text-muted-foreground text-xs">
                {planUsageLimits?.planLabel
                  ? `Plan usage limits · ${planUsageLimits.planLabel}`
                  : "Plan usage limits"}
              </div>
              <ProviderUsageLimitBars windows={planWindows} percentDisplay={percentDisplay} />
            </div>
          ) : null}
          {onCompact ? (
            <>
              <Button
                size="xs"
                variant="outline"
                className="mt-1 w-full justify-center"
                disabled={compactDisabled}
                onClick={onCompact}
              >
                <Minimize2Icon aria-hidden="true" />
                Compact context
              </Button>
              {compactDisabled && compactDisabledReason ? (
                <div className="text-pretty text-secondary-label text-[11px]">
                  {compactDisabledReason}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
