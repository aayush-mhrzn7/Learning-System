"use client";

import { Bot, Lock, Moon, PanelRight, Palette, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { providerToasts } from "@/lib/toast-messages";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  APP_THEME_LABELS,
  APP_THEME_OPTIONS,
  APP_THEME_SWATCHES,
  COLOR_SCHEME_OPTIONS,
  applyAppearance,
  readAccentOnly,
  readAppThemeDark,
  readAppThemeLight,
  readColorScheme,
  readReduceMotion,
  writeAccentOnly,
  writeAppThemeDark,
  writeAppThemeLight,
  writeColorScheme,
  writeReduceMotion,
  type AppThemeOption,
  type ColorSchemeOption,
} from "@/lib/appearance-preferences";
import {
  CLAIM_HIGHLIGHTS_LABELS,
  CLAIM_HIGHLIGHTS_OPTIONS,
  CONTENT_WIDTH_LABELS,
  CONTENT_WIDTH_OPTIONS,
  FONT_FAMILY_LABELS,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_LABELS,
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_LABELS,
  LINE_HEIGHT_OPTIONS,
  readClaimHighlights,
  readContentWidth,
  readFontFamily,
  readFontSize,
  readLineHeight,
  readMinimapEnabled,
  readSpellcheckEnabled,
  readToolbarEnabled,
  writeClaimHighlights,
  writeContentWidth,
  writeFontFamily,
  writeFontSize,
  writeLineHeight,
  writeMinimapEnabled,
  writeSpellcheckEnabled,
  writeToolbarEnabled,
  type ClaimHighlightsOption,
  type ContentWidthOption,
  type FontFamilyOption,
  type FontSizeOption,
  type LineHeightOption,
} from "@/lib/editor-preferences";
import {
  isEnabledProviderId,
  PROVIDER_DEFAULTS,
  PROVIDER_IDS,
  type ProviderId,
} from "@/lib/providers";
import { cn } from "@/lib/utils";

type SettingsSection = "providers" | "editor" | "appearance";

