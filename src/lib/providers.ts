export const PROVIDER_IDS = ["gpt", "openrouter"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** OpenRouter is disabled for now — ChatGPT only. */
export const ENABLED_PROVIDER_IDS = ["gpt"] as const;

export type EnabledProviderId = (typeof ENABLED_PROVIDER_IDS)[number];

/** OpenAI Decisions API model (scoring gate before web fact-check). */
export const DECISIONS_MODEL = "gpt-6-luna";

export const PROVIDER_DEFAULTS: Record<
  ProviderId,
  { model: string; baseUrl: string }
> = {
  gpt: {
    model: "gpt-5-nano",
    baseUrl: "https://api.openai.com/v1",
  },
  openrouter: {
    // Free model; web search via OpenRouter server tool (search fees apply).
    // Gemma :free is often upstream rate-limited; Nemotron has been more available.
    model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    baseUrl: "https://openrouter.ai/api/v1",
  },
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export function isEnabledProviderId(value: string): value is EnabledProviderId {
  return (ENABLED_PROVIDER_IDS as readonly string[]).includes(value);
}

export type ResolvedProviderCredentials = {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
};
