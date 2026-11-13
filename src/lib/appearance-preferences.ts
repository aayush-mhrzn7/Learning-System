export const COLOR_SCHEME_KEY = "learning-color-scheme";
export const COLOR_SCHEME_CHANGED_EVENT = "learning-color-scheme-changed";

/** @deprecated migrated into light/dark keys */
export const APP_THEME_KEY = "learning-app-theme";
export const APP_THEME_LIGHT_KEY = "learning-app-theme-light";
export const APP_THEME_DARK_KEY = "learning-app-theme-dark";
export const APP_THEME_CHANGED_EVENT = "learning-app-theme-changed";

export const ACCENT_ONLY_KEY = "learning-accent-only";
export const ACCENT_ONLY_CHANGED_EVENT = "learning-accent-only-changed";

export const REDUCE_MOTION_KEY = "learning-reduce-motion";
export const REDUCE_MOTION_CHANGED_EVENT = "learning-reduce-motion-changed";

export const COLOR_SCHEME_OPTIONS = ["system", "light", "dark"] as const;
export type ColorSchemeOption = (typeof COLOR_SCHEME_OPTIONS)[number];

export const APP_THEME_OPTIONS = [
  "classic",
  "learning",
  "rose",
  "grove",
  "ocean",
  "ember",
  "iris",
] as const;
export type AppThemeOption = (typeof APP_THEME_OPTIONS)[number];

export const APP_THEME_LABELS: Record<AppThemeOption, string> = {
  classic: "Black & White",
  learning: "Learning",
  rose: "Rose",
  grove: "Grove",
  ocean: "Ocean",
  ember: "Ember",
  iris: "Iris",
};

/** Preview swatches for the Appearance theme grid (light / dark). */
export const APP_THEME_SWATCHES: Record<
  AppThemeOption,
  { light: string; dark: string }
> = {
  classic: {
    light: "linear-gradient(135deg, #ffffff 0%, #e4e4e7 100%)",
    dark: "linear-gradient(135deg, #000000 0%, #27272a 100%)",
  },
  learning: {
    light: "linear-gradient(135deg, #f4f4f5 0%, #93c5fd 100%)",
    dark: "linear-gradient(135deg, #0a0a0a 0%, #1d4ed8 100%)",
  },
  rose: {
    light: "linear-gradient(135deg, #fff1f2 0%, #fb7185 100%)",
    dark: "linear-gradient(135deg, #1a0a0e 0%, #be123c 100%)",
  },
  grove: {
    light: "linear-gradient(135deg, #f0fdf4 0%, #4ade80 100%)",
    dark: "linear-gradient(135deg, #0a140e 0%, #15803d 100%)",
  },
  ocean: {
    light: "linear-gradient(135deg, #ecfeff 0%, #22d3ee 100%)",
    dark: "linear-gradient(135deg, #06141a 0%, #0e7490 100%)",
  },
  ember: {
    light: "linear-gradient(135deg, #fff7ed 0%, #fb923c 100%)",
    dark: "linear-gradient(135deg, #1a1008 0%, #c2410c 100%)",
  },
  iris: {
    light: "linear-gradient(135deg, #f5f3ff 0%, #a78bfa 100%)",
    dark: "linear-gradient(135deg, #120a1c 0%, #6d28d9 100%)",
  },
};

