"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  COLOR_SCHEME_CHANGED_EVENT,
  resolveColorScheme,
  writeColorScheme,
} from "@/lib/appearance-preferences";

export function ColorSchemeToggle() {
  const [scheme, setScheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const sync = () => setScheme(resolveColorScheme());
    sync();
    window.addEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
  }, []);

  const next = scheme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => writeColorScheme(next)}
      className="icon-button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {scheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
