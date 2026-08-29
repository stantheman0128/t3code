import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import type { ServerProviderSkill } from "@t3tools/contracts";
import { formatProviderSkillDisplayName } from "@t3tools/client-runtime/providerSkills";

import {
  CHAT_INLINE_CHIP_CLASS_NAME,
  CHAT_INLINE_CHIP_LABEL_CLASS_NAME,
  CHAT_INLINE_SLASH_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  SKILL_CHIP_ICON_SVG,
} from "../composerInlineChip";
import { cn } from "~/lib/utils";

const SKILL_TOKEN_REGEX = /(^|\s)\$([a-zA-Z][a-zA-Z0-9:_-]*)(?=\s|$)/g;
const SLASH_TOKEN_REGEX = /(^|\s)(\/[a-zA-Z][\w:-]*)(?=\s|$)/g;

type InlineSkill = Pick<ServerProviderSkill, "name" | "displayName">;

export function SkillInlineText(props: { text: string; skills: ReadonlyArray<InlineSkill> }) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  const marks: Array<{ start: number; end: number; node: ReactNode }> = [];

  for (const match of props.text.matchAll(SKILL_TOKEN_REGEX)) {
    const prefix = match[1] ?? "";
    const name = match[2] ?? "";
    const start = (match.index ?? 0) + prefix.length;
    const rawText = `$${name}`;
    const skill = props.skills.find((candidate) => candidate.name === name);
    if (!skill) {
      continue;
    }
    marks.push({
      start,
      end: start + rawText.length,
      node: <SkillChip key={`skill:${start}:${name}`} skill={skill} rawText={rawText} />,
    });
  }

  for (const match of props.text.matchAll(SLASH_TOKEN_REGEX)) {
    const prefix = match[1] ?? "";
    const rawText = match[2] ?? "";
    const start = (match.index ?? 0) + prefix.length;
    if (marks.some((mark) => start < mark.end && start + rawText.length > mark.start)) {
      continue;
    }
    marks.push({
      start,
      end: start + rawText.length,
      node: (
        <span
          key={`slash:${start}:${rawText}`}
          className={CHAT_INLINE_SLASH_CHIP_CLASS_NAME}
          data-markdown-copy={rawText}
          data-slash-command={rawText}
        >
          {rawText}
        </span>
      ),
    });
  }

  marks.sort((left, right) => left.start - right.start);
  for (const mark of marks) {
    if (mark.start < cursor) {
      continue;
    }
    if (mark.start > cursor) {
      nodes.push(props.text.slice(cursor, mark.start));
    }
    nodes.push(mark.node);
    cursor = mark.end;
  }

  if (cursor === 0) {
    return <>{props.text}</>;
  }
  if (cursor < props.text.length) {
    nodes.push(props.text.slice(cursor));
  }
  return <>{nodes}</>;
}

export function renderSkillInlineMarkdownChildren(
  children: ReactNode,
  skills: ReadonlyArray<InlineSkill>,
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      return <SkillInlineText text={child} skills={skills} />;
    }
    if (!isValidElement<{ children?: ReactNode; node?: { tagName?: string } }>(child)) {
      return child;
    }
    // Custom react-markdown components replace the intrinsic type, so also
    // check the hast node they carry.
    const markdownTagName = typeof child.type === "string" ? child.type : child.props.node?.tagName;
    if (markdownTagName === "code" || markdownTagName === "a") {
      return child;
    }
    if (!("children" in child.props)) {
      return child;
    }
    return cloneElement(
      child,
      undefined,
      renderSkillInlineMarkdownChildren(child.props.children, skills),
    );
  });
}

function SkillChip(props: { skill: InlineSkill; rawText: string }) {
  return (
    <span className="inline-flex align-middle leading-none" data-markdown-copy={props.rawText}>
      <span
        className={cn(
          CHAT_INLINE_CHIP_CLASS_NAME,
          "border-fuchsia-500/25 bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300",
        )}
      >
        <span
          aria-hidden="true"
          className={COMPOSER_INLINE_CHIP_ICON_CLASS_NAME}
          dangerouslySetInnerHTML={{ __html: SKILL_CHIP_ICON_SVG }}
        />
        <span className={CHAT_INLINE_CHIP_LABEL_CLASS_NAME}>
          {formatProviderSkillDisplayName(props.skill)}
        </span>
      </span>
    </span>
  );
}
