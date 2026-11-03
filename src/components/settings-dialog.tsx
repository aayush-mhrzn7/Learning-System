"use client";

import { Bot } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ProviderId = "gpt" | "openrouter";

type ProviderConfig = {
  enabled: boolean;
  apiKey: string;
  model: string;
  baseUrl: string;
};

type SettingsState = {
  activeProvider: ProviderId;
  providers: Record<ProviderId, ProviderConfig>;
};

const STORAGE_KEY = "learning-provider-settings";

const defaults: SettingsState = {
  activeProvider: "gpt",
  providers: {
    gpt: {
      enabled: true,
      apiKey: "",
      model: "gpt-5.6-luna",
      baseUrl: "https://api.openai.com/v1",
    },
    openrouter: {
      enabled: false,
      apiKey: "",
      model: "openai/gpt-4.1-mini",
      baseUrl: "https://openrouter.ai/api/v1",
    },
  },
};

function loadSettings(): SettingsState {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    return {
      activeProvider: parsed.activeProvider ?? defaults.activeProvider,
      providers: {
        gpt: { ...defaults.providers.gpt, ...parsed.providers?.gpt },
        openrouter: {
          ...defaults.providers.openrouter,
          ...parsed.providers?.openrouter,
        },
      },
    };
  } catch {
    return defaults;
  }
}

const providerMeta: Record<
  ProviderId,
  {
    name: string;
    blurb: string;
    iconSrc: string;
    iconAlt: string;
    iconShell: "light" | "dark";
  }
> = {
  gpt: {
    name: "ChatGPT",
    blurb: "OpenAI API",
    iconSrc: "/icons/openai.svg",
    iconAlt: "ChatGPT",
    iconShell: "dark",
  },
  openrouter: {
    name: "OpenRouter",
    blurb: "Multi-model gateway",
    iconSrc: "/icons/openrouter.svg",
    iconAlt: "OpenRouter",
    iconShell: "dark",
  },
};

function ProviderIconShell({
  provider,
  size = "sm",
}: {
  provider: (typeof providerMeta)[ProviderId];
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-md",
        size === "sm" ? "size-7" : "size-9 rounded-lg",
        provider.iconShell === "light" ? "bg-white" : "bg-zinc-900 ring-1 ring-white/10",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={provider.iconSrc}
        alt={provider.iconAlt}
        width={size === "sm" ? 14 : 18}
        height={size === "sm" ? 14 : 18}
        className={cn(
          "object-contain",
          size === "sm" ? "size-3.5" : "size-[18px]",
        )}
        draggable={false}
      />
    </span>
  );
}

function Switch({
  checked,
  onCheckedChange,
  size = "sm",
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative shrink-0 rounded-full transition-colors",
        size === "sm" ? "h-4 w-7" : "h-5 w-9",
        checked ? "bg-blue-500" : "bg-zinc-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 rounded-full bg-white transition-[left]",
          size === "sm" ? "size-3" : "size-4",
          checked
            ? size === "sm"
              ? "left-3.5"
              : "left-4"
            : "left-0.5",
        )}
      />
    </button>
  );
}

const fieldInputClass =
  "h-8 rounded-md border-white/10 bg-black/40 text-[11px] text-foreground shadow-none placeholder:text-zinc-600 focus-visible:border-white/25 focus-visible:ring-0 dark:bg-black/40";

