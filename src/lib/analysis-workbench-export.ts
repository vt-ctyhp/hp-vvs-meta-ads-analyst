import type {
  AnalysisWorkbenchDashboardPacket,
  AnalysisWorkbenchVisualCard,
  AnalysisWorkbenchVisualCell,
  JsonValue,
} from "./analysis-workbench-contract.ts";

export type AnalysisWorkbenchTableExportCard = Extract<
  AnalysisWorkbenchVisualCard,
  { type: "flat_table" | "pivot_table" }
>;

export type AnalysisWorkbenchChartExportCard = Extract<
  AnalysisWorkbenchVisualCard,
  { type: "bar_chart" | "line_chart" | "scatter_chart" }
>;

export type AnalysisWorkbenchTextExport = {
  fileName: string;
  mimeType: string;
  content: string;
};

export type AnalysisWorkbenchPngExportSource = {
  fileName: string;
  mimeType: "image/png";
  svg: string;
  width: number;
  height: number;
};

type ExportInput<Card> = {
  card: Card;
  runId: string;
  sourceNotes?: JsonValue[];
};

export function isAnalysisWorkbenchTableCard(
  card: AnalysisWorkbenchVisualCard,
): card is AnalysisWorkbenchTableExportCard {
  return card.type === "flat_table" || card.type === "pivot_table";
}

export function isAnalysisWorkbenchChartCard(
  card: AnalysisWorkbenchVisualCard,
): card is AnalysisWorkbenchChartExportCard {
  return (
    card.type === "bar_chart" || card.type === "line_chart" || card.type === "scatter_chart"
  );
}

export function buildAnalysisWorkbenchTableCsvExport({
  card,
  sourceNotes = [],
}: ExportInput<AnalysisWorkbenchTableExportCard>): AnalysisWorkbenchTextExport {
  const rows = [
    ["Visual ID", card.id],
    ["Title", card.title],
    ["Source notes", sourceSummary(card.sourceNoteIds, sourceNotes)],
    [],
    ...tableRows(card),
  ];

  return {
    fileName: `${fileSlug(card.title)}.csv`,
    mimeType: "text/csv;charset=utf-8",
    content: rows.map(csvRow).join("\n"),
  };
}

export function buildAnalysisWorkbenchChartPngExportSource({
  card,
  sourceNotes = [],
}: ExportInput<AnalysisWorkbenchChartExportCard>): AnalysisWorkbenchPngExportSource {
  const width = 960;
  const height = 540;
  const svg =
    card.type === "bar_chart"
      ? barChartSvg(card, sourceNotes, width, height)
      : card.type === "line_chart"
        ? lineChartSvg(card, sourceNotes, width, height)
        : scatterChartSvg(card, sourceNotes, width, height);

  return {
    fileName: `${fileSlug(card.title)}.png`,
    mimeType: "image/png",
    svg,
    width,
    height,
  };
}

export function buildAnalysisWorkbenchPdfReportExport({
  packet,
}: {
  packet: AnalysisWorkbenchDashboardPacket;
  runId: string;
}): AnalysisWorkbenchTextExport {
  return {
    fileName: `${fileSlug(packet.generatedAt)}-dashboard-packet.pdf`,
    mimeType: "application/pdf",
    content: buildPdf(reportLines(packet)),
  };
}

/**
 * One self-contained PDF for a single table or chart, suitable for emailing to
 * a colleague. Charts are rendered as their full labelled data series (the PNG
 * export covers the visual rendering).
 */
export function buildAnalysisWorkbenchCardPdfExport({
  card,
  sourceNotes = [],
}: {
  card: AnalysisWorkbenchVisualCard;
  sourceNotes?: JsonValue[];
}): AnalysisWorkbenchTextExport {
  const lines = [
    "HP/VVS Meta Ads Analysis",
    "",
    ...fullCardLines(card, sourceNotes),
  ].flatMap((line) => wrapLine(line, 92));

  return {
    fileName: `${fileSlug(card.title)}.pdf`,
    mimeType: "application/pdf",
    content: buildPdf(lines),
  };
}

