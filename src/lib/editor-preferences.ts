export const MINIMAP_ENABLED_KEY = "learning-minimap-enabled";
export const MINIMAP_CHANGED_EVENT = "learning-minimap-changed";

export const FONT_SIZE_KEY = "learning-editor-font-size";
export const FONT_SIZE_CHANGED_EVENT = "learning-font-size-changed";

export const FONT_SIZE_OPTIONS = ["sm", "md", "lg", "xl"] as const;
export type FontSizeOption = (typeof FONT_SIZE_OPTIONS)[number];

export const FONT_SIZE_LABELS: Record<FontSizeOption, string> = {
  sm: "Small",
  md: "Default",
  lg: "Large",
  xl: "Extra large",
};

export function readMinimapEnabled() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MINIMAP_ENABLED_KEY) !== "false";
}

export function writeMinimapEnabled(enabled: boolean) {
  localStorage.setItem(MINIMAP_ENABLED_KEY, String(enabled));
  window.dispatchEvent(
    new CustomEvent(MINIMAP_CHANGED_EVENT, { detail: { enabled } }),
  );
}

export function readFontSize(): FontSizeOption {
  if (typeof window === "undefined") return "md";
  const value = localStorage.getItem(FONT_SIZE_KEY);
  if (value && (FONT_SIZE_OPTIONS as readonly string[]).includes(value)) {
    return value as FontSizeOption;
  }
  return "md";
}

export function writeFontSize(size: FontSizeOption) {
  localStorage.setItem(FONT_SIZE_KEY, size);
  window.dispatchEvent(
    new CustomEvent(FONT_SIZE_CHANGED_EVENT, { detail: { size } }),
  );
}