export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<SettingsState>(defaults);
  const [selected, setSelected] = useState<ProviderId>("gpt");

  useEffect(() => {
    if (!open) return;
    const next = loadSettings();
    setSettings(next);
    setSelected(next.activeProvider);
  }, [open]);

  function persist(next: SettingsState) {
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function updateProvider(id: ProviderId, patch: Partial<ProviderConfig>) {
    persist({
      ...settings,
      providers: {
        ...settings.providers,
        [id]: { ...settings.providers[id], ...patch },
      },
    });
  }

  const provider = settings.providers[selected];
  const meta = providerMeta[selected];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="flex h-[min(680px,86vh)] w-[min(920px,calc(100%-2rem))] max-w-none overflow-hidden border-white/10 bg-zinc-950 p-0"
        showCloseButton
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Configure AI providers for Learning System.
        </DialogDescription>

        <aside className="flex w-44 shrink-0 flex-col border-r border-white/10 bg-black/40 p-3">
          <p className="mb-3 px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            Settings
          </p>
          <button
            type="button"
            className="flex h-8 items-center gap-2 rounded-md bg-white/10 px-2.5 text-left text-xs text-zinc-100"
          >
            <Bot className="size-3.5 shrink-0" />
            Providers
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-white/10 px-5 py-3">
            <p className="text-xs text-zinc-500">
              Settings <span className="text-zinc-700">/</span>{" "}
              <span className="text-zinc-300">Providers</span>
            </p>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="flex w-56 shrink-0 flex-col border-r border-white/10 p-3">
              <p className="mb-2 px-2 text-xs font-medium text-zinc-200">
                Providers
              </p>
              <div className="flex flex-col gap-0.5">
                {(Object.keys(providerMeta) as ProviderId[]).map((id) => {
                  const item = providerMeta[id];
                  const enabled = settings.providers[id].enabled;
                  return (
                    <div
                      key={id}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors",
                        selected === id ? "bg-white/10" : "hover:bg-white/5",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(id)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <ProviderIconShell provider={item} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-zinc-100">
                            {item.name}
                          </span>
                          <span className="block truncate text-[11px] text-zinc-500">
                            {enabled ? "Enabled" : "Disabled"}
                          </span>
                        </span>
                      </button>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) =>
                          updateProvider(id, { enabled: checked })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 flex-1 overflow-y-auto p-5">
              <div className="mb-6 flex items-center gap-3">
                <ProviderIconShell provider={meta} size="lg" />
                <div>
                  <h2 className="text-sm font-medium tracking-tight text-zinc-50">
                    {meta.name}
                  </h2>
                  <p className="text-xs text-zinc-500">{meta.blurb}</p>
                </div>
              </div>

              <div className="flex flex-col gap-5">
                <Field
                  label="Display name"
                  description="Label shown in the provider list."
                >
                  <Input
                    value={meta.name}
                    readOnly
                    className={fieldInputClass}
                  />
                </Field>

                <Field
                  label="API key"
                  description="Used only for your AI calls. Stored locally for now."
                >
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={provider.apiKey}
                    onChange={(event) =>
                      updateProvider(selected, { apiKey: event.target.value })
                    }
                    placeholder={selected === "gpt" ? "sk-…" : "sk-or-…"}
                    className={fieldInputClass}
                  />
                </Field>

                <Field
                  label="Default model"
                  description="Model id used for fact-check and gap analysis."
                >
                  <Input
                    value={provider.model}
                    onChange={(event) =>
                      updateProvider(selected, { model: event.target.value })
                    }
                    placeholder="model id"
                    spellCheck={false}
                    className={fieldInputClass}
                  />
                </Field>

                <Field
                  label="Base URL"
                  description="API endpoint for this provider."
                >
                  <Input
                    value={provider.baseUrl}
                    onChange={(event) =>
                      updateProvider(selected, {
                        baseUrl: event.target.value,
                      })
                    }
                    placeholder="https://"
                    spellCheck={false}
                    className={fieldInputClass}
                  />
                </Field>

                <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-5">
                  <div>
                    <p className="text-xs text-zinc-100">
                      Use as active provider
                    </p>
                    <p className="mt-0.5 text-[11px] leading-5 text-zinc-500">
                      Default for fact-check and gaps.
                    </p>
                  </div>
                  <Switch
                    size="md"
                    checked={settings.activeProvider === selected}
                    onCheckedChange={() =>
                      persist({ ...settings, activeProvider: selected })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span>
        <span className="block text-xs text-zinc-100">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">
          {description}
        </span>
      </span>
      {children}
    </label>
  );
}
