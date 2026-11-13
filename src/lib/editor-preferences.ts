const MINIMAP_ENABLED_KEY = "learning-minimap-enabled";
export const MINIMAP_CHANGED_EVENT = "learning-minimap-changed";

const FONT_SIZE_KEY = "learning-editor-font-size";
export const FONT_SIZE_CHANGED_EVENT = "learning-font-size-changed";

const LINE_HEIGHT_KEY = "learning-editor-line-height";
export const LINE_HEIGHT_CHANGED_EVENT = "learning-line-height-changed";

const CONTENT_WIDTH_KEY = "learning-editor-content-width";
export const CONTENT_WIDTH_CHANGED_EVENT = "learning-content-width-changed";

const TOOLBAR_ENABLED_KEY = "learning-editor-toolbar-enabled";
export const TOOLBAR_CHANGED_EVENT = "learning-toolbar-changed";

const SPELLCHECK_ENABLED_KEY = "learning-editor-spellcheck-enabled";
export const SPELLCHECK_CHANGED_EVENT = "learning-spellcheck-changed";

const FONT_FAMILY_KEY = "learning-editor-font-family";
export const FONT_FAMILY_CHANGED_EVENT = "learning-font-family-changed";

const CLAIM_HIGHLIGHTS_KEY = "learning-editor-claim-highlights";
export const CLAIM_HIGHLIGHTS_CHANGED_EVENT = "learning-claim-highlights-changed";

export const FONT_SIZE_OPTIONS = ["sm", "md", "lg", "xl"] as const;
export type FontSizeOption = (typeof FONT_SIZE_OPTIONS)[number];

export const FONT_SIZE_LABELS: Record<FontSizeOption, string> = {
  sm: "Small",
  md: "Default",
  lg: "Large",
  xl: "Extra large",
};

export const LINE_HEIGHT_OPTIONS = ["compact", "default", "relaxed"] as const;
export type LineHeightOption = (typeof LINE_HEIGHT_OPTIONS)[number];

export const LINE_HEIGHT_LABELS: Record<LineHeightOption, string> = {
  compact: "Compact",
  default: "Default",
  relaxed: "Relaxed",
};

export const CONTENT_WIDTH_OPTIONS = ["narrow", "medium", "wide"] as const;
export type ContentWidthOption = (typeof CONTENT_WIDTH_OPTIONS)[number];

export const CONTENT_WIDTH_LABELS: Record<ContentWidthOption, string> = {
  narrow: "Narrow",
  medium: "Medium",
  wide: "Wide",
};

export const FONT_FAMILY_OPTIONS = ["sf-pro", "serif", "mono"] as const;
export type FontFamilyOption = (typeof FONT_FAMILY_OPTIONS)[number];

export const FONT_FAMILY_LABELS: Record<FontFamilyOption, string> = {
  "sf-pro": "SF Pro",
  serif: "Serif",
  mono: "Mono",
};

export const CLAIM_HIGHLIGHTS_OPTIONS = ["soft", "strong", "off"] as const;
export type ClaimHighlightsOption = (typeof CLAIM_HIGHLIGHTS_OPTIONS)[number];

export const CLAIM_HIGHLIGHTS_LABELS: Record<ClaimHighlightsOption, string> = {
  soft: "Soft",
  strong: "Strong",
  off: "Off",
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

export function readMinimapEnabled() {
  return readBool(MINIMAP_ENABLED_KEY, true);
}

export function writeMinimapEnabled(enabled: boolean) {
  localStorage.setItem(MINIMAP_ENABLED_KEY, String(enabled));
  window.dispatchEvent(
    new CustomEvent(MINIMAP_CHANGED_EVENT, { detail: { enabled } }),
  );
}

export function readFontSize(): FontSizeOption {
  return readEnum(FONT_SIZE_KEY, FONT_SIZE_OPTIONS, "md");
}

export function writeFontSize(size: FontSizeOption) {
  localStorage.setItem(FONT_SIZE_KEY, size);
  window.dispatchEvent(
    new CustomEvent(FONT_SIZE_CHANGED_EVENT, { detail: { size } }),
  );
}

export function readLineHeight(): LineHeightOption {
  return readEnum(LINE_HEIGHT_KEY, LINE_HEIGHT_OPTIONS, "default");
}

export function writeLineHeight(value: LineHeightOption) {
  localStorage.setItem(LINE_HEIGHT_KEY, value);
  window.dispatchEvent(
    new CustomEvent(LINE_HEIGHT_CHANGED_EVENT, { detail: { value } }),
  );
}

export function readContentWidth(): ContentWidthOption {
  return readEnum(CONTENT_WIDTH_KEY, CONTENT_WIDTH_OPTIONS, "wide");
}

export function writeContentWidth(value: ContentWidthOption) {
  localStorage.setItem(CONTENT_WIDTH_KEY, value);
  window.dispatchEvent(
    new CustomEvent(CONTENT_WIDTH_CHANGED_EVENT, { detail: { value } }),
  );
}

export function readToolbarEnabled() {
  return readBool(TOOLBAR_ENABLED_KEY, true);
}

export function writeToolbarEnabled(enabled: boolean) {
  localStorage.setItem(TOOLBAR_ENABLED_KEY, String(enabled));
  window.dispatchEvent(
    new CustomEvent(TOOLBAR_CHANGED_EVENT, { detail: { enabled } }),
  );
}

export function readSpellcheckEnabled() {
  return readBool(SPELLCHECK_ENABLED_KEY, true);
}

export function writeSpellcheckEnabled(enabled: boolean) {
  localStorage.setItem(SPELLCHECK_ENABLED_KEY, String(enabled));
  window.dispatchEvent(
    new CustomEvent(SPELLCHECK_CHANGED_EVENT, { detail: { enabled } }),
  );
}

export function readFontFamily(): FontFamilyOption {
  return readEnum(FONT_FAMILY_KEY, FONT_FAMILY_OPTIONS, "sf-pro");
}

export function writeFontFamily(value: FontFamilyOption) {
  localStorage.setItem(FONT_FAMILY_KEY, value);
  window.dispatchEvent(
    new CustomEvent(FONT_FAMILY_CHANGED_EVENT, { detail: { value } }),
  );
}

export function readClaimHighlights(): ClaimHighlightsOption {
  return readEnum(CLAIM_HIGHLIGHTS_KEY, CLAIM_HIGHLIGHTS_OPTIONS, "strong");
}

export function writeClaimHighlights(value: ClaimHighlightsOption) {
  localStorage.setItem(CLAIM_HIGHLIGHTS_KEY, value);
  window.dispatchEvent(
    new CustomEvent(CLAIM_HIGHLIGHTS_CHANGED_EVENT, { detail: { value } }),
  );
}
