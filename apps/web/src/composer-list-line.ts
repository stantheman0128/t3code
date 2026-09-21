import { splitBlock } from "@tiptap/pm/commands";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface ComposerListLine {
  readonly kind: "ordered" | "bullet";
  readonly indent: string;
  readonly markerLength: number;
  readonly body: string;
  readonly spacing: string;
  readonly number?: number;
  readonly delimiter?: "." | ")";
  readonly bullet?: "-" | "*" | "•";
}

const ORDERED_LINE = /^(\s*)(\d+)([.)])(\s+)([\s\S]*)$/;
const BULLET_LINE = /^(\s*)([-*•])(\s+)([\s\S]*)$/;

export function parseComposerListLine(text: string): ComposerListLine | null {
  const ordered = ORDERED_LINE.exec(text);
  if (ordered) {
    const indent = ordered[1] ?? "";
    const digits = ordered[2] ?? "";
    const delimiter = ordered[3] === ")" ? ")" : ".";
    const spacing = ordered[4] ?? "";
    const body = ordered[5] ?? "";
    const number = Number(digits);
    if (!Number.isSafeInteger(number)) return null;
    return {
      kind: "ordered",
      indent,
      number,
      delimiter,
      spacing,
      body,
      markerLength: indent.length + digits.length + delimiter.length + spacing.length,
    };
  }

  const bullet = BULLET_LINE.exec(text);
  if (!bullet) return null;
  const indent = bullet[1] ?? "";
  const mark = bullet[2];
  if (mark !== "-" && mark !== "*" && mark !== "•") return null;
  const spacing = bullet[3] ?? "";
  const body = bullet[4] ?? "";
  return {
    kind: "bullet",
    indent,
    bullet: mark,
    spacing,
    body,
    markerLength: indent.length + mark.length + spacing.length,
  };
}

export function nextComposerListMarker(line: ComposerListLine): string {
  if (line.kind === "ordered") {
    return `${line.indent}${(line.number ?? 0) + 1}${line.delimiter ?? "."}${line.spacing}`;
  }
  return `${line.indent}${line.bullet ?? "-"}${line.spacing}`;
}

export function composerListLineDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") return;
    const parsed = parseComposerListLine(node.textContent);
    if (!parsed) return;
    const nest = Math.min(parsed.indent.length / 2, 8) * 1.1;
    const attrs: { class: string; style?: string } = { class: "composer-list-line" };
    if (nest > 0) attrs.style = `--composer-list-nest:${nest}em`;
    decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
  });
  return DecorationSet.create(doc, decorations);
}

/** Shift+Enter (and any other newline) continues a list line, or clears an empty marker. */
export function continueComposerListOnNewline(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
): boolean {
  if (!state.selection.empty) return false;
  const { $from } = state.selection;
  if ($from.parent.type.name !== "paragraph") return false;
  const text = $from.parent.textContent;
  const parsed = parseComposerListLine(text);
  if (!parsed || $from.parentOffset < parsed.markerLength) return false;

  if (parsed.body.trim().length === 0) {
    const start = $from.start();
    dispatch(state.tr.delete(start, start + text.length).scrollIntoView());
    return true;
  }

  return splitBlock(state, (tr) => {
    const marks =
      state.storedMarks || (state.selection.$from.parentOffset && state.selection.$from.marks());
    if (marks) tr.ensureMarks(marks);
    tr.insertText(nextComposerListMarker(parsed), tr.selection.from);
    dispatch(tr.scrollIntoView());
  });
}
