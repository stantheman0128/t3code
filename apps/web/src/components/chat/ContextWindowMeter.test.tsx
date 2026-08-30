import { EventId, TurnId } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { deriveLatestContextWindowSnapshot } from "~/lib/contextWindow";
import { ContextWindowMeter } from "./ContextWindowMeter";

vi.mock("../ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverPopup: ({ children }: { children: ReactNode }) => children,
  PopoverTrigger: ({ render }: { render: ReactNode }) => <div>{render}</div>,
}));

const usage = deriveLatestContextWindowSnapshot([
  {
    id: EventId.make("activity-1"),
    tone: "info",
    kind: "context-window.updated",
    summary: "Context updated",
    payload: { usedTokens: 100_000, maxTokens: 1_000_000 },
    turnId: TurnId.make("turn-1"),
    createdAt: "2026-08-24T12:00:00.000Z",
  },
]);

if (!usage) {
  throw new Error("The context window test fixture did not produce a snapshot.");
}

describe("ContextWindowMeter", () => {
  it("opens on click and keeps the compact action in the popover", () => {
    const markup = renderToStaticMarkup(<ContextWindowMeter usage={usage} onCompact={() => {}} />);

    expect(markup).toContain("Compact context");
    expect(markup).not.toContain("openOnHover");
  });

  it("shows plan usage limits next to the context window", () => {
    const markup = renderToStaticMarkup(
      <ContextWindowMeter
        usage={usage}
        planUsageLimits={{
          status: "available",
          planLabel: "ChatGPT Plus",
          windows: [
            {
              id: "primary",
              label: "5h",
              remainingPercent: 58,
              resetsAt: "2026-08-28T15:00:00.000Z",
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("ChatGPT Plus limits");
    expect(markup).toContain("5h");
    expect(markup).toContain("10% used");
    expect(markup).toContain("58% left");
  });

  it("explains why the compact action is disabled", () => {
    const markup = renderToStaticMarkup(
      <ContextWindowMeter
        usage={usage}
        onCompact={() => {}}
        compactDisabled
        compactDisabledReason="Send or clear your draft before compacting"
      />,
    );

    expect(markup).toContain('disabled=""');
    expect(markup).toContain(">Send or clear your draft before compacting<");
    expect(markup).not.toContain('aria-label="Send or clear your draft before compacting"');
  });
});