export type AnalysisWorkbenchRunPdfInput = {
  title: string;
  prompt: string;
  answerSummary: string;
  visualCards: AnalysisWorkbenchVisualCard[];
  sourceNotes: JsonValue[];
  assumptions?: string[];
  caveats?: string[];
};

/**
 * One PDF for an entire run: the question, the AI answer, every table and chart,
 * source notes, and assumptions/caveats. Works for any run (not just promoted
 * dashboard packets).
 */
export function buildAnalysisWorkbenchRunPdfExport({
  run,
}: {
  run: AnalysisWorkbenchRunPdfInput;
}): AnalysisWorkbenchTextExport {
  const lines = [
    "HP/VVS Meta Ads Analysis Report",
    "",
    run.title,
    `Question: ${run.prompt}`,
    "",
    "Answer",
    run.answerSummary || "No answer saved.",
    "",
    "Visuals",
    ...(run.visualCards.length
      ? run.visualCards.flatMap((card) => fullCardLines(card, run.sourceNotes))
      : ["No visual objects saved."]),
    "Source Notes",
    ...(normalizeSourceNotes(run.sourceNotes).length
      ? normalizeSourceNotes(run.sourceNotes).map((note) => `${note.label}: ${note.value}`)
      : ["None saved."]),
    "",
    "Assumptions",
    ...(run.assumptions?.length ? run.assumptions : ["None saved."]),
    "",
    "Caveats",
    ...(run.caveats?.length ? run.caveats : ["None saved."]),
  ].flatMap((line) => wrapLine(line, 92));

  return {
    fileName: `${fileSlug(run.title) || "analysis"}-run.pdf`,
    mimeType: "application/pdf",
    content: buildPdf(lines),
  };
}

function fullCardLines(card: AnalysisWorkbenchVisualCard, sourceNotes: JsonValue[]): string[] {
  const header = `${visualTypeLabel(card.type)}: ${card.title}`;
  const sources = `Sources: ${sourceSummary(card.sourceNoteIds, sourceNotes)}`;

  if (card.type === "flat_table" || card.type === "pivot_table") {
    return [header, sources, ...tableRows(card).map((row) => row.join(" | ")), ""];
  }
  if (card.type === "bar_chart") {
    return [header, sources, ...card.bars.map((bar) => `${bar.label}: ${bar.formattedValue}`), ""];
  }
  if (card.type === "line_chart") {
    return [
      header,
      sources,
      ...card.points.map((point) => `${point.label}: ${point.formattedValue}`),
      "",
    ];
  }
  if (card.type === "scatter_chart") {
    return [
      header,
      sources,
      ...card.points.map((point) => `${point.label}: ${point.formattedX} / ${point.formattedY}`),
      "",
    ];
  }
  return [
    header,
    sources,
    `${card.title}: ${"formattedValue" in card ? card.formattedValue : ""}`,
    "",
  ];
}

function tableRows(card: AnalysisWorkbenchTableExportCard): string[][] {
  if (card.type === "flat_table") {
    const columnInfo = card.columns.map((column) => ({
      column,
      hasHiddenIds:
        column.kind === "dimension" &&
        card.rows.some((row) => hiddenVisualCellId(row[column.key])),
    }));
    const columns = columnInfo.flatMap(({ column, hasHiddenIds }) =>
      hasHiddenIds ? [column.label, `${column.label} ID`] : [column.label],
    );
    return [
      columns,
      ...card.rows.map((row) =>
        columnInfo.flatMap(({ column, hasHiddenIds }) => {
          const cell = row[column.key];
          const id = hiddenVisualCellId(cell);
          return hasHiddenIds ? [formattedVisualCell(cell), id || ""] : [formattedVisualCell(cell)];
        }),
      ),
    ];
  }

  return [
    ["Row", ...card.columns.map((column) => column.label), "Total"],
    ...card.rows.map((row) => [
      row.rowLabel,
      ...card.columns.map((column) => formattedVisualCell(row.cells[column.key])),
      formattedVisualCell(row.total),
    ]),
  ];
}

