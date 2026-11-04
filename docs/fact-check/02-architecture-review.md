# Architecture review

## System as-is

| Layer | Reality |
|-------|---------|
| UI | Workspace → Sidebar / NoteEditor / Search / Settings / Trash; TipTap + claim decorations; Activity NDJSON panel |
| Auth | Email/password (scrypt), HMAC session cookie; no server session store / revocation |
| API | Route handlers for notes, directories, tree, trash, search, checklist, auth, providers |
| AI | `src/lib/ai.ts` — sparse extract (≤8) → Decisions **P(likely wrong)** (+ context) → ≤5 context-packed web judges; gaps = separate structured call |
| Providers | BYOK; **GPT only** enabled (`OpenRouter` code present but disabled) |
| DB | Neon + Drizzle: users, directories, notes, claims, checklist_items, provider_credentials |

### Trust boundaries

- Handlers filter by `userId`; keys encrypted at rest (AES-GCM); Responses `store: false`.
- **Weak spots:** stolen session can burn BYOK with **no rate limit**; overlapping fact-check POSTs can race after claim wipe; long runs live in one HTTP stream (timeout / disconnect → incomplete + wiped claims).

### Migration drift

Committed `drizzle/0000_*.sql` predates users / BYOK. Auth tables may exist only via `db:push` / one-off scripts. Fresh `db:migrate` alone may not match `schema.ts`.

---

## Strengths

- Product bet is encoded in code: sparse incorrect underlines, likely-wrong gate + hard web/extract caps, context-packed judge, skip writing-quality criticism.
- Small coherent codebase; streaming Activity UI makes the pipeline legible.
- Soft-delete / trash restore and empty-overwrite guards are practical.
- BYOK + no env OpenAI fallback matches the cost/privacy story.

---

## Engineering gaps (what’s missing)

| Gap | Why it hurts fact-check / learning |
|-----|-------------------------------------|
| **No tests / eval harness** | Prompt changes are guesswork; cannot measure precision of “only real falsehoods” |
| **No observability / usage rows** | Cannot see spend, step latency, or which stage fails |
| **No daily rate limits / spend caps** | Per-run web ≤5 helps; BYOK can still be burned by loops or a stolen cookie |
| **Destructive full re-runs** | Wipe-all then re-insert; concurrent or timed-out runs lose good claims |
| **No job/run_id lock** | UI disables one button; multi-tab still races |
| **No incremental / cache** | Every publish re-pays extract + web for unchanged text |
| **No prompt version on rows** | Cannot attribute quality regressions |
| **Substring claim anchors** | `indexOf` can underline the wrong occurrence |
| **Checklist append-only** | “Analyze again” accumulates stale half-baked gaps |
| **Publish ≠ gaps** | README/product expectation drift; published ≠ “coverage checked” |

---

## What you (founder) likely missed

These are product/ops blind spots that show up as “fact-check feels dumb” and “gaps feel half-baked”:

1. **No labeled golden set** of good claims / bad claims / must-not-flag meta — without it you cannot tune the 0.8 gate or prompts.
2. **No dismiss feedback** on false flags — nowhere for the product to learn or suppress repeats.
3. **No topic / learning-goal anchor** on note or directory — gaps invent a syllabus from one truncated body.
4. **No note-to-note links** — coverage across the tree is invisible; gaps re-ask for concepts already written elsewhere.
5. **Thin provenance** — `{title, url}` only; no quote/snippet; hard to trust an `incorrect` mark.
6. **No cost dashboard** — Decisions + capped web search still opaque; you cannot prove the gate saves money without `ai_usage`.
7. **Honor-system checklist** — ticking “What’s missing” does not verify the note was updated.
8. **Same model for extract, judge, and gaps** — nano is a poor curriculum reviewer and a risky web judge.

---

## Target architecture (lean)

Do **not** build a multi-service platform. Harden the middle of what you already have:

```
Client ──NDJSON──► FactCheckRun (run_id, note_id, content_hash, status, prompt_version)
                      │
                      ├─ lock note (no concurrent runs)
                      ├─ extract dirty chunks only (cache by chunk hash)
                      ├─ decide (checkable ∧ consequential ∧ ¬needs_context)
                      ├─ judge with local context; reuse cache by claim+context hash
                      └─ swap claims in a transaction on success only

GapsRun: topic_anchor + note_hash → structured gaps + reconcile/stale policy

Minimal side tables:
  ai_cache, ai_usage, claim_feedback, eval fixtures (files or table)
```

**Principle:** trustworthy sparse fact-check = gate + context + evidence + human feedback + eval — not more UI chrome or more models first.

Optional later: background worker **only if** HTTP timeouts appear after locks + incremental runs.

---

## Explicit non-priorities (now)

- Dialog polish / sidebar cosmetics as a substitute for quality.
- “Chat with your notes.”
- Re-enabling OpenRouter before eval + cost comparison.
- Heavy queues / multi-region / CRDT editing.

---

## Verdict

The architecture already points at the right product. The gap is **measurement, safe re-runs, feedback, topic anchoring, context-aware judging, and provenance** — so red underlines and gap items become sparse enough that you trust them while learning.

Detailed sequencing: [03-goals-and-roadmap.md](./03-goals-and-roadmap.md).
