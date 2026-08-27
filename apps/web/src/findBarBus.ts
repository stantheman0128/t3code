const FIND_BAR_OPEN_EVENT = "t3code:open-find-bar";

export function openFindBar(): void {
  window.dispatchEvent(new CustomEvent(FIND_BAR_OPEN_EVENT));
}

export function onOpenFindBar(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(FIND_BAR_OPEN_EVENT, handler);
  return () => window.removeEventListener(FIND_BAR_OPEN_EVENT, handler);
}

export function isFindBarOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector("[data-find-bar]") !== null;
}
