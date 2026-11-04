# Fact-check & learning quality docs

Research notes from a multi-agent review of this repo (fact-check pipeline, gaps, LLM cost, architecture). **Primary goal:** make fact-check trustworthy and sparse — flag real falsehoods (e.g. a wrong claim about semantic chunking), not random sentence fragments that look “wrong” out of context.

| Doc | Purpose |
|-----|---------|
| [01-current-flow.md](./01-current-flow.md) | How the pipeline works today, why noise happens, what should change |
| [02-architecture-review.md](./02-architecture-review.md) | System as-is, engineering gaps, founder misses, target shape |
| [03-goals-and-roadmap.md](./03-goals-and-roadmap.md) | North-star goal + sequenced steps (P0 → P2) |
| [04-gaps-and-learning.md](./04-gaps-and-learning.md) | “What’s missing” quality + how notes get better |
| [05-cost-chunking-api.md](./05-cost-chunking-api.md) | Call inventory, chunking, how to cut unnecessary LLM spend |

Related: [`todo/improvements.md`](../../todo/improvements.md) (older backlog; several items still open).

**Code anchors:** `src/lib/ai.ts`, `src/app/api/notes/[id]/fact-check/route.ts`, `src/app/api/notes/[id]/gaps/route.ts`, `src/components/note-editor.tsx`, `src/components/claim-flags.ts`.
