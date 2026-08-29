import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { SkillInlineText } from "./SkillInlineText";

describe("SkillInlineText", () => {
  it("keeps slash command formatting in sent message text", () => {
    const markup = renderToStaticMarkup(
      <SkillInlineText text="/goal clear the old objective" skills={[]} />,
    );

    expect(markup).toContain("/goal");
    expect(markup).toContain("text-sky-700");
    expect(markup).toContain('data-slash-command="/goal"');
    expect(markup).toContain("clear the old objective");
  });
});
