// Gap items are stored in the single `text` column as
// "title\n\ndescription\n\nDone when: ..." so no schema change is needed.
const DONE_PREFIX = "Done when:";

export function encodeGapText(gap: {
  title: string;
  description: string;
  done: string;
}) {
  return [
    gap.title.trim(),
    gap.description.trim(),
    `${DONE_PREFIX} ${gap.done.trim()}`,
  ].join("\n\n");
}

export function gapTitle(text: string) {
  return text.split("\n\n")[0] ?? text;
}

export function parseGapText(text: string) {
  const [title = text, ...rest] = text.split("\n\n");
  let description = "";
  let done = "";
  for (const part of rest) {
    if (part.startsWith(DONE_PREFIX)) done = part.slice(DONE_PREFIX.length).trim();
    else description = description ? `${description} ${part}` : part;
  }
  return { title, description, done };
}
