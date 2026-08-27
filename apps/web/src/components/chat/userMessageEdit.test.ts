import { describe, expect, it } from "vite-plus/test";

import { shouldBeginUserMessageEdit } from "./userMessageEdit";

describe("shouldBeginUserMessageEdit", () => {
  it("starts edit on a bubble click with no text selection", () => {
    expect(
      shouldBeginUserMessageEdit({
        ignored: false,
        inside: true,
        selectionText: "",
      }),
    ).toBe(true);
  });

  it("ignores clicks on buttons and selected text", () => {
    expect(
      shouldBeginUserMessageEdit({
        ignored: true,
        inside: true,
        selectionText: "",
      }),
    ).toBe(false);
    expect(
      shouldBeginUserMessageEdit({
        ignored: false,
        inside: true,
        selectionText: "copy me",
      }),
    ).toBe(false);
  });
});
