const SEPARATOR_LINE = /^\|?[\t :|-]+\|[\t :|-]*\|?$/;

function splitCells(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isSeparator(line: string) {
  return SEPARATOR_LINE.test(line.trim()) && line.includes("-");
}

export function markdownTableToHtml(text: string): string | null {
  const lines = text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return null;
  if (!lines.every((line) => line.includes("|"))) return null;

  const separatorIndex = lines.findIndex(isSeparator);
  if (separatorIndex < 1) return null;

  const header = splitCells(lines[0] ?? "");
  if (header.length === 0) return null;

  const body = lines
    .slice(separatorIndex + 1)
    .map(splitCells)
    .filter((row) => row.some((cell) => cell.length > 0));
  if (body.length === 0) return null;

  const cols = header.length;
  const cell = (tag: "th" | "td", value: string) =>
    `<${tag}><p>${escapeHtml(value)}</p></${tag}>`;

  const headerRow = `<tr>${header.map((value) => cell("th", value)).join("")}</tr>`;
  const bodyRows = body
    .map((row) => {
      const cells = Array.from({ length: cols }, (_, index) => row[index] ?? "");
      return `<tr>${cells.map((value) => cell("td", value)).join("")}</tr>`;
    })
    .join("");

  return `<table><tbody>${headerRow}${bodyRows}</tbody></table>`;
}

export function looksLikeMarkdownTable(text: string) {
  return markdownTableToHtml(text) !== null;
}
