import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ProviderUsageLimitBars } from "./ProviderUsageLimitBars";

describe("ProviderUsageLimitBars", () => {
  it("shows remaining percent as left, matching ChatGPT Usage", () => {
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
    expect(html).toContain("58% left");
    expect(html).toContain("width:58%");
    expect(html).not.toContain("used");
    expect(html).toContain("resets in 3h");
    expect(html).not.toContain("title=");
  });

  it("turns a nearly empty remaining window into 0% left", () => {
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
    expect(html).toContain("0% left");
    expect(html).toContain("bg-error");
    expect(html).toContain("width:0%");
  });
});
