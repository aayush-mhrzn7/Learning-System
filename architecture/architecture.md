# Scholar architecture

Scholar is a single Next.js app (App Router) that holds both the UI and the API. It stores data in Neon Postgres through Drizzle, stores uploaded media in S3-compatible storage, sends email over SMTP, and calls OpenAI-compatible LLM providers for AI features.

## System overview

```mermaid
flowchart LR
  user([User browser])

  subgraph next["Next.js app (App Router)"]
    direction TB
    proxy["proxy.ts<br/>session check on every request"]

    subgraph ui["UI (React client components)"]
      pages["Pages<br/>/ · /login · /signup<br/>/forgot-password · /trash"]
      workspace["Workspace<br/>sidebar · note editor (Tiptap)<br/>knowledge graph (d3) · visualize<br/>inline chat · search · settings · usage"]
      pages --> workspace
    end

    subgraph api["API route handlers /api"]
      authApi["auth<br/>signup · login · logout<br/>forgot / reset password"]
      contentApi["content<br/>notes · directories · tree<br/>trash · search · checklist<br/>graph · graph/links"]
      aiApi["AI per note<br/>fact-check · gaps · visualize<br/>inline-chat · publish"]
      mediaApi["media<br/>uploads · media/[...key]"]
      settingsApi["settings<br/>providers · providers/status · usage"]
      healthApi["health/db"]
    end

    subgraph lib["Shared libs (src/lib)"]
      authLib["auth.ts<br/>HMAC-signed session cookie"]
      pwLib["password.ts · otp.ts"]
      aiLib["ai.ts<br/>claims · judges · visualize<br/>inline answer · gaps"]
      providers["providers.ts<br/>provider-credentials.ts<br/>credentials-crypto.ts"]
      usageLib["ai-usage.ts"]
      s3Lib["s3.ts"]
      mailLib["mail/<br/>templates · transport"]
    end

    dbLayer["db/ (Drizzle ORM + schema)"]
  end

  neon[("Neon Postgres")]
  s3[("S3-compatible<br/>object storage")]
  smtp["SMTP server"]
  llm["LLM providers<br/>OpenAI · OpenRouter<br/>(Responses API + web search)"]

  user --> proxy
  proxy --> pages
  proxy --> api
  workspace -- "fetch / stream" --> api

  authApi --> authLib
  authApi --> pwLib
  authApi --> mailLib
  aiApi --> aiLib
  aiApi --> usageLib
  settingsApi --> providers
  settingsApi --> usageLib
  mediaApi --> s3Lib
  aiLib --> providers

  authLib -.-> proxy
  api --> dbLayer
  usageLib --> dbLayer
  providers --> dbLayer
  dbLayer --> neon
  s3Lib --> s3
  mailLib --> smtp
  aiLib --> llm
```

## Request and auth flow

```mermaid
sequenceDiagram
  actor U as User
  participant P as proxy.ts
  participant A as /api/auth/*
  participant DB as Neon Postgres
  participant M as SMTP

  U->>A: POST signup / login
  A->>DB: create user or verify password hash
  A-->>U: Set learning_session cookie (userId.expiry.HMAC)
  opt Signup
    A->>M: Welcome email
  end

  U->>P: Any page or API request
  P->>P: Verify cookie signature and expiry
  alt Valid session
    P-->>U: Pass through to page or route handler
  else No session
    P-->>U: Redirect to /login (pages) or 401 (API)
  end

  U->>A: POST forgot-password
  A->>DB: Store hashed OTP, attempts counter
  A->>M: Reset OTP email
  U->>A: POST reset-password with OTP
  A->>DB: Check OTP hash, update password
```

## AI fact-check pipeline

```mermaid
flowchart TD
  start([Editor requests fact-check]) --> route["POST /api/notes/:id/fact-check"]
  route --> creds["Load user's provider credentials<br/>(decrypt API key)"]
  creds --> extract["extractClaims<br/>cap on claims per note"]
  extract --> decide["decideClaims<br/>local context + likely-wrong gate"]
  decide --> gate{"Likely wrong?"}
  gate -- "no" --> keep["Keep as unchecked / ok"]
  gate -- "yes" --> web["judgeClaim with web search<br/>(capped by MAX_WEB_JUDGES)"]
  web --> save[("claims table<br/>text · reason · sources")]
  keep --> save
  route --> usage[("ai_usage table<br/>tokens · latency · tool calls")]
  save --> flags["Editor shows claim flags"]
```

Other AI routes follow the same shape: load credentials, call `ai.ts`, record usage.

| Route | Function in `ai.ts` | Result |
|-------|---------------------|--------|
| `gaps` | `findMissingTopics` | Missing-topic suggestions |
| `visualize` | `streamVisualizeTurn` | Streamed diagram turns, saved on the note |
| `inline-chat` | `answerInlineSelection` | Answer about selected text |

## Data model

```mermaid
erDiagram
  users ||--o{ password_resets : has
  users ||--o{ directories : owns
  users ||--o{ notes : owns
  users ||--o{ note_links : owns
  users ||--o{ provider_credentials : configures
  users ||--o{ ai_usage : generates
  directories ||--o{ directories : "parent of"
  directories ||--o{ notes : contains
  notes ||--o{ note_links : "source"
  notes ||--o{ note_links : "target"
  notes ||--o{ claims : has
  notes ||--o{ checklist_items : has

  users {
    uuid id
    text email
    text password_hash
  }
  password_resets {
    text otp_hash
    int attempts
  }
  directories {
    text name
    uuid parent_id
  }
  notes {
    text title
    jsonb content
    text plain_text
    jsonb visualize
  }
  note_links {
    uuid source_id
    uuid target_id
  }
  claims {
    text claim_text
    text reason
    jsonb sources
  }
  checklist_items {
    text text
  }
  provider_credentials {
    text model
    text base_url
    text api_key_ciphertext
  }
  ai_usage {
    text task
    text model
    int total_tokens
    int latency_ms
  }
```

## Notes

- **Sessions:** a custom HMAC-signed cookie (`learning_session`, 30 days), checked in `src/proxy.ts`. There is no third-party auth library.
- **Provider keys:** each user brings their own API key. It is stored encrypted (`credentials-crypto.ts`) and the base URL is checked against an allowlist of provider hosts.
- **Database client:** Neon HTTP driver, forced to IPv4, created lazily and cached on `globalThis`.
- **Soft delete:** the trash routes restore or purge deleted notes and directories by batch.
- **Further reading:** pipeline details are in `docs/fact-check/`.
