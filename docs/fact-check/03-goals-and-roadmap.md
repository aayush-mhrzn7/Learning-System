# Goal and steps to get there

## North-star goal

> When I write a learning note, fact-check flags **only consequential, verifiable falsehoods** (with evidence). “What’s missing” lists **specific concepts I skipped**, not generic advice. Re-runs are **cheap** and **non-destructive**. I can dismiss bad flags and the system learns.

Success looks like:

- False statement about **semantic chunking mechanics** → red flag + source.
- Vague / contextual / pedagogical sentence → **not** underlined (and ideally never web-checked).
- Gaps name a concept + why it matters for *this* note; re-analyze doesn’t spam duplicates.
- Small edit + re-publish does **not** re-burn a full extract + N web searches.

---

## Phase 0 — Stop the bleeding (P0)

**Outcome:** runs are safe; quality becomes measurable; false flags can be suppressed.

| Step | Work | Done when |
|------|------|-----------|
| 0.1 | **Fact-check run lock** + replace claims only on successful completion (or transactional swap). Persist `run_id` / status. | Double-click / multi-tab cannot wipe claims mid-flight |
| 0.2 | **Golden eval set** (20–50 fixtures): must-flag / must-not-flag / gaps eligible. Offline JSON + `bun run eval` (or script). | Prompt change can fail an objective check |
| 0.3 | **Prompt version** constants stored on claim rows / gap batches | Regressions attributable |
| 0.4 | **Claim feedback** on hover: dismiss / still wrong / fixed → DB; suppress dismissed text until claim text changes | You can clear noise without waiting for a perfect model |
| 0.5 | **Judge with note context** (±1–2 paragraphs); policy: no `incorrect` without checkable proposition + usable evidence | Context-dependent fragments stop becoming red |
| 0.6 | **Structured extract kinds** + hard drop before Decisions | Taxonomy in [01-current-flow.md](./01-current-flow.md) |
| 0.7 | **BYOK soft caps** (max web judges / day) + confirm when `toCheck` is large | Accidental spend bounded |
| 0.8 | **Reconcile Drizzle migrations** with `users` / BYOK schema | Fresh migrate = production truth |

Ship order suggestion: **0.5 + 0.6** (quality), then **0.1** (safety), then **0.2–0.4** (measurement/feedback), then **0.7–0.8**.

---

## Phase 1 — Sparse + cheap (P1)

**Outcome:** only dirty claims cost money; gaps become usable.

| Step | Work |
|------|------|
| 1.1 | **Content / claim hashes** — incremental fact-check; keep stable verdicts; only extract/judge dirty spans |
| 1.2 | **Decouple clean re-publish** from full fact-check (run if `editedSincePublish` / incomplete / hash changed / user opts in) |
| 1.3 | **Stricter gate** — `checkable ∧ consequential`; raise threshold (e.g. 0.85–0.9) after eval |
| 1.4 | **Batch or cache web judges** — multi-claim Responses call and/or verdict cache by normalized claim+context |
| 1.5 | **Gaps: save-before-analyze**; richer structured gap object (`concept`, `relation`, `self_check`, `gap_type`); server denylist for vague lines |
| 1.6 | **Gaps reconcile** — stale/covered items instead of append-forever; optional topic/learning-goal field on note or directory |
| 1.7 | **Pass directory path + sibling titles (FTS)** into gaps; optional claim-verdict summary |
| 1.8 | **ai_usage** rows + simple spend readout in Settings |
| 1.9 | **Claim offsets** from extract (or post-map) — decorate by range, not `indexOf` |
| 1.10 | **Product flow decision** — either publish can trigger gaps once when empty/hash changed, or UI clearly says “Gaps not analyzed” |

---

## Phase 2 — Learning system depth (P2)

**Outcome:** notes get better *content*, not just better flags.

| Step | Work |
|------|------|
| 2.1 | Learning-note templates (Goal → Claims → Mechanism → Example → Counterexample → Open questions) |
| 2.2 | Note-to-note links + “already covered elsewhere” for gaps |
| 2.3 | Directory-level outcomes / syllabus blurb for gap anchoring |
| 2.4 | Per-task model overrides (stronger extract/gaps, cheap gate, careful judge) once usage data exists |
| 2.5 | Re-evaluate OpenRouter behind cost + eval comparison |
| 2.6 | Background worker only if timeouts remain after incremental runs |
| 2.7 | Spaced revisit hooks (unticked gaps / high incorrect density) |

---

## Definition of done (fact-check specifically)

Use the eval set plus a manual smoke note:

1. Write a short correct section on semantic chunking → **zero** incorrect underlines.
2. Insert one deliberate false mechanism claim → **one** incorrect underline with a relevant source.
3. Add “this section could be clearer about X” → **not** fact-checked / not underlined (may appear in gaps if at all).
4. Edit an unrelated paragraph → re-run → **no** re-judge of unchanged verified claims (hash hit).
5. Dismiss a remaining false positive → re-run → **stays dismissed** until that sentence changes.

---

## What not to do first

- Bigger UI redesign as a substitute for judge context + gating.
- More models without eval.
- Auto-rewriting the user’s note (contradicts product thesis).
- Full knowledge-graph platform before topic anchor + incremental hashes.

---

## Mapping to older todo

[`todo/improvements.md`](../../todo/improvements.md) still lists caching, gaps quality, publish wiring, OpenRouter, settings — several are done (settings/BYOK/OpenRouter code path) or partially done. Treat **this roadmap** as the fact-check / learning priority spine; keep UI dialog polish out of P0/P1 for quality work.
