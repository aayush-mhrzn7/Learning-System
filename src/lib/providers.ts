export const PROVIDER_IDS = ["gpt", "openrouter"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_DEFAULTS: Record<
  ProviderId,
  { model: string; baseUrl: string }
> = {
  gpt: {
    model: "gpt-5.6-luna",
    baseUrl: "https://api.openai.com/v1",
  },
  openrouter: {
    model: "openai/gpt-4.1-mini",
    baseUrl: "https://openrouter.ai/api/v1",
  },
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export type ResolvedProviderCredentials = {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
  /** OpenAI Responses web_search is only reliable on OpenAI's API. */
  supportsWebSearch: boolean;
};
