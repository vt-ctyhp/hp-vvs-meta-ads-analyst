/**
 * Pure parsing/normalization for the distilled Ask AI answer view.
 *
 * The agent writes its answer as free prose and may sprinkle in light markdown
 * (`### headings`, `**bold**`, `` `code` ``, `- bullets`). The distilled view
 * renders a numbered "Findings" list of plain text, so raw markdown tokens must
 * never reach the screen as literal characters. {@link normalizeAnswerMarkdown}
 * strips those tokens and turns headings/labelled bullets into their own lines;
 * {@link parseReadableAnswer} then splits the normalized text into findings,
 * pulling out assumptions / caveats / source-note lines.
 *
 * Kept out of the React component so it can be unit-tested directly.
 */

export type ReadableAnswerItem = {
  body: string;
  label?: string;
};

export type ParsedReadableAnswer = {
  context: ReadableAnswerItem[];
  findings: ReadableAnswerItem[];
  assumptions: ReadableAnswerItem[];
  caveats: ReadableAnswerItem[];
  sourceNotes: ReadableAnswerItem[];
};

/**
 * Remove markdown syntax and break headings / labelled bullets onto their own
 * lines so each becomes a distinct finding. Single underscores are preserved —
 * entity names like `CBI_Evergreen_Prospecting` rely on them.
 */
export function normalizeAnswerMarkdown(raw: string): string {
  return raw
    .replace(/`+/g, "") // drop code backticks
    .replace(/\*+|__/g, "") // drop **bold**, *em*, __bold__ (keep single _)
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, "\n") // line-start headings start a new line
    .replace(/[ \t]*#{1,6}[ \t]+/g, "\n") // inline "### Heading" markers too
    .replace(/^[ \t]*[-*•]\s+/gm, "\n") // leading bullet markers start a new line
    .replace(/\s+[-–—]\s+(?=[A-Z][A-Za-z ]{0,30}:\s)/g, "\n") // inline "- Label:" bullets
    .replace(/\s*•\s*/g, "\n") // inline bullet dots
    .replace(/[ \t]*\n[ \t]*/g, "\n") // tidy whitespace around newlines
    .replace(/\n{2,}/g, "\n") // collapse blank lines
    .trim();
}

export function parseReadableAnswer(summary: string): ParsedReadableAnswer {
  const parsed: ParsedReadableAnswer = {
    context: [],
    findings: [],
    assumptions: [],
    caveats: [],
    sourceNotes: [],
  };

  const normalized = normalizeAnswerMarkdown(summary);
  const sentences = normalized
    .split(/\n+/)
    .flatMap((block) => block.split(/(?<=\.)\s+(?=[A-Z0-9])/))
    .map((sentence) => sentence.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  sentences.forEach((sentence) => {
    const labelMatch = sentence.match(/^([A-Z][A-Za-z ]{2,32}s?):\s+(.+)$/);
    const label = labelMatch?.[1];
    const body = labelMatch?.[2] || sentence;
    const lowerLabel = label?.toLowerCase() || "";
    const lowerSentence = sentence.toLowerCase();
    const item = label ? { label, body } : { body };

    if (lowerLabel.startsWith("assumption")) {
      parsed.assumptions.push({ body });
      return;
    }

    if (lowerLabel.startsWith("caveat")) {
      parsed.caveats.push({ body });
      return;
    }

    if (lowerLabel.startsWith("source note")) {
      parsed.sourceNotes.push({ body });
      return;
    }

    if (
      lowerSentence.startsWith("answer only mode used governed meta ads facts") ||
      lowerSentence.startsWith("answer + visuals mode used governed meta ads facts") ||
      lowerSentence.startsWith("full dashboard mode used governed meta ads facts")
    ) {
      parsed.context.push(item);
      return;
    }

    parsed.findings.push(item);
  });

  if (!sentences.length && summary.trim()) {
    parsed.findings.push({ body: normalizeAnswerMarkdown(summary) });
  }

  return parsed;
}

export function hasReadableAnswerContent(answer: ParsedReadableAnswer): boolean {
  return Boolean(
    answer.context.length ||
      answer.findings.length ||
      answer.assumptions.length ||
      answer.caveats.length ||
      answer.sourceNotes.length,
  );
}
