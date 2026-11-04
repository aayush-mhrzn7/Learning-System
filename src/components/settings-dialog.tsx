"use client";

import { Bot, PanelRight } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  readMinimapEnabled,
  writeMinimapEnabled,
} from "@/lib/editor-preferences";
import {
  isEnabledProviderId,
  PROVIDER_DEFAULTS,
  PROVIDER_IDS,
  type ProviderId,
} from "@/lib/providers";
import { cn } from "@/lib/utils";

type SettingsSection = "providers" | "editor";

type ProviderView = {
  enabled: boolean;
  model: string;
  baseUrl: string;
  apiKeyConfigured: boolean;
};

type SettingsState = {
  activeProvider: ProviderId;
  providers: Record<ProviderId, ProviderView>;
};

type ConnectionStatus = {
  configured: boolean;
  active: boolean;
  ok: boolean | null;
  label: string;
  detail: string | null;
};

const checkingStatus: ConnectionStatus = {
  configured: false,
  active: false,
  ok: null,
  label: "Checking…",
  detail: null,
};

const emptySettings: SettingsState = {
  activeProvider: "gpt",
  providers: {
    gpt: {
      enabled: true,
      model: PROVIDER_DEFAULTS.gpt.model,
      baseUrl: PROVIDER_DEFAULTS.gpt.baseUrl,
      apiKeyConfigured: false,
    },
    openrouter: {
      enabled: false,
      model: PROVIDER_DEFAULTS.openrouter.model,
      baseUrl: PROVIDER_DEFAULTS.openrouter.baseUrl,
      apiKeyConfigured: false,
    },
  },
};

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
    blurb: "Temporarily disabled — ChatGPT only for now",
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
        provider.iconShell === "light"
          ? "bg-white"
          : "bg-zinc-900 ring-1 ring-white/10",
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
  disabled,
  size = "sm",
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative shrink-0 rounded-full transition-colors disabled:opacity-40",
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
  const [settings, setSettings] = useState<SettingsState>(emptySettings);
  const [selected, setSelected] = useState<ProviderId>("gpt");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [modelDraft, setModelDraft] = useState(PROVIDER_DEFAULTS.gpt.model);
  const [baseUrlDraft, setBaseUrlDraft] = useState(
    PROVIDER_DEFAULTS.gpt.baseUrl,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<SettingsSection>("providers");
  const [minimapEnabled, setMinimapEnabled] = useState(true);
  const [statuses, setStatuses] = useState<
    Record<ProviderId, ConnectionStatus>
  >({
    gpt: checkingStatus,
    openrouter: checkingStatus,
  });

  async function refreshStatuses() {
    setStatuses({
      gpt: { ...checkingStatus, label: "Checking…" },
      openrouter: { ...checkingStatus, label: "Checking…" },
    });
    try {
      const response = await fetch("/api/settings/providers/status", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("status failed");
      const data = (await response.json()) as {
        statuses: Record<ProviderId, ConnectionStatus>;
      };
      setStatuses(data.statuses);
    } catch {
      setStatuses({
        gpt: {
          configured: false,
          active: false,
          ok: false,
          label: "Status unavailable",
          detail: null,
        },
        openrouter: {
          configured: false,
          active: false,
          ok: false,
          label: "Status unavailable",
          detail: null,
        },
      });
    }
  }

  useEffect(() => {
    if (!open) return;
    setMinimapEnabled(readMinimapEnabled());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Drop the old client-side BYOK store; keys live encrypted in Postgres now.
    localStorage.removeItem("learning-provider-settings");
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/settings/providers", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Failed to load settings");
        const data = (await response.json()) as SettingsState;
        if (cancelled) return;
        setSettings(data);
        setSelected(data.activeProvider);
        const active = data.providers[data.activeProvider];
        setModelDraft(active.model);
        setBaseUrlDraft(active.baseUrl);
        setApiKeyDraft("");
        void refreshStatuses();
      } catch {
        if (!cancelled) toast.error("Could not load provider settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const provider = settings.providers[selected];
    setModelDraft(provider.model);
    setBaseUrlDraft(provider.baseUrl);
    setApiKeyDraft("");
  }, [selected, settings.providers]);

  async function saveProvider(options?: { makeActive?: boolean }) {
    if (!isEnabledProviderId(selected)) {
      toast.error("OpenRouter is disabled for now");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/settings/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selected,
          model: modelDraft,
          baseUrl: baseUrlDraft,
          ...(apiKeyDraft.trim() ? { apiKey: apiKeyDraft.trim() } : {}),
          makeActive: options?.makeActive,
        }),
      });
      const data = (await response.json()) as SettingsState & { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Could not save provider");
        return;
      }
      setSettings(data);
      setApiKeyDraft("");
      toast.success("Provider saved");
      void refreshStatuses();
    } catch {
      toast.error("Could not save provider");
    } finally {
      setSaving(false);
    }
  }

  async function enableOnly(id: ProviderId) {
    if (!isEnabledProviderId(id)) {
      toast.error("OpenRouter is disabled for now");
      return;
    }
    if (!settings.providers[id].apiKeyConfigured) {
      setSelected(id);
      toast.error("Save an API key for this provider first");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/settings/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeProvider: id }),
      });
      const data = (await response.json()) as SettingsState & { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Could not switch provider");
        return;
      }
      setSettings(data);
      setSelected(id);
      void refreshStatuses();
    } catch {
      toast.error("Could not switch provider");
    } finally {
      setSaving(false);
    }
  }

  const provider = settings.providers[selected];
  const meta = providerMeta[selected];
  const selectedStatus = statuses[selected];
  const selectedEnabled = isEnabledProviderId(selected);

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
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setSection("providers")}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2.5 text-left text-xs",
                section === "providers"
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              )}
            >
              <Bot className="size-3.5 shrink-0" />
              Providers
            </button>
            <button
              type="button"
              onClick={() => setSection("editor")}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2.5 text-left text-xs",
                section === "editor"
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              )}
            >
              <PanelRight className="size-3.5 shrink-0" />
              Editor
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-white/10 px-5 py-3">
            <p className="text-xs text-zinc-500">
              Settings <span className="text-zinc-700">/</span>{" "}
              <span className="text-zinc-300">
                {section === "providers" ? "Providers" : "Editor"}
              </span>
            </p>
          </div>

          {section === "editor" ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <h2 className="mb-1 text-sm font-medium tracking-tight text-zinc-50">
                Editor
              </h2>
              <p className="mb-6 text-xs text-zinc-500">
                Layout preferences for the note workspace.
              </p>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                <div>
                  <p className="text-xs text-zinc-100">Document minimap</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-zinc-500">
                    Show the viewport overview and claim markers on the right
                    edge of the note.
                  </p>
                </div>
                <Switch
                  size="md"
                  checked={minimapEnabled}
                  onCheckedChange={(checked) => {
                    setMinimapEnabled(checked);
                    writeMinimapEnabled(checked);
                  }}
                />
              </div>
            </div>
          ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex w-56 shrink-0 flex-col border-r border-white/10 p-3">
              <p className="mb-2 px-2 text-xs font-medium text-zinc-200">
                Providers
              </p>
              <div className="flex flex-col gap-0.5">
                {PROVIDER_IDS.map((id) => {
                  const item = providerMeta[id];
                  const available = isEnabledProviderId(id);
                  const enabled = settings.activeProvider === id;
                  const status = statuses[id];
                  return (
                    <div
                      key={id}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors",
                        selected === id ? "bg-white/10" : "hover:bg-white/5",
                        !available && "opacity-60",
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
                          <span className="flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
                            <StatusDot status={status} />
                            {available ? status.label : "Disabled"}
                          </span>
                        </span>
                      </button>
                      <Switch
                        checked={enabled}
                        disabled={saving || loading || !available}
                        onCheckedChange={(checked) => {
                          if (checked) void enableOnly(id);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 flex-1 overflow-y-auto p-5">
              {loading ? (
                <p className="text-xs text-zinc-500">Loading…</p>
              ) : (
                <>
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
                      label="Status"
                      description={
                        selectedEnabled
                          ? (selectedStatus.detail ??
                            "Live check against this provider’s API.")
                          : "OpenRouter is temporarily disabled. Use ChatGPT."
                      }
                    >
                      <div className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 text-xs text-zinc-200">
                        <StatusDot status={selectedStatus} />
                        <span>
                          {selectedEnabled ? selectedStatus.label : "Disabled"}
                        </span>
                      </div>
                    </Field>

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
                      description={
                        selectedEnabled
                          ? provider.apiKeyConfigured
                            ? "Encrypted in the database. Leave blank to keep the current key."
                            : "Encrypted in the database. Never stored in the browser."
                          : "Saving is disabled while OpenRouter is off."
                      }
                    >
                      <Input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={apiKeyDraft}
                        onChange={(event) => setApiKeyDraft(event.target.value)}
                        disabled={!selectedEnabled}
                        placeholder={
                          provider.apiKeyConfigured
                            ? "•••••••• (unchanged)"
                            : selected === "gpt"
                              ? "sk-…"
                              : "sk-or-…"
                        }
                        className={fieldInputClass}
                      />
                    </Field>

                    <Field
                      label="Default model"
                      description={
                        selected === "openrouter"
                          ? "Default is nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free (tokens free; OpenRouter web search still uses credits)."
                          : "Model id used for fact-check and gap analysis."
                      }
                    >
                      <Input
                        value={modelDraft}
                        onChange={(event) => setModelDraft(event.target.value)}
                        placeholder="model id"
                        spellCheck={false}
                        disabled={!selectedEnabled}
                        className={fieldInputClass}
                      />
                    </Field>

                    <Field
                      label="Base URL"
                      description="API endpoint for this provider."
                    >
                      <Input
                        value={baseUrlDraft}
                        onChange={(event) => setBaseUrlDraft(event.target.value)}
                        placeholder="https://"
                        spellCheck={false}
                        disabled={!selectedEnabled}
                        className={fieldInputClass}
                      />
                    </Field>

                    <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-5">
                      <div>
                        <p className="text-xs text-zinc-100">
                          Use as active provider
                        </p>
                        <p className="mt-0.5 text-[11px] leading-5 text-zinc-500">
                          {selectedEnabled
                            ? "Turning this on disables the other provider automatically."
                            : "Unavailable while OpenRouter is disabled."}
                        </p>
                      </div>
                      <Switch
                        size="md"
                        checked={settings.activeProvider === selected}
                        disabled={saving || loading || !selectedEnabled}
                        onCheckedChange={(checked) => {
                          if (checked) void enableOnly(selected);
                        }}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={saving || !selectedEnabled}
                        onClick={() =>
                          void saveProvider({
                            makeActive: settings.activeProvider === selected,
                          })
                        }
                      >
                        {saving ? "Saving…" : "Save provider"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status.label === "Checking…"
          ? "bg-zinc-500"
          : status.ok === true
            ? status.active
              ? "bg-emerald-400"
              : "bg-sky-400"
            : status.ok === false
              ? "bg-rose-400"
              : "bg-zinc-600",
      )}
    />
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
