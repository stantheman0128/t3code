import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { FindBarView } from "./FindBar";

describe("FindBarView", () => {
  it("renders the in-page find controls", () => {
    const html = renderToStaticMarkup(
      <FindBarView
        query="agents"
        status="2 of 5"
        hasQuery
        hasMatches
        onQueryChange={() => {}}
        onNext={() => {}}
        onPrevious={() => {}}
        onClose={() => {}}
      />,
    );

    expect(html).toContain('data-find-bar="true"');
    expect(html).toContain('aria-label="Find in page"');
    expect(html).toContain("2 of 5");
    expect(html).toContain('aria-label="Next match"');
    expect(html).toContain('aria-label="Previous match"');
    expect(html).toContain('aria-label="Close find"');
  });

  it("marks an empty search as no results", () => {
    const html = renderToStaticMarkup(
      <FindBarView
        query="zzz"
        status="No results"
        hasQuery
        hasMatches={false}
        onQueryChange={() => {}}
        onNext={() => {}}
        onPrevious={() => {}}
        onClose={() => {}}
      />,
    );

    expect(html).toContain("No results");
    expect(html).toContain("text-destructive");
  });
});
