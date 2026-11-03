# Learning System

A private learning notebook that fact-checks your writing and points out
important concepts you missed without writing notes for you.

## Getting Started

```bash
bun install
cp .env.sample .env
# fill in every value in .env
bun run db:migrate
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

```dotenv
DATABASE_URL=postgresql://...
APP_PASSWORD=your-login-password
AUTH_SECRET=a-long-random-string
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6-luna
```

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Bun
- Neon (Postgres) + Drizzle ORM
- TipTap editor
- Zod
- OpenAI Responses API

## Database

Schema lives in `src/db/schema.ts`. Client: `@/db` (Neon HTTP via `@neondatabase/serverless`).

The generated migration includes weighted Postgres full-text search over note
titles and plain text. Neon retired `pg_search` in September 2026, so this app
uses the PRD's built-in Postgres fallback rather than a removed extension.

```bash
bun run db:generate  # create migrations
bun run db:migrate   # apply migrations
bun run db:push      # sync directly during local development
bun run db:studio    # browse data
```

## Features

- Unlimited nested directories and notes
- One-second autosave with Draft and Published states
- Soft-delete batches, recursive Trash restore, and permanent deletion
- TipTap JSON storage, Markdown shortcuts, and highlighted code blocks
- Weighted full-text search with `Cmd/Ctrl + K`
- Streamed claim-by-claim web fact-checking with inline flags and sources
- Persistent “What’s missing” checklist generated on publish
- Single-user password gate
