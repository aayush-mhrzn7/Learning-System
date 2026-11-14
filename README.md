# Scholar

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
AUTH_SECRET=a-long-random-string
CREDENTIALS_ENCRYPTION_KEY= # openssl rand -base64 32
```

Provider API keys and models are configured only in **Settings → Providers**
(BYOK). They are encrypted with `CREDENTIALS_ENCRYPTION_KEY` and stored per
user in Postgres — there is no env-based OpenAI fallback.

Create an account at `/signup`, or seed an owner and attach existing rows:

```bash
MIGRATE_EMAIL=you@example.com MIGRATE_PASSWORD='…' bun run db:migrate-auth-user
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
- Email/password signup and login (content scoped per user)
