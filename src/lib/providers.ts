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

/** Official hosts only — custom baseUrl is never trusted (SSRF / key exfil). */
const ALLOWED_PROVIDER_HOSTS: Record<ProviderId, ReadonlySet<string>> = {
  gpt: new Set(["api.openai.com"]),
  openrouter: new Set(["openrouter.ai"]),
};

function isBlockedHostnameOrIp(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  // IPv4 (incl. dotted-decimal metadata / private / link-local)
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }

  // IPv6 loopback / link-local / ULA
  if (
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("::ffff:127.") ||
    host.startsWith("::ffff:10.") ||
    host.startsWith("::ffff:192.168.") ||
    host.startsWith("::ffff:169.254.")
  ) {
    return true;
  }

  return false;
}

/** Canonical official base URL for a provider (no user override). */
export function canonicalProviderBaseUrl(provider: ProviderId): string {
  return PROVIDER_DEFAULTS[provider].baseUrl.replace(/\/$/, "");
}

/**
 * Returns true when baseUrl is an allowlisted official provider URL.
 * Rejects non-https, wrong hosts, and private/link-local/metadata IPs.
 */
export function isAllowedProviderBaseUrl(
  provider: ProviderId,
  baseUrl: string,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== "443") return false;
  const host = parsed.hostname.toLowerCase();
  if (isBlockedHostnameOrIp(host)) return false;
  if (!ALLOWED_PROVIDER_HOSTS[provider].has(host)) return false;

  const path = parsed.pathname.replace(/\/$/, "") || "";
  const canonical = new URL(PROVIDER_DEFAULTS[provider].baseUrl);
  const canonicalPath = canonical.pathname.replace(/\/$/, "") || "";
  return path === canonicalPath && !parsed.search && !parsed.hash;
}

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export function isEnabledProviderId(value: string): value is EnabledProviderId {
  return (ENABLED_PROVIDER_IDS as readonly string[]).includes(value);
}

export type ResolvedProviderCredentials = {
  userId: string;
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
};
