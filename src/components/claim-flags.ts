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
    if (claim.verdict === "correct") continue;
    let offset = text.indexOf(claim.claimText);
    while (offset !== -1) {
      const from = positions[offset];
      const finalPosition = positions[offset + claim.claimText.length - 1];
      if (from >= 0 && finalPosition >= 0) {
        decorations.push(
          createDecoration(from, finalPosition + 1, claim),
        );
      }
      offset = text.indexOf(claim.claimText, offset + 1);
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
