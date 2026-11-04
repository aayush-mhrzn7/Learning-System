import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { providerCredentials } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/credentials-crypto";
import {
  PROVIDER_DEFAULTS,
  type ProviderId,
  type ResolvedProviderCredentials,
} from "@/lib/providers";

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

  const active =
    rows.find((row) => row.isActive)?.provider ??
    (rows[0]?.provider as ProviderId | undefined) ??
    "gpt";

  return {
    activeProvider: active,
    providers: {
      gpt: {
        enabled: active === "gpt",
        model: byProvider.gpt?.model ?? PROVIDER_DEFAULTS.gpt.model,
        baseUrl: byProvider.gpt?.baseUrl ?? PROVIDER_DEFAULTS.gpt.baseUrl,
        apiKeyConfigured: Boolean(byProvider.gpt),
      },
      openrouter: {
        enabled: active === "openrouter",
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
  const [active] = await db
    .select()
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.userId, userId),
        eq(providerCredentials.isActive, true),
      ),
    )
    .limit(1);

  const row =
    active ??
    (
      await db
        .select()
        .from(providerCredentials)
        .where(eq(providerCredentials.userId, userId))
        .limit(1)
    )[0];

  if (!row) {
    throw new Error(
      "No AI provider configured. Add an API key in Settings → Providers.",
    );
  }

  return {
    provider: row.provider,
    apiKey: decryptSecret(row.apiKeyCiphertext),
    model: row.model,
    baseUrl: row.baseUrl.replace(/\/$/, ""),
    supportsWebSearch: row.provider === "gpt",
  };
}
