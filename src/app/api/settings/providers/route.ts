import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import {
  getProviderSettingsView,
  setActiveProvider,
  upsertProviderCredential,
} from "@/lib/provider-credentials";
import {
  canonicalProviderBaseUrl,
  isAllowedProviderBaseUrl,
  isEnabledProviderId,
  isProviderId,
  PROVIDER_DEFAULTS,
} from "@/lib/providers";

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const settings = await getProviderSettingsView(userId);
  return Response.json(settings, {
    headers: { "Cache-Control": "no-store" },
  });
}

const putSchema = z.object({
  provider: z.string().refine(isProviderId),
  model: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().url().max(500).optional(),
  apiKey: z.string().trim().min(1).max(500).optional(),
  makeActive: z.boolean().optional(),
});

const activeSchema = z.object({
  activeProvider: z.string().refine(isProviderId),
});

export async function PUT(request: Request) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const asActive = activeSchema.safeParse(body);
  if (asActive.success && Object.keys(body ?? {}).length === 1) {
    if (!isEnabledProviderId(asActive.data.activeProvider)) {
      return Response.json(
        { error: "OpenRouter is disabled. Use ChatGPT for now." },
        { status: 400 },
      );
    }
    try {
      await setActiveProvider(userId, asActive.data.activeProvider);
      const settings = await getProviderSettingsView(userId);
      return Response.json(settings, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (err) {
      return Response.json(
        {
          error:
            err instanceof Error ? err.message : "Could not activate provider",
        },
        { status: 400 },
      );
    }
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid provider settings" }, { status: 400 });
  }

  const provider = parsed.data.provider;
  if (!isEnabledProviderId(provider)) {
    return Response.json(
      { error: "OpenRouter is disabled. Use ChatGPT for now." },
      { status: 400 },
    );
  }
  if (
    parsed.data.baseUrl &&
    !isAllowedProviderBaseUrl(provider, parsed.data.baseUrl)
  ) {
    return Response.json(
      { error: "Provider base URL is not allowed" },
      { status: 400 },
    );
  }
  try {
    await upsertProviderCredential({
      userId,
      provider,
      model: parsed.data.model || PROVIDER_DEFAULTS[provider].model,
      baseUrl: canonicalProviderBaseUrl(provider),
      apiKey: parsed.data.apiKey,
      makeActive: parsed.data.makeActive,
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Could not save provider settings",
      },
      { status: 400 },
    );
  }

  const settings = await getProviderSettingsView(userId);
  return Response.json(settings, {
    headers: { "Cache-Control": "no-store" },
  });
}
