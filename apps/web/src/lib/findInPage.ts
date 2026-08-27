export const FIND_MATCH_HIGHLIGHT = "t3-find-match";
export const FIND_CURRENT_HIGHLIGHT = "t3-find-current";

const SKIP_SELECTOR =
  "script, style, noscript, svg, [hidden], [data-find-bar], [data-command-palette]";

type HighlightLike = {
  add: (range: Range) => void;
};

type HighlightCtor = new (...ranges: Range[]) => HighlightLike;

type HighlightRegistry = {
  set: (name: string, highlight: HighlightLike) => void;
  delete: (name: string) => void;
};

export function findQueryOffsets(
  haystack: string,
  query: string,
  caseSensitive = false,
): ReadonlyArray<number> {
  if (query.length === 0) return [];
  const hay = caseSensitive ? haystack : haystack.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  if (needle.length === 0) return [];
  const offsets: Array<number> = [];
  let from = 0;
  while (from <= hay.length - needle.length) {
    const index = hay.indexOf(needle, from);
    if (index === -1) break;
    offsets.push(index);
    from = index + 1;
  }
  return offsets;
}

export function stepFindIndex(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return 0;
  return (current + direction + count * 2) % count;
}

export function formatFindStatus(currentIndex: number, matchCount: number): string {
  if (matchCount <= 0) return "No results";
  return `${currentIndex + 1} of ${matchCount}`;
}

export function selectedFindQuery(selectionText: string, maxLength = 200): string {
  const trimmed = selectionText.trim();
  if (trimmed.length === 0 || trimmed.includes("\n")) return "";
  return trimmed.slice(0, maxLength);
}

function isVisible(element: Element): boolean {
  const html = element as HTMLElement;
  if (typeof html.checkVisibility === "function") {
    return html.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  return true;
}

export function collectFindRanges(root: ParentNode, query: string, caseSensitive = false): Range[] {
  if (query.length === 0 || typeof document === "undefined") return [];

  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text) || node.data.length === 0) {
        return NodeFilter.FILTER_REJECT;
      }
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_SELECTOR) || !isVisible(parent)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) {
      const offsets = findQueryOffsets(current.data, query, caseSensitive);
      for (const offset of offsets) {
        const range = document.createRange();
        range.setStart(current, offset);
        range.setEnd(current, offset + query.length);
        ranges.push(range);
      }
    }
    current = walker.nextNode();
  }
  return ranges;
}

function highlightRegistry(): HighlightRegistry | null {
  const css = globalThis.CSS as { highlights?: HighlightRegistry } | undefined;
  return css?.highlights ?? null;
}

function createHighlight(ranges: readonly Range[]): HighlightLike | null {
  const HighlightCtor = (globalThis as { Highlight?: HighlightCtor }).Highlight;
  if (!HighlightCtor || ranges.length === 0) return null;
  return new HighlightCtor(...ranges);
}

export function applyFindHighlights(ranges: readonly Range[], currentIndex: number): void {
  const registry = highlightRegistry();
  if (!registry) return;

  const others = ranges.filter((_, index) => index !== currentIndex);
  const otherHighlight = createHighlight(others);
  if (otherHighlight) {
    registry.set(FIND_MATCH_HIGHLIGHT, otherHighlight);
  } else {
    registry.delete(FIND_MATCH_HIGHLIGHT);
  }

  const current = ranges[currentIndex];
  const currentHighlight = current ? createHighlight([current]) : null;
  if (currentHighlight) {
    registry.set(FIND_CURRENT_HIGHLIGHT, currentHighlight);
  } else {
    registry.delete(FIND_CURRENT_HIGHLIGHT);
  }
}

export function clearFindHighlights(): void {
  const registry = highlightRegistry();
  registry?.delete(FIND_MATCH_HIGHLIGHT);
  registry?.delete(FIND_CURRENT_HIGHLIGHT);
}

export function revealFindRange(range: Range): void {
  const node =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  node?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
}