function reportLines(packet: AnalysisWorkbenchDashboardPacket): string[] {
  const visualObjects = uniqueVisualObjects(packet);
  const lines = [
    "HP/VVS Meta Ads Analysis Report",
    `Generated: ${packet.generatedAt}`,
    "",
    "Answer",
    packet.directAnswer.summary,
    "",
    "Visuals",
    ...(visualObjects.length
      ? visualObjects.flatMap((card) => visualReportLines(card, packet.sourceNotes))
      : ["No visual objects saved."]),
    "Next Actions",
    ...(packet.nextActions.length
      ? packet.nextActions.map((action) => `${action.title}: ${action.detail}`)
      : ["None saved."]),
    "",
    "Source Notes",
    ...normalizeSourceNotes(packet.sourceNotes).map((note) => `${note.label}: ${note.value}`),
    "",
    "Assumptions",
    ...(packet.assumptions.length ? packet.assumptions : ["None saved."]),
    "",
    "Caveats",
    ...(packet.caveats.length ? packet.caveats : ["None saved."]),
  ];

  return lines.flatMap((line) => wrapLine(line, 92));
}

function uniqueVisualObjects(packet: AnalysisWorkbenchDashboardPacket) {
  return [
    ...packet.visualObjects,
    ...(packet.primaryEvidenceTable ? [packet.primaryEvidenceTable] : []),
  ].filter((card, index, cards) => cards.findIndex((item) => item.id === card.id) === index);
}

function visualReportLines(card: AnalysisWorkbenchVisualCard, sourceNotes: JsonValue[]) {
  const header = `${visualTypeLabel(card.type)}: ${card.title}`;
  const sources = `Sources: ${sourceSummary(card.sourceNoteIds, sourceNotes)}`;

  if (card.type === "flat_table" || card.type === "pivot_table") {
    return [header, sources, ...tableRows(card).slice(0, 7).map((row) => row.join(" | ")), ""];
  }

  if (card.type === "bar_chart") {
    return [
      header,
      sources,
      ...card.bars.slice(0, 8).map((bar) => `${bar.label}: ${bar.formattedValue}`),
      "",
    ];
  }

  if (card.type === "line_chart") {
    return [
      header,
      sources,
      ...card.points.slice(0, 8).map((point) => `${point.label}: ${point.formattedValue}`),
      "",
    ];
  }

  if (card.type === "scatter_chart") {
    return [
      header,
      sources,
      ...card.points
        .slice(0, 8)
        .map((point) => `${point.label}: ${point.formattedX} / ${point.formattedY}`),
      "",
    ];
  }

  return [
    header,
    sources,
    `${card.title}: ${"formattedValue" in card ? card.formattedValue : ""}`,
    "",
  ];
}

function barChartSvg(
  card: Extract<AnalysisWorkbenchVisualCard, { type: "bar_chart" }>,
  sourceNotes: JsonValue[],
  width: number,
  height: number,
) {
  const maxValue = Math.max(1, ...card.bars.map((bar) => bar.value));
  const chartLeft = 250;
  const chartRight = width - 96;
  const chartTop = 132;
  const rowHeight = Math.min(48, Math.max(30, 280 / Math.max(1, card.bars.length)));
  const bars = card.bars.slice(0, 8).map((bar, index) => {
    const y = chartTop + index * rowHeight;
    const barWidth = Math.max(8, ((chartRight - chartLeft) * bar.value) / maxValue);
    return [
      text(72, y + 16, truncate(bar.label, 28), "start", "body"),
      rect(chartLeft, y, barWidth, 18, "#2a2725"),
      text(chartRight, y + 15, bar.formattedValue, "end", "body"),
    ].join("");
  });

  return svgDocument({
    width,
    height,
    title: card.title,
    sourceSummary: sourceSummary(card.sourceNoteIds, sourceNotes),
    body: [
      axisLine(chartLeft, chartTop - 16, chartLeft, chartTop + rowHeight * card.bars.length),
      ...bars,
    ].join(""),
  });
}

