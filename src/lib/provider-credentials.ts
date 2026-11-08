import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { providerCredentials } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/credentials-crypto";
import {
  ENABLED_PROVIDER_IDS,
  isEnabledProviderId,
  PROVIDER_DEFAULTS,
  type ProviderId,
  type ResolvedProviderCredentials,
} from "@/lib/providers";

function decryptProviderApiKey(ciphertext: string, provider: ProviderId) {
  try {
    return decryptSecret(ciphertext);
  } catch {
    const label = provider === "gpt" ? "ChatGPT" : "OpenRouter";
    throw new Error(
      `${label} API key cannot be decrypted (encryption key changed or data is corrupt). Re-enter the key in Settings → Providers.`,
    );
  }
}

export type ProviderSettingsView = {
  activeProvider: ProviderId;
  providers: Record<
    ProviderId,
    {
      enabled: boolean;
      model: string;
      baseUrl: string;
      apiKeyConfigured: boolean;
    }
  >;
};

export async function getProviderSettingsView(
  userId: string,
): Promise<ProviderSettingsView> {
  const rows = await db
    .select({
      provider: providerCredentials.provider,
      model: providerCredentials.model,
      baseUrl: providerCredentials.baseUrl,
      isActive: providerCredentials.isActive,
    })
    .from(providerCredentials)
    .where(eq(providerCredentials.userId, userId));

  const byProvider = Object.fromEntries(
    rows.map((row) => [row.provider, row]),
  ) as Partial<
    Record<
      ProviderId,
      {
        provider: ProviderId;
        model: string;
        baseUrl: string;
        isActive: boolean;
      }
    >
  >;

  const storedActive =
    rows.find((row) => row.isActive)?.provider ??
    (rows[0]?.provider as ProviderId | undefined) ??
    "gpt";
  // OpenRouter disabled — surface ChatGPT as the active provider in settings.
  const active: ProviderId = isEnabledProviderId(storedActive)
    ? storedActive
    : "gpt";

  return {
    activeProvider: active,
    providers: {
      gpt: {
        enabled: true,
        model: byProvider.gpt?.model ?? PROVIDER_DEFAULTS.gpt.model,
        baseUrl: byProvider.gpt?.baseUrl ?? PROVIDER_DEFAULTS.gpt.baseUrl,
        apiKeyConfigured: Boolean(byProvider.gpt),
      },
      openrouter: {
        enabled: false,
        model:
          byProvider.openrouter?.model ?? PROVIDER_DEFAULTS.openrouter.model,
        baseUrl:
          byProvider.openrouter?.baseUrl ??
          PROVIDER_DEFAULTS.openrouter.baseUrl,
        apiKeyConfigured: Boolean(byProvider.openrouter),
      },
    },
  };
}

export async function upsertProviderCredential(input: {
  userId: string;
  provider: ProviderId;
  model: string;
  baseUrl: string;
  apiKey?: string;
  makeActive?: boolean;
}) {
  if (!isEnabledProviderId(input.provider)) {
    throw new Error("OpenRouter is disabled. Use ChatGPT for now.");
  }

  const existing = await db
    .select({
      id: providerCredentials.id,
      apiKeyCiphertext: providerCredentials.apiKeyCiphertext,
    })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.userId, input.userId),
        eq(providerCredentials.provider, input.provider),
      ),
    )
    .limit(1);

  const current = existing[0];
  const apiKey = input.apiKey?.trim();
  if (!current && !apiKey) {
    throw new Error("API key is required for a new provider");
  }

  const ciphertext = apiKey
    ? encryptSecret(apiKey)
    : current!.apiKeyCiphertext;

  if (input.makeActive) {
    await db
      .update(providerCredentials)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(providerCredentials.userId, input.userId));
  }

  if (current) {
    await db
      .update(providerCredentials)
      .set({
        model: input.model,
        baseUrl: input.baseUrl,
        apiKeyCiphertext: ciphertext,
        ...(input.makeActive ? { isActive: true as const } : {}),
        updatedAt: new Date(),
      })
      .where(eq(providerCredentials.id, current.id));
    return;
  }

  const existingAny = await db
    .select({ id: providerCredentials.id })
    .from(providerCredentials)
    .where(eq(providerCredentials.userId, input.userId))
    .limit(1);

  await db.insert(providerCredentials).values({
    userId: input.userId,
    provider: input.provider,
    model: input.model,
    baseUrl: input.baseUrl,
    apiKeyCiphertext: ciphertext,
    // First configured provider becomes active automatically.
    isActive: Boolean(input.makeActive) || existingAny.length === 0,
  });
}

