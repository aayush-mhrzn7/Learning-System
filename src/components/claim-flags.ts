import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type ClaimFlag = {
  id: string;
  claimText: string;
  verdict: "correct" | "incorrect" | "unsure";
  reason: string;
  sources: Array<{ title: string; url: string }>;
  stale: boolean;
};

type FlagState = {
  claims: ClaimFlag[];
  decorations: DecorationSet;
};

export const claimFlagsKey = new PluginKey<FlagState>("claimFlags");

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rangeFromMatch(
  positions: number[],
  start: number,
  length: number,
) {
  let from = -1;
  let to = -1;
  for (let index = start; index < start + length; index += 1) {
    const position = positions[index];
    if (position !== undefined && position >= 0) {
      if (from < 0) from = position;
      to = position + 1;
    }
  }
  if (from < 0 || to <= from) return null;
  return { from, to };
}

function findClaimRanges(text: string, claimText: string, positions: number[]) {
  const needle = claimText.trim();
  if (!needle) return [] as Array<{ from: number; to: number }>;

  const ranges: Array<{ from: number; to: number }> = [];
  const pushMatch = (start: number, length: number) => {
    const range = rangeFromMatch(positions, start, length);
    if (range) ranges.push(range);
  };

  let offset = text.indexOf(needle);
  while (offset !== -1) {
    pushMatch(offset, needle.length);
    offset = text.indexOf(needle, offset + 1);
  }
  if (ranges.length > 0) return ranges;

  // Extraction uses documentToText whitespace; the live doc may differ
  // (hard breaks, adjacent marks). Match on flexible whitespace.
  const parts = needle.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (parts.length === 0) return ranges;
  const pattern = new RegExp(parts.join("\\s+"), "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    pushMatch(match.index, match[0].length);
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return ranges;
}

function locateClaims(
  document: Parameters<typeof DecorationSet.create>[0],
  claims: ClaimFlag[],
) {
  const decorations: Decoration[] = [];
  const positions: number[] = [];
  let text = "";
  let previousEnd = -1;

  document.descendants((node, position) => {
    if (!node.isText || !node.text) return;
    if (previousEnd >= 0 && position > previousEnd) {
      text += "\n";
      positions.push(-1);
    }
    for (let index = 0; index < node.text.length; index += 1) {
      text += node.text[index];
      positions.push(position + index);
    }
    previousEnd = position + node.text.length;
  });

  for (const claim of claims) {
    // Only wrong facts get squiggles. Soft/unsure claims stay unmarked.
    if (claim.verdict !== "incorrect") continue;
    for (const range of findClaimRanges(text, claim.claimText, positions)) {
      decorations.push(createDecoration(range.from, range.to, claim));
    }
  }

  return DecorationSet.create(document, decorations);
}

function createDecoration(from: number, to: number, claim: ClaimFlag) {
  const stale = claim.stale;
  return Decoration.inline(
    from,
    to,
    {
      class: `claim-flag claim-${claim.verdict}${stale ? " claim-stale" : ""}`,
      "data-claim-id": claim.id,
    },
    { claim },
  );
}

export const ClaimFlags = Extension.create({
  name: "claimFlags",

  addProseMirrorPlugins() {
    return [
      new Plugin<FlagState>({
        key: claimFlagsKey,
        state: {
          init: () => ({
            claims: [],
            decorations: DecorationSet.empty,
          }),
          apply(transaction, previous, _oldState, newState) {
            const nextClaims = transaction.getMeta(claimFlagsKey) as
              | ClaimFlag[]
              | undefined;
            if (nextClaims) {
              return {
                claims: nextClaims,
                decorations: locateClaims(newState.doc, nextClaims),
              };
            }

            if (!transaction.docChanged) return previous;
            const mapped = previous.decorations.map(
              transaction.mapping,
              transaction.doc,
            );
            const decorations: Decoration[] = [];
            mapped.find().forEach((decoration) => {
              const claim = decoration.spec.claim as ClaimFlag;
              const current = newState.doc.textBetween(
                decoration.from,
                decoration.to,
              );
              decorations.push(
                createDecoration(decoration.from, decoration.to, {
                  ...claim,
                  stale: claim.stale || current !== claim.claimText,
                }),
              );
            });
            return {
              claims: previous.claims,
              decorations: DecorationSet.create(newState.doc, decorations),
            };
          },
        },
        props: {
          decorations(state) {
            return claimFlagsKey.getState(state)?.decorations ?? null;
          },
        },
      }),
    ];
  },
});
