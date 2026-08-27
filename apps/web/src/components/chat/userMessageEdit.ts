const EDIT_IGNORE_SELECTOR = "button, a, textarea, input, [data-user-message-edit-ignore]";

export function isUserMessageEditIgnoredTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDIT_IGNORE_SELECTOR) !== null;
}

export function shouldBeginUserMessageEdit(input: {
  ignored: boolean;
  inside: boolean;
  selectionText: string;
}): boolean {
  return input.inside && !input.ignored && input.selectionText.trim().length === 0;
}
