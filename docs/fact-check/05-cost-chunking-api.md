# Cost, chunking, and unnecessary API calls

## Call inventory

| Trigger | Path | Paid AI? |
|---------|------|----------|
| Fact-check / after publish | extract (per chunk) → Decisions → web judge (≤5) | Yes |
| Publish itself | `POST .../publish` | No (DB only) |
| Analyze gaps | `findMissingTopics` once | Yes |
| Autosave | `PATCH` note + claim stale SQL | No |
| After each save | `GET /api/tree` | No (but chatty) |
| Settings open | `GET .../providers/status` → `/models` probe | Tiny |

**Example medium note** (sparse extract ≤8, 1–2 likely-wrong above 0.8): ~1–3 extract + 1 Decisions + **≤5** web judges (often 1–2). Unchanged re-publish still pays extract + Decisions again until incremental hashes land.

Hard caps in `src/lib/ai.ts`: `MAX_EXTRACTED_CLAIMS = 8`, `MAX_WEB_JUDGES = 5`, `CLAIM_WEB_CHECK_THRESHOLD = 0.8` on **P(likely wrong)**.

---

## Chunking today

| Stage | Behavior |
|-------|----------|
| Extract | Pack paragraphs into ≤ **2800** chars; oversize slices hard-cut; concurrency 2; soft ≤5 suspicious claims **per chunk**; hard **≤8** total |
| Gaps | **No chunking** — `slice(0, 8000)` head only |
| Decisions | Batches of 40; each item can include ±1-paragraph `context` |
| Judge | Claim + ±2 paragraphs (`localClaimContext`); concurrency 2; **≤5** claims/run |

This is still **length packing**, not semantic / TipTap structural chunking.

### Better chunking (for this TipTap app)

1. Split on **headings / list blocks** from TipTap JSON, then pack.
2. Keep **offsets** for incremental dirty-chunk extract.
3. Small overlap (~100–200 chars) if still using char packs.
4. Gaps: map/reduce per section or head+tail — don’t drop the end of the note.
5. Judge: optionally batch 3–5 related claims per web call (today: one claim per call, capped at 5).

---

## Gate design (why web count dropped)

| Old (noisy) | Current |
|-------------|---------|
| Decisions ≈ “is this checkable?” → almost every tutorial sentence PASSed | Decisions = **“is this likely factually WRONG?”** (+ note context) |
| Unsure → prefer web-check | Unsure → prefer **skip** (save $) |
| Web = all PASSes (often 40+) | Web = PASS ∧ score-sorted ∧ **top 5** |

Smoke expectation on a Semantic Chunking note with one planted false definition: extract a handful of lines, Decisions PASSes mainly the false one, **1 web call** (or a few), red underline only on the falsehood.

---

## Unnecessary / duplicate spend (still open)

| Issue | Impact |
|-------|--------|
| Full wipe + re-extract every fact-check | Dominates cost on edits |
| Publish always chains full fact-check | Clean re-publish = extract + Decisions (+ ≤5 web) |
| Gaps always full LLM; checklist only string-dedupes | “Analyze again” with no edits still pays |
| Gaps without save-first | Confused re-clicks → duplicate analyses |
| One web Responses call per remaining claim | Bounded by `MAX_WEB_JUDGES`, not eliminated |

Already helpful: likely-wrong gate; extract + web hard caps; gaps 500-char gate; judge concurrency 2 (rate, not count); context-packed judge (fewer false `incorrect`s that waste attention).

---

## Target cheaper pipeline

```
TipTap → structural chunks + content hash
      → extract dirty chunks only (cheap model, kinds)
      → heuristic drop (questions, fluff, illustrations)
      → Decisions: P(likely wrong) with local context
      → top-K web verify (K ≤ 5) + cache by claim+context hash
```

Publish: fact-check only if dirty / incomplete / hash changed / explicit opt-in.

---

## Reduction tactics (ranked for this repo)

| Rank | Tactic | Est. impact | Status |
|------|--------|-------------|--------|
| 1 | Incremental hashes; keep stable verdicts | 50–90% on small edits / re-publish | Open |
| 2 | Decouple clean re-publish from full fact-check | ~100% LLM on no-op re-publish | Open |
| 3 | Likely-wrong gate + max 5 web + max 8 extract | Large cut vs “check everything checkable” | **Shipped** |
| 4 | Batch web judges | N → N/k web calls | Open |
| 5 | Verdict cache by claim+context | High on repeats | Open |
| 6 | Dirty-chunk extract only | Fewer extract Responses | Open |
| 7 | Gaps hash + skip if unchanged; save first | Removes repeat gap calls | Open |
| 8 | Stronger extract / careful judge models; keep gate cheap | Quality + selective spend | Open |
| 9 | Don’t `loadTree` on every autosave | API/DB only | Open |
| 10 | TTL cache provider status probe | Negligible $ | Open |

**Do not** chase higher `JUDGE_CONCURRENCY` as a cost win — faster, not fewer.

---

## Model routing recommendation

| Job | Want |
|-----|------|
| Extract | Better-than-nano structured extract (kinds + spans); stay sparse |
| Gate | Keep Decisions — **likely-wrong** predicate, strict |
| Web judge | Stronger model + context; few calls (≤5) |
| Gaps | Mid/stronger curriculum model; no web unless you add grounded syllabus later |

Wire per-task overrides in settings once `ai_usage` exists (see roadmap Phase 1–2).