const SECTION_LABELS: Record<SettingsSection, string> = {
  providers: "Providers",
  editor: "Editor",
  appearance: "Appearance",
};

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
          : "bg-foreground ring-1 ring-border",
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
        checked ? "bg-theme-accent" : "bg-muted-foreground/40",
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
  "h-8 rounded-md border-border bg-muted/40 text-[13px] text-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-0";

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
  const [fontSize, setFontSize] = useState<FontSizeOption>("md");
  const [lineHeight, setLineHeight] = useState<LineHeightOption>("default");
  const [contentWidth, setContentWidth] = useState<ContentWidthOption>("wide");
  const [toolbarEnabled, setToolbarEnabled] = useState(true);
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(true);
  const [fontFamily, setFontFamily] = useState<FontFamilyOption>("sf-pro");
  const [claimHighlights, setClaimHighlights] =
    useState<ClaimHighlightsOption>("strong");
  const [colorScheme, setColorScheme] = useState<ColorSchemeOption>("dark");
  const [themeLight, setThemeLight] = useState<AppThemeOption>("classic");
  const [themeDark, setThemeDark] = useState<AppThemeOption>("classic");
  const [accentOnly, setAccentOnly] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
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
    setFontSize(readFontSize());
    setLineHeight(readLineHeight());
    setContentWidth(readContentWidth());
    setToolbarEnabled(readToolbarEnabled());
    setSpellcheckEnabled(readSpellcheckEnabled());
    setFontFamily(readFontFamily());
    setClaimHighlights(readClaimHighlights());
    setColorScheme(readColorScheme());
    setThemeLight(readAppThemeLight());
    setThemeDark(readAppThemeDark());
    setAccentOnly(readAccentOnly());
    setReduceMotion(readReduceMotion());
    applyAppearance();
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
        if (!cancelled) toast.error(providerToasts.loadFailed);
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
      toast.error(providerToasts.openRouterDisabled);
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
        toast.error(data.error ?? providerToasts.saveFailed);
        return;
      }
      setSettings(data);
      setApiKeyDraft("");
      toast.success(providerToasts.saved);
      void refreshStatuses();
    } catch {
      toast.error(providerToasts.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function enableOnly(id: ProviderId) {
    if (!isEnabledProviderId(id)) {
      toast.error(providerToasts.openRouterDisabled);
      return;
    }
    if (!settings.providers[id].apiKeyConfigured) {
      setSelected(id);
      toast.error(providerToasts.needKey);
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
        toast.error(data.error ?? providerToasts.switchFailed);
        return;
      }
      setSettings(data);
      setSelected(id);
      void refreshStatuses();
    } catch {
      toast.error(providerToasts.switchFailed);
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
        className="flex h-[min(680px,90dvh)] max-h-[90dvh] w-[min(920px,calc(100%-1.5rem))] max-w-none flex-col overflow-hidden border-border bg-background p-0 md:flex-row"
        showCloseButton
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Configure AI providers for Learning System.
        </DialogDescription>

        <aside className="flex w-full shrink-0 flex-row items-center gap-1 border-b border-border bg-muted/30 p-3 pr-12 md:w-44 md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0 md:pr-3">
          <p className="mb-3 hidden px-2 text-[12px] font-medium uppercase tracking-[0.18em] text-muted-foreground md:block">
            Settings
          </p>
          <div className="flex min-w-0 flex-1 gap-0.5 md:flex-col">
            <button
              type="button"
              onClick={() => setSection("providers")}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-2 rounded-md px-2.5 text-xs md:flex-none md:justify-start md:text-left",
                section === "providers"
                  ? "bg-theme-accent/20 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Bot className="size-3.5 shrink-0" />
              Providers
            </button>
            <button
              type="button"
              onClick={() => setSection("editor")}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-2 rounded-md px-2.5 text-xs md:flex-none md:justify-start md:text-left",
                section === "editor"
                  ? "bg-theme-accent/20 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <PanelRight className="size-3.5 shrink-0" />
              Editor
            </button>
            <button
              type="button"
              onClick={() => setSection("appearance")}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-2 rounded-md px-2.5 text-xs md:flex-none md:justify-start md:text-left",
                section === "appearance"
                  ? "bg-theme-accent/20 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Palette className="size-3.5 shrink-0" />
              Appearance
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="hidden border-b border-border px-5 py-3 md:block">
            <p className="text-xs text-muted-foreground">
              Settings <span className="opacity-40">/</span>{" "}
              <span className="text-foreground/80">{SECTION_LABELS[section]}</span>
            </p>
          </div>

          {section === "appearance" ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-medium tracking-tight text-foreground">
                  Color scheme
                </h2>
                <div className="grid grid-cols-3 gap-2.5">
                  {COLOR_SCHEME_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setColorScheme(option);
                        writeColorScheme(option);
                      }}
                      className={cn(
                        "flex flex-col overflow-hidden rounded-xl border-2 bg-card text-left transition-colors",
                        colorScheme === option
                          ? "border-theme-accent"
                          : "border-border hover:border-muted-foreground/40",
                      )}
                    >
                      <SchemePreview scheme={option} />
                      <span className="border-t border-border px-3 py-2 text-xs text-foreground">
                        {option === "system"
                          ? "System"
                          : option === "light"
                            ? "Light"
                            : "Dark"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="mb-8">
                <div className="mb-3">
                  <h2 className="text-sm font-medium tracking-tight text-foreground">
                    Default
                  </h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Original black &amp; white surfaces — the look before color
                    themes.
                  </p>
                </div>
                <ThemeCard
                  option="classic"
                  themeLight={themeLight}
                  themeDark={themeDark}
                  locked={accentOnly}
                  onPickLight={(value) => {
                    setThemeLight(value);
                    writeAppThemeLight(value);
                  }}
                  onPickDark={(value) => {
                    setThemeDark(value);
                    writeAppThemeDark(value);
                  }}
                  className="max-w-xs"
                />
              </section>

              <section className="mb-8">
                <div className="mb-3">
                  <h2 className="text-sm font-medium tracking-tight text-foreground">
                    Themes
                  </h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Pick sun for light and moon for dark — they can differ.
                  </p>
                </div>
                <div className="mb-3">
                  <PrefRow
                    title="Accent only"
                    description="Keep black & white surfaces. Theme color only for selection, rings, and switches."
                  >
                    <Switch
                      size="md"
                      checked={accentOnly}
                      onCheckedChange={(checked) => {
                        setAccentOnly(checked);
                        writeAccentOnly(checked);
                      }}
                    />
                  </PrefRow>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {APP_THEME_OPTIONS.filter((option) => option !== "classic").map(
                    (option) => (
                      <ThemeCard
                        key={option}
                        option={option}
                        themeLight={themeLight}
                        themeDark={themeDark}
                        onPickLight={(value) => {
                          setThemeLight(value);
                          writeAppThemeLight(value);
                        }}
                        onPickDark={(value) => {
                          setThemeDark(value);
                          writeAppThemeDark(value);
                        }}
                      />
                    ),
                  )}
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium tracking-tight text-foreground">
                  Interface
                </h2>
                <PrefRow
                  title="Reduce motion"
                  description="Minimize animations and transitions across the app."
                >
                  <Switch
                    size="md"
                    checked={reduceMotion}
                    onCheckedChange={(checked) => {
                      setReduceMotion(checked);
                      writeReduceMotion(checked);
                    }}
                  />
                </PrefRow>
              </section>
            </div>
          ) : section === "editor" ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
              <h2 className="mb-1 text-sm font-medium tracking-tight text-foreground">
                Editor
              </h2>
              <p className="mb-6 text-xs text-muted-foreground">
                Layout preferences for the note workspace.
              </p>
              <div className="flex flex-col gap-3">
                <PrefRow
                  title="Document minimap"
                  description="Show the viewport overview and claim markers on the right edge of the note."
                >
                  <Switch
                    size="md"
                    checked={minimapEnabled}
                    onCheckedChange={(checked) => {
                      setMinimapEnabled(checked);
                      writeMinimapEnabled(checked);
                    }}
                  />
                </PrefRow>
                <PrefRow
                  title="Formatting toolbar"
                  description="Show the formatting bar above the note while editing."
                >
                  <Switch
                    size="md"
                    checked={toolbarEnabled}
                    onCheckedChange={(checked) => {
                      setToolbarEnabled(checked);
                      writeToolbarEnabled(checked);
                    }}
                  />
                </PrefRow>
                <PrefRow
                  title="Spell check"
                  description="Underline misspellings in the note editor."
                >
                  <Switch
                    size="md"
                    checked={spellcheckEnabled}
                    onCheckedChange={(checked) => {
                      setSpellcheckEnabled(checked);
                      writeSpellcheckEnabled(checked);
                    }}
                  />
                </PrefRow>
                <PrefRow
                  title="Font"
                  description="Typeface for note body text. SF Pro is the default."
                >
                  <Segmented
                    ariaLabel="Font"
                    value={fontFamily}
                    options={FONT_FAMILY_OPTIONS.map((option) => ({
                      value: option,
                      label:
                        option === "sf-pro"
                          ? "SF"
                          : option === "serif"
                            ? "Serif"
                            : "Mono",
                      title: FONT_FAMILY_LABELS[option],
                    }))}
                    onChange={(value) => {
                      setFontFamily(value);
                      writeFontFamily(value);
                    }}
                  />
                </PrefRow>
                <PrefRow
                  title="Font size"
                  description="Body text size in the note editor."
                >
                  <Segmented
                    ariaLabel="Font size"
                    value={fontSize}
                    options={FONT_SIZE_OPTIONS.map((option) => ({
                      value: option,
                      label:
                        option === "sm"
                          ? "S"
                          : option === "md"
                            ? "M"
                            : option === "lg"
                              ? "L"
                              : "XL",
                      title: FONT_SIZE_LABELS[option],
                    }))}
                    onChange={(value) => {
                      setFontSize(value);
                      writeFontSize(value);
                    }}
                  />
                </PrefRow>
                <PrefRow
                  title="Line height"
                  description="Spacing between lines for reading comfort."
                >
                  <Segmented
                    ariaLabel="Line height"
                    value={lineHeight}
                    options={LINE_HEIGHT_OPTIONS.map((option) => ({
                      value: option,
                      label:
                        option === "compact"
                          ? "Tight"
                          : option === "default"
                            ? "Default"
                            : "Loose",
                      title: LINE_HEIGHT_LABELS[option],
                    }))}
                    onChange={(value) => {
                      setLineHeight(value);
                      writeLineHeight(value);
                    }}
                  />
                </PrefRow>
                <PrefRow
                  title="Content width"
                  description="Max width of the note column."
                >
                  <Segmented
                    ariaLabel="Content width"
                    value={contentWidth}
                    options={CONTENT_WIDTH_OPTIONS.map((option) => ({
                      value: option,
                      label:
                        option === "narrow"
                          ? "S"
                          : option === "medium"
                            ? "M"
                            : "L",
                      title: CONTENT_WIDTH_LABELS[option],
                    }))}
                    onChange={(value) => {
                      setContentWidth(value);
                      writeContentWidth(value);
                    }}
                  />
                </PrefRow>
                <PrefRow
                  title="Claim highlights"
                  description="Wavy underlines on fact-check flags in the note."
                >
                  <Segmented
                    ariaLabel="Claim highlights"
                    value={claimHighlights}
                    options={CLAIM_HIGHLIGHTS_OPTIONS.map((option) => ({
                      value: option,
                      label:
                        option === "soft"
                          ? "Soft"
                          : option === "strong"
                            ? "Strong"
                            : "Off",
                      title: CLAIM_HIGHLIGHTS_LABELS[option],
                    }))}
                    onChange={(value) => {
                      setClaimHighlights(value);
                      writeClaimHighlights(value);
                    }}
                  />
                </PrefRow>
              </div>
            </div>
          ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
            <div className="flex w-full shrink-0 flex-col border-b border-border p-3 md:w-56 md:border-r md:border-b-0">
              <p className="mb-2 px-2 text-xs font-medium text-foreground">
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
                        selected === id ? "bg-accent" : "hover:bg-accent/50",
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
                          <span className="block truncate text-xs text-foreground">
                            {item.name}
                          </span>
                          <span className="flex items-center gap-1.5 truncate text-[13px] text-muted-foreground">
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

            <div className="min-w-0 flex-1 p-4 md:overflow-y-auto md:p-5">
              {loading ? (
                <div
                  className="flex flex-col gap-5"
                  aria-busy="true"
                  aria-label="Loading settings"
                >
                  <div className="mb-1 flex items-center gap-3">
                    <Skeleton className="size-10 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="mt-2 h-3 w-48 max-w-full" />
                    </div>
                  </div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={`settings-skel-${i}`} className="flex flex-col gap-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-56 max-w-full" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="mb-6 flex items-center gap-3">
                    <ProviderIconShell provider={meta} size="lg" />
                    <div className="min-w-0">
                      <h2 className="text-sm font-medium tracking-tight text-foreground">
                        {meta.name}
                      </h2>
                      <p className="text-xs text-muted-foreground">{meta.blurb}</p>
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
                      <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 text-xs text-foreground">
                        <StatusDot status={selectedStatus} />
                        <span className="min-w-0 truncate">
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

                    <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
                      <div className="min-w-0">
                        <p className="text-xs text-foreground">
                          Use as active provider
                        </p>
                        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
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
          ? "bg-muted-foreground"
          : status.ok === true
            ? status.active
              ? "bg-emerald-400"
              : "bg-sky-400"
            : status.ok === false
              ? "bg-rose-400"
              : "bg-muted-foreground/50",
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
        <span className="block text-xs text-foreground">{label}</span>
        <span className="mt-0.5 block text-[13px] leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
      {children}
    </label>
  );
}

function PrefRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-foreground">{title}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

function ThemeSwatch({
  mode,
  selected,
  background,
  label,
  locked,
  onClick,
}: {
  mode: "light" | "dark";
  selected: boolean;
  background: string;
  label: string;
  locked?: boolean;
  onClick: () => void;
}) {
  const Icon = locked ? Lock : mode === "light" ? Sun : Moon;
  return (
    <button
      type="button"
      title={locked ? `${label} (locked by Accent only)` : label}
      aria-label={locked ? `${label} (locked by Accent only)` : label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative size-9 rounded-full border border-black/15 transition-[box-shadow,transform]",
        selected
          ? "shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--theme-accent)]"
          : "hover:shadow-[0_0_0_2px_var(--background),0_0_0_3px_color-mix(in_oklab,var(--foreground)_35%,transparent)]",
      )}
      style={{ background }}
    >
      <span
        className={cn(
          "absolute bottom-0.5 left-0.5 grid size-3.5 place-items-center rounded-full",
          mode === "light"
            ? "bg-black/70 text-white"
            : "bg-white/90 text-black",
        )}
      >
        <Icon className="size-2.5" strokeWidth={2.5} />
      </span>
    </button>
  );
}

function ThemeCard({
  option,
  themeLight,
  themeDark,
  locked,
  onPickLight,
  onPickDark,
  className,
}: {
  option: AppThemeOption;
  themeLight: AppThemeOption;
  themeDark: AppThemeOption;
  locked?: boolean;
  onPickLight: (value: AppThemeOption) => void;
  onPickDark: (value: AppThemeOption) => void;
  className?: string;
}) {
  const swatch = APP_THEME_SWATCHES[option];
  const lightSelected = themeLight === option;
  const darkSelected = themeDark === option;
  const anySelected = lightSelected || darkSelected;
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border-2 bg-card p-3",
        anySelected ? "border-theme-accent" : "border-border",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <ThemeSwatch
          mode="light"
          selected={lightSelected}
          background={swatch.light}
          label={`${APP_THEME_LABELS[option]} for light`}
          locked={locked}
          onClick={() => onPickLight(option)}
        />
        <ThemeSwatch
          mode="dark"
          selected={darkSelected}
          background={swatch.dark}
          label={`${APP_THEME_LABELS[option]} for dark`}
          locked={locked}
          onClick={() => onPickDark(option)}
        />
      </div>
      <span className="text-xs text-foreground">
        {APP_THEME_LABELS[option]}
        {locked ? (
          <span className="ml-1.5 text-muted-foreground">· surfaces locked</span>
        ) : null}
      </span>
    </div>
  );
}

function Segmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string; title: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex shrink-0 rounded-md border border-border bg-muted/40 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          aria-label={option.title}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 min-w-8 rounded px-2 text-[11px] font-medium transition-colors",
            value === option.value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SchemePreview({ scheme }: { scheme: ColorSchemeOption }) {
  if (scheme === "system") {
    return (
      <div className="relative flex h-[72px] overflow-hidden bg-[#d4d4d8]">
        <div className="flex w-1/2 gap-1 bg-[#f4f4f5] p-2">
          <div className="w-3 rounded-sm bg-[#e4e4e7]" />
          <div className="flex flex-1 flex-col gap-1 pt-0.5">
            <div className="h-1.5 w-3/4 rounded-sm bg-[#d4d4d8]" />
            <div className="h-1.5 w-1/2 rounded-sm bg-[#e4e4e7]" />
            <div className="mt-auto h-4 rounded-sm bg-white ring-1 ring-black/5" />
          </div>
        </div>
        <div className="flex w-1/2 gap-1 bg-[#18181b] p-2">
          <div className="w-3 rounded-sm bg-[#27272a]" />
          <div className="flex flex-1 flex-col gap-1 pt-0.5">
            <div className="h-1.5 w-3/4 rounded-sm bg-[#3f3f46]" />
            <div className="h-1.5 w-1/2 rounded-sm bg-[#27272a]" />
            <div className="mt-auto h-4 rounded-sm bg-[#09090b] ring-1 ring-white/10" />
          </div>
        </div>
      </div>
    );
  }

  if (scheme === "light") {
    return (
      <div className="flex h-[72px] gap-1 bg-[#f4f4f5] p-2">
        <div className="w-3 rounded-sm bg-[#e4e4e7]" />
        <div className="flex flex-1 flex-col gap-1 pt-0.5">
          <div className="h-1.5 w-3/4 rounded-sm bg-[#d4d4d8]" />
          <div className="h-1.5 w-1/2 rounded-sm bg-[#e4e4e7]" />
          <div className="mt-auto h-5 rounded-sm bg-white ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[72px] gap-1 bg-[#18181b] p-2">
      <div className="w-3 rounded-sm bg-[#27272a]" />
      <div className="flex flex-1 flex-col gap-1 pt-0.5">
        <div className="h-1.5 w-3/4 rounded-sm bg-[#3f3f46]" />
        <div className="h-1.5 w-1/2 rounded-sm bg-[#27272a]" />
        <div className="mt-auto h-5 rounded-sm bg-[#09090b] ring-1 ring-white/10" />
      </div>
    </div>
  );
}
