# Current fact-check flow — and what should be done

## Product intent (keep this)

Fact-check should be **sparse and consequential**:

- **Yes:** a learner asserts something false about the world (e.g. “semantic chunking means chunking by character length”) → red underline + short reason + source.
- **No:** ordinary true tutorial facts, RAG pipeline steps, soft “common approach” lines, example walkthrough narration, pedagogy / writing-meta (gaps territory).

**Web spend goal:** paid `web_search` judges only for claims that look **likely wrong** — not for every checkable sentence.

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

Activity copy: Decisions is labeled **likely-wrong > 0.8**; web step only runs for claims that PASS that gate (capped).

### Server (`fact-check/route.ts` + `ai.ts`)

Constants (see `src/lib/ai.ts`):

| Constant | Value | Role |
|----------|-------|------|
| `EXTRACT_CHUNK_CHARS` | 2800 | Length-pack paragraphs for extract |
| `MAX_EXTRACTED_CLAIMS` | **8** | Hard cap after dedupe |
| `CLAIM_WEB_CHECK_THRESHOLD` | **0.8** | Web only if P(likely wrong) > this |
| `MAX_WEB_JUDGES` | **5** | Hard cap; highest scores first |
| `JUDGE_CONCURRENCY` | 2 | Parallel web judges (rate, not count) |

Pipeline:

1. Auth + GPT BYOK credentials (OpenRouter disabled).
2. `documentToText(content, { skipCode: true })` — code fences dropped.
3. Set `notes.factCheckIncomplete = true`.
4. **`extractClaims`** — sparse prompt (suspicious / high-risk only; skip ordinary true tutorial + pipeline steps); chunk ~2800 chars, concurrency 2; soft ≤5 per passage; **hard stop at 8** total.
5. **`DELETE FROM claims WHERE note_id = …`** — full wipe every run (still destructive).
6. **`decideClaims(noteText)`** — OpenAI Decisions (`gpt-6-luna`), batches of 40. Predicate: **“is this claim likely factually WRONG?”** Evidence includes optional ±1-paragraph `context` from `localClaimContext`. When unsure, prefer **skip** (save cost).
7. Keep claims with **score > 0.8**, sort by score desc, take at most **`MAX_WEB_JUDGES` (5)**.
8. **`judgeClaim(claim, localClaimContext(noteText, claim))`** — concurrency 2, **with web search**. Input = claim + ±2 paragraphs. Policy: interpret demos in context; no `incorrect` without ≥1 source (else coerce to `unsure`).
9. Insert only successfully judged rows (`claimText`, `verdict`, `reason`, `sources`). Score / kind / offsets **not stored**.
10. `factCheckIncomplete = (any judge failed)`.

### LLM / API calls per run

| Stage | Call | Default model | Notes |
|-------|------|---------------|-------|
| Extract | Responses, no tools | User model (`gpt-5-nano`) | 1 call per text chunk |
| Gate | Decisions API | `gpt-6-luna` | 1 call per ≤40 claims; scores **P(likely wrong)** |
| Judge | Responses + `web_search` | Same user model | **≤5 calls** (cap), only high-suspicion |

Gaps (`findMissingTopics`) are a **separate** manual route — not part of this pipeline.

### Render (`claim-flags.ts`)

- Locate claim text with exact match, then flexible-whitespace regex if needed.
- Underline **only** `verdict === "incorrect"`.
- `correct` / `unsure` / skipped-by-gate claims are not underlined (skipped never hit the DB).

### Related editor UI (not in this pipeline)

- **Minimap** — Settings → Editor → Document minimap; claim markers for incorrect decorations.
- **Inline chat** — selection chip / ⌘K; UI only (no model yet).

---

## What improved recently (vs older docs)

| Area | Was | Now |
|------|-----|-----|
| Judge input | Claim string only | Claim + ±2 paragraph note window |
| Decisions question | “Worth a web check?” / fluff invert → almost everything PASSed | **“Likely factually wrong?”** + context; unsure → skip |
| Extract volume | Soft ≤12 × chunks → 50+ claims | Suspicious-only prompt + **max 8** |
| Web budget | Linear in PASSes (often 40+) | **Max 5** web judges / run |
| Incorrect policy | Could mark incorrect with empty sources | Coerce sourceless `incorrect` → `unsure` |

---

## Remaining failure modes

1. **Extract schema is still only `{ text }`** — no `kind` / offsets; nano can still over- or under-extract.
2. **Chunking is length packing**, not TipTap structure.
3. **Decisions can mis-score** — hard caps bound damage; golden eval still missing.
4. **Full wipe every run** — concurrent / timed-out runs can leave incomplete claim sets.
5. **Substring anchors** — wrong span if the same sentence repeats.
6. **Publish always chains full fact-check** — clean re-publish still pays extract + Decisions (+ up to 5 web).

---

## What should be done next

### Still open (roadmap)

1. **Structured extract kinds** + hard drop before Decisions ([taxonomy below](#claim-taxonomy-extract-must-emit-a-kind)).
2. **Run lock / transactional claim swap** — stop mid-flight wipe races.
3. **Golden eval set** — must-flag / must-not-flag fixtures.
4. **Dismiss feedback** on hover.
5. **Incremental / hash** — don’t re-judge unchanged text.
6. **Claim offsets** — decorate by range, not `indexOf`.

### Claim taxonomy (extract must emit a kind)

| Kind | Web-check? |
|------|------------|
| `atomic_fact` / `numeric_fact` / `mechanism` / `causal` / `api_behavior` | Only if Decisions says likely-wrong |
| `definition` | Only if asserted as domain truth and looks suspicious |
| `local_definition` / `opinion` / `pedagogy_meta` / `context_dependent` / `illustration` / `fragment` | Never web; drop or gaps-only |

### Product split

| System | Job |
|--------|-----|
| Fact-check | Truth of world/system assertions that look wrong |
| Gaps | Missing concepts / pedagogy / coverage |

See [03-goals-and-roadmap.md](./03-goals-and-roadmap.md) for sequenced implementation.
