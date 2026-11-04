# Current fact-check flow — and what should be done

## Product intent (keep this)

Fact-check should be **sparse and consequential**:

- **Yes:** “Semantic chunking splits on meaning boundaries rather than fixed token windows” — if that is false or half-true, flag it with evidence.
- **No:** vague fragments, pedagogy (“this section doesn’t explain X”), style, context-dependent hedges (“this improves performance”), or writing-meta that belongs in gaps — not under red squiggles.

Today the code *tries* to encode that in prompts, but the **architecture still over-extracts, gates weakly, and judges claims with no note context** — which is why small random bits get marked wrong.

---

## Current flow (step by step)

### Client (`note-editor.tsx` → `activity-pipeline.tsx`)

Triggers: **Fact-check**, **Publish**, **Re-publish** → `runPipeline(kind)`.

| UI step | When | Action |
|---------|------|--------|
| `save` | Always | `PATCH /api/notes/:id` |
| `publish` | Publish / re-publish only | `POST .../publish` (DB status only — **no gaps**) |
| extract → score → web → complete | Always after save (+ optional publish) | NDJSON from `POST .../fact-check` |

Publish/re-publish **always** re-runs the full fact-check stream, even when the note barely changed.

### Server (`fact-check/route.ts` + `ai.ts`)

1. Auth + GPT BYOK credentials (OpenRouter disabled).
2. `documentToText(content, { skipCode: true })` — code fences dropped.
3. Set `notes.factCheckIncomplete = true`.
4. **`extractClaims`** — chunk note at ~2800 chars, concurrency 2, soft “≤12 claims per passage”.
5. **`DELETE FROM claims WHERE note_id = …`** — full wipe every run.
6. **`decideClaims`** — OpenAI Decisions (`gpt-6-luna`), batches of 40.
7. Keep claims with **score > 0.8**.
8. **`judgeClaim`** per remaining claim, concurrency 2, **with web search**, input = **claim string only** (no surrounding note).
9. Insert only successfully judged rows (`claimText`, `verdict`, `reason`, `sources`). Score / kind / offsets **not stored**.
10. `factCheckIncomplete = (any judge failed)`.

### LLM / API calls per run

| Stage | Call | Default model | Notes |
|-------|------|---------------|-------|
| Extract | Responses, no tools | User model (`gpt-5-nano`) | 1 call per text chunk |
| Gate | Decisions API | `gpt-6-luna` | 1 call per ≤40 claims |
| Judge | Responses + `web_search` | Same user model | **1 call per claim** above threshold |

Gaps (`findMissingTopics`) are a **separate** manual route — not part of this pipeline.

### Render (`claim-flags.ts`)

- Match claim text with `docText.indexOf(claimText)` (first occurrence).
- Underline **only** `verdict === "incorrect"`.
- `unsure` is intentionally hidden; bad `incorrect` verdicts still show as noise.

---

## Why noise claims get flagged

1. **Extract schema is only `{ text }`** — no `kind`, `checkable`, `needs_context`. Soft prompt skips are ignored by a weak nano model.
2. **Chunking is length packing**, not semantic — notes *about* chunking/retrieval confuse the “skip pedagogy” instructions.
3. **Decisions asks “worth a web check?”** — technical-sounding fragments still score high. There is no **consequential for learning** score.
4. **Judge sees the claim in isolation** — anaphors and hedges become absolute world-facts; web search “contradicts” nuance → `incorrect`.
5. **Verdict enum is coarse** (`correct | incorrect | unsure`) — no `not_a_claim` / `needs_context`.
6. **Full wipe every run** — expensive, destructive, and Activity still lists every extracted line so the pipeline *feels* noisy even when underlines are fewer.
7. **Default extract + judge = `gpt-5-nano`** — same small model for hard jobs.

---

## What should be done

### Claim taxonomy (extract must emit a kind)

| Kind | Web-check? |
|------|------------|
| `atomic_fact` / `numeric_fact` / `mechanism` / `causal` / `api_behavior` | Yes, if consequential |
| `definition` | Only if asserted as domain truth, not local glossary |
| `local_definition` / `opinion` / `pedagogy_meta` / `context_dependent` / `illustration` / `fragment` | Never web; drop or gaps-only |

### Gating stages (replace prompt-only trust)

1. **Structured extract** — `text`, span/offsets, `kind`, `standalone`.
2. **Hard filters** — length, no verb, questions, heading-like, pedagogy denylist.
3. **Two Decisions (or richer predicate)** — `is_checkable` ∧ `is_consequential` ∧ ¬`needs_context`.
4. **Context-packed judge** — claim + ±1–2 paragraphs; refuse `incorrect` if under-specified → `needs_context` / `unsure`.
5. **UI policy** — underline only consequential kinds with at least one usable source.
6. **Human dismiss** — “not a claim” / false flag → persist so re-check doesn’t re-flag.

### Product split (enforce in schema, not only prompts)

| System | Job |
|--------|-----|
| Fact-check | Truth of world/system assertions |
| Gaps | Missing concepts / pedagogy / coverage |

---

## Failure modes (design-level)

**False positives:** pedagogy judged incorrect; context-free hedges; domain notes about chunking; wrong `indexOf` span; nano ignoring skip rules.

**False negatives:** score ≤ 0.8 never stored (invisible miss); soft 12×chunks miss dense notes; `skipCode` drops API facts in fences; mid-stream wipe leaves incomplete sets.

---

## Ideal vs today (short)

| Capability | Today | Target |
|------------|-------|--------|
| Note context in judge | Claim only | Claim + local window |
| Claim kinds / scores | Not stored | Persist + gate on them |
| Incremental re-check | Full delete | Dirty claims only |
| Cache | None | Claim + context hash |
| Human feedback | Read-only hover | Dismiss / confirm |
| Budget | Soft prompts | Hard max claims/note + spend caps |

See [03-goals-and-roadmap.md](./03-goals-and-roadmap.md) for sequenced implementation.