export async function setActiveProvider(userId: string, provider: ProviderId) {
  if (!isEnabledProviderId(provider)) {
    throw new Error("OpenRouter is disabled. Use ChatGPT for now.");
  }

  const [row] = await db
    .select({ id: providerCredentials.id })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.userId, userId),
        eq(providerCredentials.provider, provider),
      ),
    )
    .limit(1);
  if (!row) {
    throw new Error("Configure this provider before enabling it");
  }

  await db
    .update(providerCredentials)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(providerCredentials.userId, userId));

  await db
    .update(providerCredentials)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(providerCredentials.id, row.id));
}

export async function resolveActiveProviderCredentials(
  userId: string,
): Promise<ResolvedProviderCredentials> {
  // OpenRouter disabled — always resolve ChatGPT credentials.
  const [row] = await db
    .select()
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.userId, userId),
        eq(providerCredentials.provider, "gpt"),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(
      "ChatGPT is not configured. Add an OpenAI API key in Settings → Providers.",
    );
  }

  return {
    userId,
    provider: "gpt",
    apiKey: decryptProviderApiKey(row.apiKeyCiphertext, "gpt"),
    model: row.model,
    baseUrl: row.baseUrl.replace(/\/$/, ""),
  };
}

export type ProviderConnectionStatus = {
  configured: boolean;
  active: boolean;
  ok: boolean | null;
  label: string;
  detail: string | null;
};

async function probeProviderKey(
  provider: ProviderId,
  apiKey: string,
  baseUrl: string,
): Promise<{ ok: boolean; rejected: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const root = baseUrl.replace(/\/$/, "");

  try {
    if (provider === "openrouter") {
      const keyResponse = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        cache: "no-store",
      });
      if (keyResponse.ok) {
        const payload = (await keyResponse.json()) as {
          data?: { limit_remaining?: number | null };
        };
        const remaining = payload.data?.limit_remaining;
        return {
          ok: true,
          rejected: false,
          detail:
            typeof remaining === "number"
              ? `Credits remaining ≈ $${remaining.toFixed(4)}`
              : "API key valid",
        };
      }
      if (keyResponse.status === 401 || keyResponse.status === 403) {
        return {
          ok: false,
          rejected: true,
          detail: "API key rejected",
        };
      }
      // Fall through to /models if /key is flaky.
    }

    const response = await fetch(`${root}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const rejected = response.status === 401 || response.status === 403;
      return {
        ok: false,
        rejected,
        detail: rejected ? "API key rejected" : `HTTP ${response.status}`,
      };
    }
    return { ok: true, rejected: false, detail: "API key valid" };
  } catch (error) {
    return {
      ok: false,
      rejected: false,
      detail:
        error instanceof Error && error.name === "AbortError"
          ? "Timed out reaching provider"
          : "Could not reach provider",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getProviderConnectionStatuses(
  userId: string,
): Promise<Record<ProviderId, ProviderConnectionStatus>> {
  const view = await getProviderSettingsView(userId);
  const rows = await db
    .select()
    .from(providerCredentials)
    .where(eq(providerCredentials.userId, userId));

  const byProvider = Object.fromEntries(
    rows.map((row) => [row.provider, row]),
  ) as Partial<Record<ProviderId, (typeof rows)[number]>>;

  const entries = await Promise.all(
    ([...ENABLED_PROVIDER_IDS] as ProviderId[]).map(async (provider) => {
      const configured = view.providers[provider].apiKeyConfigured;
      const active = view.activeProvider === provider;
      if (!configured || !byProvider[provider]) {
        return [
          provider,
          {
            configured: false,
            active,
            ok: null,
            label: "Not configured",
            detail: null,
          } satisfies ProviderConnectionStatus,
        ] as const;
      }

      const row = byProvider[provider];
      let apiKey: string;
      try {
        apiKey = decryptProviderApiKey(row.apiKeyCiphertext, provider);
      } catch (error) {
        return [
          provider,
          {
            configured: true,
            active,
            ok: false,
            label: "Needs re-entry",
            detail:
              error instanceof Error
                ? error.message
                : "Stored API key cannot be decrypted",
          } satisfies ProviderConnectionStatus,
        ] as const;
      }

      const probe = await probeProviderKey(provider, apiKey, row.baseUrl);

      if (!probe.ok) {
        return [
          provider,
          {
            configured: true,
            active,
            ok: false,
            label: probe.rejected ? "Invalid key" : "Unreachable",
            detail: probe.detail,
          } satisfies ProviderConnectionStatus,
        ] as const;
      }

      return [
        provider,
        {
          configured: true,
          active,
          ok: true,
          label: active ? "Active" : "Connected",
          detail: probe.detail,
        } satisfies ProviderConnectionStatus,
      ] as const;
    }),
  );

  const enabled = Object.fromEntries(entries) as Record<
    ProviderId,
    ProviderConnectionStatus
  >;

  return {
    gpt: enabled.gpt!,
    openrouter: {
      configured: false,
      active: false,
      ok: null,
      label: "Disabled",
      detail: "OpenRouter is disabled for now",
    },
  };
}
