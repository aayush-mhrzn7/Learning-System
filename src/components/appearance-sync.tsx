"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { Toaster } from "sonner";
import {
  ACCENT_ONLY_CHANGED_EVENT,
  APP_THEME_CHANGED_EVENT,
  COLOR_SCHEME_CHANGED_EVENT,
  REDUCE_MOTION_CHANGED_EVENT,
  applyAppearance,
  resolveColorScheme,
  type AppThemeOption,
  type ColorSchemeOption,
} from "@/lib/appearance-preferences";

export function AppearanceSync() {
  const [toastTheme, setToastTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    function sync() {
      applyAppearance();
      setToastTheme(resolveColorScheme());
    }
    sync();

    function onScheme(event: Event) {
      const detail = (event as CustomEvent<{ value: ColorSchemeOption }>).detail;
      applyAppearance({ scheme: detail?.value });
      setToastTheme(resolveColorScheme(detail?.value));
    }
    function onTheme(event: Event) {
      const detail = (
        event as CustomEvent<{ mode: "light" | "dark"; value: AppThemeOption }>
      ).detail;
      if (detail?.mode === "light") {
        applyAppearance({ themeLight: detail.value });
      } else if (detail?.mode === "dark") {
        applyAppearance({ themeDark: detail.value });
      } else {
        applyAppearance();
      }
    }
    function onAccentOnly(event: Event) {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      applyAppearance({ accentOnly: detail?.enabled });
    }
    function onMotion(event: Event) {
      const detail = (event as CustomEvent<{ enabled: boolean }>).detail;
      applyAppearance({ reduceMotion: detail?.enabled });
    }

    window.addEventListener(COLOR_SCHEME_CHANGED_EVENT, onScheme);
    window.addEventListener(APP_THEME_CHANGED_EVENT, onTheme);
    window.addEventListener(ACCENT_ONLY_CHANGED_EVENT, onAccentOnly);
    window.addEventListener(REDUCE_MOTION_CHANGED_EVENT, onMotion);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystem() {
      applyAppearance();
      setToastTheme(resolveColorScheme());
    }
    media.addEventListener("change", onSystem);

    return () => {
      window.removeEventListener(COLOR_SCHEME_CHANGED_EVENT, onScheme);
      window.removeEventListener(APP_THEME_CHANGED_EVENT, onTheme);
      window.removeEventListener(ACCENT_ONLY_CHANGED_EVENT, onAccentOnly);
      window.removeEventListener(REDUCE_MOTION_CHANGED_EVENT, onMotion);
      media.removeEventListener("change", onSystem);
    };
  }, []);

  return (
    <Toaster
      theme={toastTheme}
      position="bottom-right"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--popover)",
          "--success-text": "var(--popover-foreground)",
          "--success-border": "var(--theme-accent)",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--popover-foreground)",
          "--error-border": "var(--destructive)",
          "--border-radius": "0px",
        } as React.CSSProperties
      }
    />
  );
}