function readEnum<T extends string>(
  key: string,
  options: readonly T[],
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  const value = localStorage.getItem(key);
  if (value && (options as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

function readBool(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const value = localStorage.getItem(key);
  if (value === null) return fallback;
  return value !== "false";
}

function legacyThemeFallback(): AppThemeOption {
  const legacy = localStorage.getItem(APP_THEME_KEY);
  if (legacy && (APP_THEME_OPTIONS as readonly string[]).includes(legacy)) {
    return legacy as AppThemeOption;
  }
  return "classic";
}

export function readColorScheme(): ColorSchemeOption {
  return readEnum(COLOR_SCHEME_KEY, COLOR_SCHEME_OPTIONS, "dark");
}

export function writeColorScheme(value: ColorSchemeOption) {
  localStorage.setItem(COLOR_SCHEME_KEY, value);
  window.dispatchEvent(
    new CustomEvent(COLOR_SCHEME_CHANGED_EVENT, { detail: { value } }),
  );
}

export function readAppThemeLight(): AppThemeOption {
  if (typeof window === "undefined") return "classic";
  if (localStorage.getItem(APP_THEME_LIGHT_KEY)) {
    return readEnum(APP_THEME_LIGHT_KEY, APP_THEME_OPTIONS, "classic");
  }
  return legacyThemeFallback();
}

export function readAppThemeDark(): AppThemeOption {
  if (typeof window === "undefined") return "classic";
  if (localStorage.getItem(APP_THEME_DARK_KEY)) {
    return readEnum(APP_THEME_DARK_KEY, APP_THEME_OPTIONS, "classic");
  }
  return legacyThemeFallback();
}

export function writeAppThemeLight(value: AppThemeOption) {
  localStorage.setItem(APP_THEME_LIGHT_KEY, value);
  applyAppearance({ themeLight: value });
  window.dispatchEvent(
    new CustomEvent(APP_THEME_CHANGED_EVENT, {
      detail: { mode: "light", value },
    }),
  );
}

export function writeAppThemeDark(value: AppThemeOption) {
  localStorage.setItem(APP_THEME_DARK_KEY, value);
  applyAppearance({ themeDark: value });
  window.dispatchEvent(
    new CustomEvent(APP_THEME_CHANGED_EVENT, {
      detail: { mode: "dark", value },
    }),
  );
}

/** When true, color themes only tint accents — surfaces stay black & white. */
export function readAccentOnly() {
  return readBool(ACCENT_ONLY_KEY, true);
}

export function writeAccentOnly(enabled: boolean) {
  localStorage.setItem(ACCENT_ONLY_KEY, String(enabled));
  applyAppearance({ accentOnly: enabled });
  window.dispatchEvent(
    new CustomEvent(ACCENT_ONLY_CHANGED_EVENT, { detail: { enabled } }),
  );
}

export function readReduceMotion() {
  return readBool(REDUCE_MOTION_KEY, false);
}

export function writeReduceMotion(enabled: boolean) {
  localStorage.setItem(REDUCE_MOTION_KEY, String(enabled));
  window.dispatchEvent(
    new CustomEvent(REDUCE_MOTION_CHANGED_EVENT, { detail: { enabled } }),
  );
}

export function resolveColorScheme(
  scheme: ColorSchemeOption = readColorScheme(),
): "light" | "dark" {
  if (scheme === "light" || scheme === "dark") return scheme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Apply scheme / theme / motion to <html>. Safe to call from boot script or React. */
export function applyAppearance(options?: {
  scheme?: ColorSchemeOption;
  themeLight?: AppThemeOption;
  themeDark?: AppThemeOption;
  accentOnly?: boolean;
  reduceMotion?: boolean;
}) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const scheme = options?.scheme ?? readColorScheme();
  const themeLight = options?.themeLight ?? readAppThemeLight();
  const themeDark = options?.themeDark ?? readAppThemeDark();
  const accentOnly = options?.accentOnly ?? readAccentOnly();
  const reduceMotion = options?.reduceMotion ?? readReduceMotion();
  const resolved = resolveColorScheme(scheme);

  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("accent-only", accentOnly);
  root.dataset.theme = resolved === "dark" ? themeDark : themeLight;
  root.dataset.themeLight = themeLight;
  root.dataset.themeDark = themeDark;
  root.dataset.colorScheme = scheme;
  root.setAttribute("data-accent-only", accentOnly ? "true" : "false");
  if (reduceMotion) root.dataset.reduceMotion = "true";
  else delete root.dataset.reduceMotion;
}

/** Inline boot snippet — keep in sync with applyAppearance keys/defaults. */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem("learning-color-scheme")||"dark";var legacy=localStorage.getItem("learning-app-theme");var fallback=legacy||"classic";var tl=localStorage.getItem("learning-app-theme-light")||fallback;var td=localStorage.getItem("learning-app-theme-dark")||fallback;var ao=localStorage.getItem("learning-accent-only");var accentOnly=ao===null?true:ao!=="false";var m=localStorage.getItem("learning-reduce-motion")==="true";var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.classList.toggle("accent-only",accentOnly);r.dataset.theme=d?td:tl;r.dataset.themeLight=tl;r.dataset.themeDark=td;r.dataset.colorScheme=s;r.setAttribute("data-accent-only",accentOnly?"true":"false");if(m)r.dataset.reduceMotion="true";else delete r.dataset.reduceMotion;}catch(e){var r=document.documentElement;r.classList.add("dark");r.classList.add("accent-only");r.dataset.theme="classic";r.setAttribute("data-accent-only","true");}})();`;
