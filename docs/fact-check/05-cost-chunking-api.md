# Cost, chunking, and unnecessary API calls

## Call inventory

| Trigger | Path | Paid AI? |
|---------|------|----------|
| Fact-check / after publish | extract (per chunk) → Decisions → web judge (per claim) | Yes |
| Publish itself | `POST .../publish` | No (DB only) |
| Analyze gaps | `findMissingTopics` once | Yes |
| Autosave | `PATCH` note + claim stale SQL | No |
| After each save | `GET /api/tree` | No (but chatty) |
| Settings open | `GET .../providers/status` → `/models` probe | Tiny |

**Example medium note** (~6k chars, ~10 extracted, ~4 above 0.8): ~3 extract + 1 Decisions + 4 web judges ≈ **8 paid calls**. Unchanged re-publish pays that again.

---

## Chunking today

| Stage | Behavior |
|-------|----------|
| Extract | Pack paragraphs into ≤ **2800** chars; oversize slices hard-cut; concurrency 2; soft ≤12 claims **per chunk** |
| Gaps | **No chunking** — `slice(0, 8000)` head only |
| Decisions | Batches of 40 |
| Judge | One claim string; no note context packing |

This is **length packing**, not semantic chunking. Claims on boundaries can be missed; long notes inflate extract count (`12 × chunks` before dedupe).

### Better chunking (for this TipTap app)

1. Split on **headings / list blocks** from TipTap JSON, then pack.
2. Keep **offsets** for incremental dirty-chunk extract.
3. Small overlap (~100–200 chars) if still using char packs.
4. Gaps: map/reduce per section or head+tail — don’t drop the end of the note.
5. Judge: pack claim + local window; optionally batch 3–5 related claims per web call.

---

## Unnecessary / duplicate spend

| Issue | Impact |
|-------|--------|
| Full wipe + re-extract every fact-check | Dominates cost on edits |
| Publish always chains full fact-check | Clean re-publish = full bill |
| One web Responses call per claim | Linear in high-score claims |
| Gaps always full LLM; checklist only string-dedupes | “Analyze again” with no edits still pays |
| Gaps without save-first | Confused re-clicks → duplicate analyses |
| Decisions scores every extract including junk that slipped prompts | Extra Luna batches |

Already helpful: Decisions gate at > 0.8; gaps 500-char gate; judge concurrency 2 (rate, not count).

---

## Target cheaper pipeline

```
TipTap → structural chunks + content hash
      → extract dirty chunks only (cheap model)
      → heuristic drop (questions, “I feel”, headings)
      → Decisions: checkable ∧ consequential ∧ ¬needs_context
      → cache lookup (normalized claim + context hash)
      → batch web verify misses only
```

Publish: fact-check only if dirty / incomplete / hash changed / explicit opt-in.

---

## Reduction tactics (ranked for this repo)

| Rank | Tactic | Est. impact |
|------|--------|-------------|
| 1 | Incremental hashes; keep stable verdicts | 50–90% on small edits / re-publish |
| 2 | Decouple clean re-publish from full fact-check | ~100% LLM on no-op re-publish |
| 3 | Batch web judges | N → N/k web calls |
| 4 | Verdict cache by claim+context | High on repeats |
| 5 | Stricter / dual gate after eval | Cuts web $; measure with fixtures |
| 6 | Dirty-chunk extract only | Fewer extract Responses |
| 7 | Gaps hash + skip if unchanged; save first | Removes repeat gap calls |
| 8 | Stronger extract / careful judge models; keep gate cheap | Quality + selective spend |
| 9 | Don’t `loadTree` on every autosave | API/DB only |
| 10 | TTL cache provider status probe | Negligible $ |

**Do not** chase higher `JUDGE_CONCURRENCY` as a cost win — faster, not fewer.

---

## Model routing recommendation

| Job | Want |
|-----|------|
| Extract | Better-than-nano structured extract (kinds + spans) |
| Gate | Keep Decisions / small classifier — **strict** |
| Web judge | Stronger model + context; few calls |
| Gaps | Mid/stronger curriculum model; no web unless you add grounded syllabus later |

Wire per-task overrides in settings once `ai_usage` exists (see roadmap Phase 1–2).