function lineChartSvg(
  card: Extract<AnalysisWorkbenchVisualCard, { type: "line_chart" }>,
  sourceNotes: JsonValue[],
  width: number,
  height: number,
) {
  const values = card.points.map((point) => point.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const points = card.points.map((point, index) => ({
    label: point.label,
    valueLabel: point.formattedValue,
    x: scale(index, 0, Math.max(1, card.points.length - 1), 92, width - 92),
    y: scale(point.value, minValue, maxValue, height - 142, 132),
  }));
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");

  return svgDocument({
    width,
    height,
    title: card.title,
    sourceSummary: sourceSummary(card.sourceNoteIds, sourceNotes),
    body: [
      axisLine(76, height - 128, width - 76, height - 128),
      axisLine(76, 120, 76, height - 128),
      `<polyline points="${path}" fill="none" stroke="#2a2725" stroke-width="3" />`,
      ...points.map((point) => [
        `<circle cx="${point.x}" cy="${point.y}" r="6" fill="#9c7b3f" />`,
        text(point.x, point.y - 12, point.valueLabel, "middle", "small"),
      ].join("")),
      text(92, height - 92, card.points[0]?.label || "", "start", "small"),
      text(
        width - 92,
        height - 92,
        card.points[card.points.length - 1]?.label || "",
        "end",
        "small",
      ),
    ].join(""),
  });
}

function scatterChartSvg(
  card: Extract<AnalysisWorkbenchVisualCard, { type: "scatter_chart" }>,
  sourceNotes: JsonValue[],
  width: number,
  height: number,
) {
  const xValues = card.points.map((point) => point.x);
  const yValues = card.points.map((point) => point.y);
  const minX = Math.min(0, ...xValues);
  const maxX = Math.max(1, ...xValues);
  const minY = Math.min(0, ...yValues);
  const maxY = Math.max(1, ...yValues);
  const points = card.points.slice(0, 18).map((point) => ({
    label: point.label,
    x: scale(point.x, minX, maxX, 92, width - 108),
    y: scale(point.y, minY, maxY, height - 142, 132),
    valueLabel: `${point.formattedX} / ${point.formattedY}`,
  }));

  return svgDocument({
    width,
    height,
    title: card.title,
    sourceSummary: sourceSummary(card.sourceNoteIds, sourceNotes),
    body: [
      axisLine(76, height - 128, width - 76, height - 128),
      axisLine(76, 120, 76, height - 128),
      ...points.map((point) => [
        `<circle cx="${point.x}" cy="${point.y}" r="7" fill="#2a2725" />`,
        text(point.x + 10, point.y - 8, truncate(point.label, 18), "start", "small"),
        text(point.x + 10, point.y + 10, point.valueLabel, "start", "small-muted"),
      ].join("")),
    ].join(""),
  });
}

function svgDocument({
  width,
  height,
  title,
  sourceSummary,
  body,
}: {
  width: number;
  height: number;
  title: string;
  sourceSummary: string;
  body: string;
}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#fbf7f1"/>
<text x="48" y="58" font-family="Georgia, Times New Roman, serif" font-size="20" letter-spacing="3" fill="#8a8178">ANALYSIS EXPORT</text>
<text x="48" y="98" font-family="Georgia, Times New Roman, serif" font-size="34" fill="#2a2725">${escapeXml(title)}</text>
${body}
<line x1="48" y1="${height - 62}" x2="${width - 48}" y2="${height - 62}" stroke="#d4cfc4"/>
<text x="48" y="${height - 32}" font-family="Georgia, Times New Roman, serif" font-size="17" fill="#4a4540">Sources: ${escapeXml(sourceSummary)}</text>
</svg>`;
}

function rect(x: number, y: number, width: number, height: number, fill: string) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;
}

function axisLine(x1: number, y1: number, x2: number, y2: number) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d4cfc4" stroke-width="2"/>`;
}

function text(
  x: number,
  y: number,
  value: string,
  anchor: "start" | "middle" | "end",
  variant: "body" | "small" | "small-muted",
) {
  const size = variant === "body" ? 18 : 14;
  const fill = variant === "small-muted" ? "#8a8178" : "#2a2725";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Georgia, Times New Roman, serif" font-size="${size}" fill="${fill}">${escapeXml(value)}</text>`;
}

function buildPdf(lines: string[]) {
  const pages = chunkLines(lines, 50);
  const objects: Array<{ id: number; body: string }> = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    {
      id: 2,
      body: `<< /Type /Pages /Kids [${pages
        .map((_page, index) => `${4 + index * 2} 0 R`)
        .join(" ")}] /Count ${pages.length} >>`,
    },
    { id: 3, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>" },
  ];

  pages.forEach((pageLines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const stream = [
      "BT",
      "/F1 11 Tf",
      "13 TL",
      "48 744 Td",
      ...pageLines.map((line) => `(${escapePdfText(line)}) Tj T*`),
      "ET",
    ].join("\n");

    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
    objects.push({
      id: contentId,
      body: `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    });
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  const sortedObjects = objects.sort((left, right) => left.id - right.id);
  for (const object of sortedObjects) {
    offsets[object.id] = byteLength(pdf);
    pdf += `${object.id} 0 obj\n${object.body}\nendobj\n`;
  }

  const xrefStart = byteLength(pdf);
  const size = Math.max(...objects.map((object) => object.id)) + 1;
  pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id += 1) {
    pdf += `${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return pdf;
}

function chunkLines(lines: string[], pageSize: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < lines.length; index += pageSize) {
    chunks.push(lines.slice(index, index + pageSize));
  }
  return chunks.length ? chunks : [[]];
}

function csvRow(row: string[]) {
  return row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",");
}

function sourceSummary(sourceNoteIds: string[], sourceNotes: JsonValue[]) {
  const normalized = normalizeSourceNotes(sourceNotes);
  const selected = sourceNoteIds.length
    ? normalized.filter((note) => sourceNoteIds.includes(note.id))
    : normalized;

  if (selected.length) {
    return selected.map((note) => `${note.id} ${note.label}: ${note.value}`).join("; ");
  }

  return sourceNoteIds.length ? sourceNoteIds.join("; ") : "No source notes saved";
}

function normalizeSourceNotes(notes: JsonValue[]) {
  return notes.flatMap((note) => {
    if (!note || typeof note !== "object" || Array.isArray(note)) return [];
    const candidate = note as { id?: unknown; label?: unknown; value?: unknown };
    if (typeof candidate.label !== "string" || typeof candidate.value !== "string") return [];
    return [
      {
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : candidate.label,
        label: candidate.label,
        value: candidate.value,
      },
    ];
  });
}

function formattedVisualCell(cell: AnalysisWorkbenchVisualCell | undefined) {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "object") {
    return typeof cell.formattedValue === "string" ? cell.formattedValue : String(cell.value ?? "");
  }
  return String(cell);
}

function hiddenVisualCellId(cell: AnalysisWorkbenchVisualCell | undefined) {
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) return null;
  const id = cell.hiddenId || cell.entity?.hiddenId;
  return typeof id === "string" && id ? id : null;
}

function visualTypeLabel(type: AnalysisWorkbenchVisualCard["type"]) {
  return type
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function wrapLine(line: string, maxLength: number) {
  if (line.length <= maxLength) return [line];
  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function scale(value: number, min: number, max: number, outMin: number, outMax: number) {
  if (max === min) return (outMin + outMax) / 2;
  return outMin + ((value - min) / (max - min)) * (outMax - outMin);
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function fileSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
