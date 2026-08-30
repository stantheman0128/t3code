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

  it("fills leftover 65% as 65% of the track in left mode, matching Claude leftover", () => {
    const html = renderToStaticMarkup(
      <ProviderUsageLimitBars
        percentDisplay="left"
        windows={[
          { id: "five_hour", label: "5h", remainingPercent: 65, resetsAt: null },
          { id: "seven_day", label: "Week", remainingPercent: 7, resetsAt: null },
        ]}
      />,
    );
    expect(html).toContain("65% left");
    expect(html).toContain("width:65%");
    expect(html).toContain("7% left");
    expect(html).toContain("width:7%");
    expect(html).toContain("bg-muted-foreground/25");
  });

  it("inverts leftover 65% to 35% used fill when the setting is used", () => {
    const html = renderToStaticMarkup(
      <ProviderUsageLimitBars
        percentDisplay="used"
        windows={[
          { id: "five_hour", label: "5h", remainingPercent: 65, resetsAt: null },
          { id: "seven_day", label: "Week", remainingPercent: 7, resetsAt: null },
        ]}
      />,
    );
    expect(html).toContain("35% used");
    expect(html).toContain("width:35%");
    expect(html).toContain("93% used");
    expect(html).toContain("width:93%");
  });

  it("can fill and label the same window as used", () => {
    const html = renderToStaticMarkup(
      <ProviderUsageLimitBars
        percentDisplay="used"
        windows={[
          {
            id: "primary",
            label: "5h",
            remainingPercent: 58,
            resetsAt: null,
          },
        ]}
      />,
    );
    expect(html).toContain("42% used");
    expect(html).toContain("width:42%");
    expect(html).not.toContain("left");
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
