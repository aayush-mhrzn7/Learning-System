import type { EditorDocument } from "@/db/schema";

type EditorNode = {
  type?: string;
  text?: string;
  content?: EditorNode[];
};

function readNode(node: EditorNode, skipCode: boolean): string {
  if (skipCode && node.type === "codeBlock") return "";
  if (typeof node.text === "string") return node.text;
  const separator =
    node.type === "paragraph" ||
    node.type === "heading" ||
    node.type === "listItem"
      ? "\n"
      : "";
  return `${(node.content ?? [])
    .map((child) => readNode(child, skipCode))
    .join("")}${separator}`;
}

export function documentToText(
  document: EditorDocument,
  options: { skipCode?: boolean } = {},
) {
  return readNode(document as EditorNode, options.skipCode ?? false)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
