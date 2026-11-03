# Learning System — Todo

## LLM caching

Cache model responses so we spend less time and send less context.

- Cache claim extraction and fact-check verdicts keyed by claim text + note hash.
- Cache “What’s missing” results keyed by normalized note plain text.
- Reuse cached hits instead of re-sending the full note when content is unchanged.
- Keep the cache design simple: local DB table or KV, TTL, and invalidate on edit/publish.

## Better dialogs

Polish create / rename / delete / trash / link dialogs.

- Clearer titles and short helper copy.
- Consistent button placement and keyboard focus.
- Fewer dead ends when a request fails (inline error + retry).

## What’s missing quality

Responses are often incomplete, generic, or low quality.

- Tighten the prompt so gaps stay note-specific and learning-related.
- Reject vague checklist items (“add more detail”, “define terms”).
- Handle empty / partial / failed model output cleanly in the UI.
- Cap and validate returned items before saving.

## Publish / fact-check vs What’s missing

Publishing and fact-checking do not trigger “What’s missing”.

- Decide the intended flow: keep manual “Analyze gaps”, or also run on publish.
- If publish should trigger it, wire that back without running on every tiny republish.
- Fact-check success should not imply gaps were analyzed.

## Squiggly hover bug

Fact-check underline hover popover sticks around while editing Markdown / TipTap content.

- Popover should dismiss on mouse leave, scroll, edit, and note switch.
- Stale claims should not keep a floating popover open after the underline moves or dims.

## Provider cost and OpenRouter

Direct ChatGPT / OpenAI usage is too expensive right now on a ~$5 plan.

- Treat OpenAI as optional / premium while keeping a cheaper default path.
- Add OpenRouter support (target about a $10 plan) as a lower-cost provider.
- Let users choose between ChatGPT (OpenAI) and OpenRouter.
- Allow picking different models per provider (and ideally per task: fact-check vs gaps).
- Document cost tradeoffs and recommend cheaper models for extraction / bulk judging.

## Settings dialog + BYOK

Add a settings UI (dialog or page) for AI providers instead of env-only config.

- Settings for active provider, default models, and task-specific model overrides.
- BYOK: users paste their own OpenAI and/or OpenRouter API keys.
- Store keys securely (never commit; prefer encrypted/server-only storage, not localStorage plaintext).
- Validate keys with a lightweight test call and show clear failure states.
- Keep server routes using the selected provider + key so secrets never hit the client beyond the settings form.
