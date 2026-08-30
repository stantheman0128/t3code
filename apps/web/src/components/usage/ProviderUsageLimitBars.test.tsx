import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ProviderUsageLimitBars } from "./ProviderUsageLimitBars";

describe("ProviderUsageLimitBars", () => {
  it("shows used percent and reset time without a tooltip", () => {
    const html = renderToStaticMarkup(
      <ProviderUsageLimitBars
        now={new Date("2026-08-28T12:00:00.000Z")}
        windows={[
          {
            id: "primary",
            label: "5h",
            remainingPercent: 58,
            resetsAt: "2026-08-28T15:00:00.000Z",
            durationMinutes: 300,
          },
        ]}
      />,
    );
    expect(html).toContain("5h");
    expect(html).toContain("42% used");
    expect(html).toContain("width:42%");
    expect(html).not.toContain("58%");
    expect(html).toContain("resets in 3h");
    expect(html).not.toContain("title=");
  });

  it("turns a nearly empty remaining window into 100% used", () => {
    const html = renderToStaticMarkup(
      <ProviderUsageLimitBars
        windows={[
          {
            id: "weekly",
            label: "Week",
            remainingPercent: 0,
            resetsAt: null,
          },
        ]}
      />,
    );
    expect(html).toContain("100% used");
    expect(html).toContain("bg-error");
    expect(html).toContain("width:100%");
  });
});
