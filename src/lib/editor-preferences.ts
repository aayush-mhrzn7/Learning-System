export const MINIMAP_ENABLED_KEY = "learning-minimap-enabled";
export const MINIMAP_CHANGED_EVENT = "learning-minimap-changed";

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
