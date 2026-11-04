# Fact-check & learning quality docs

Research notes for this repo (fact-check pipeline, gaps, LLM cost, architecture). **Primary goal:** flag real learner falsehoods (with evidence), not tutorial fluff — and **burn web search only on claims that look likely wrong**.

| Doc | Purpose |
|-----|---------|
| [01-current-flow.md](./01-current-flow.md) | How the pipeline works **today** (caps, likely-wrong gate, context judge), what’s left |
| [02-architecture-review.md](./02-architecture-review.md) | System as-is, engineering gaps, founder misses, target shape |
| [03-goals-and-roadmap.md](./03-goals-and-roadmap.md) | North-star goal + sequenced steps (P0 → P2) |
| [04-gaps-and-learning.md](./04-gaps-and-learning.md) | “What’s missing” quality + how notes get better |
| [05-cost-chunking-api.md](./05-cost-chunking-api.md) | Call inventory, chunking, spend controls |

Related: [`todo/improvements.md`](../../todo/improvements.md) (older backlog; several items still open).

**Code anchors:** `src/lib/ai.ts` (`MAX_EXTRACTED_CLAIMS`, `MAX_WEB_JUDGES`, `localClaimContext`, `decideClaims`, `judgeClaim`), `src/app/api/notes/[id]/fact-check/route.ts`, `src/app/api/notes/[id]/gaps/route.ts`, `src/components/note-editor.tsx`, `src/components/claim-flags.ts`.
