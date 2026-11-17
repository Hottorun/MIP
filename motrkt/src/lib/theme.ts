import { useEffect, useState } from "react";

/** Light, dark, or whatever the system uses. The choice sits in localStorage and as data-theme on <html>. */
export type Theme = "system" | "light" | "dark";
const KEY = "mip-theme";

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/** Whether the page is drawn dark right now (explicit choice or system setting). */
export function isDark(theme: Theme): boolean {
  if (theme !== "system") return theme === "dark";
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  const [, rerender] = useState(0);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => rerender((n) => n + 1);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const setTheme = (next: Theme) => {
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    applyTheme(next);
    setThemeState(next);
  };
  return { theme, dark: isDark(theme), setTheme };
}
