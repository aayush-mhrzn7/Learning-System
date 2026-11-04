# What’s missing & making notes better

## Current gaps flow

- **UI:** only on **published** notes — “What’s missing” + Analyze gaps / Analyze again.
- **API:** manual `POST /api/notes/[id]/gaps` — **not** triggered by publish or fact-check (README still says “on publish”; code disagrees).
- **Unlock:** ≥500 non-code chars via `documentToText(..., { skipCode: true })`.
- **Model input:** note body only (truncated to **first 8000** chars). No title, directory, siblings, claims, or existing checklist (except exact-string dedupe after the call).
- **Output:** `{ eligible, reason, gaps≤5 }` flat strings → **append-only** `checklist_items`.
- **Model:** same BYOK GPT model as fact-check (default `gpt-5-nano`), **no web**, low reasoning effort.
- **Race:** client gate uses **live editor** text; API uses **last saved** DB content. `findGaps()` does not `saveNow()` first.

---

## Why answers feel half-baked

1. One free-text string per gap — no “why”, no self-check, no mastery criterion.
2. Syllabus inferred only from this note → shallow notes → shallow gaps.
3. Head-only 8k truncation — misses the end of long notes; invents “missing” things that appear later.
4. No sibling-note retrieval (FTS exists unused).
5. No use of fact-check claims as coverage signals.
6. Analyze again **appends forever** — no stale/reconcile.
7. Nano model + single-shot eligibility+gapfind is a weak curriculum reviewer.
8. Vague items can persist; only schema max length, not a denylist.

---

## Learning strategy (fit this product)

Keep the thesis: **point out what you missed; do not write the note for you.**

| Idea | Practical shape here |
|------|----------------------|
| Socratic gaps | Store `self_check` question instead of only “Missing: X” |
| Rubric | `gap_type`: prerequisite / mechanism / assumption / tradeoff / limitation / example |
| Coverage map | Directory + FTS: concepts already covered in sibling notes → link, don’t duplicate |
| Claims ↔ gaps | Incorrect claims → “repair understanding of …”; missing mechanisms → coverage gaps |
| Spaced revisit | Unticked gaps / high incorrect density → revisit cue (later) |
| Note craft (separate from fact-check) | Optional pass: claim-first structure, example, counterexample — still pointers, not drafted prose |

---

## Features that improve what users write

1. **Templates** on create: Goal → Core claims → Mechanism → Example → Counterexample → Open questions.
2. **Learning goal / topic** field on note or directory — feed into gaps.
3. **Claim-first sections** — surface unclaimed paragraphs as coaching.
4. **Evidence / example slots** in TipTap so gaps can check presence vs inventing “add an example.”
5. **Gap → write target** — ticking optionally requires new non-code chars or a linked heading since the gap was created.
6. **Cross-note “already covered”** before insert.

---

## Concrete pipeline changes

### API / client

1. `findGaps` → **saveNow() then POST** (mirror publish pipeline).
2. Decide: keep manual Analyze, or optional post-publish when checklist empty / hash changed.
3. Reconcile on Analyze again (`stale` / covered), don’t only append.
4. Surface `skipped` (`minimum_length`, `not_learning_note`) and errors in UI.
5. Pass title, directory path, existing unticked texts, optional claim summary, optional FTS siblings.

### Prompt / schema (`ai.ts`)

Richer gap object, still no pasteable essay:

```json
{
  "concept": "...",
  "relation_to_note": "...",
  "gap_type": "prerequisite|mechanism|assumption|tradeoff|limitation|edge_case|example",
  "self_check": "One question the learner should answer in their own words",
  "mastery_hint": "What a sufficient section would demonstrate (criteria, not prose)"
}
```

- Server denylist for “add more detail”, “define terms”, “improve structure” without a named concept.
- Chunk or head+tail map-reduce instead of head-only 8k.
- Per-task stronger model for gaps once settings allow.

### Schema

Minimal: `stale`, `gapType`, `selfCheck` on checklist rows; optional `notes.learningGoal` or directory outcomes.

---

## Do not conflate with fact-check

Fact-check = **is this assertion true?**  
Gaps = **what conceptual coverage is missing?**  

Writing-quality coaching stays out of `judgeClaim` (prompt already forbids it). Put coverage and Socratic checks here.
