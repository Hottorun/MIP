import { createContext, Fragment, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";

/**
 * Two UI languages. Texts sit next to each other where they are used: t("Markt", "Market").
 * English uses en-GB formatting (day-month-year, € before the amount) since the prices are European.
 * Switching remounts the page tree, so every render (and every format helper) picks up the new language.
 */
export type Lang = "de" | "en";

const STORAGE_KEY = "mip-lang";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "de" || saved === "en") return saved;
  } catch {
    // storage blocked: fall back to the browser language
  }
  const prefs = typeof navigator !== "undefined" ? [...(navigator.languages ?? []), navigator.language] : [];
  return prefs.find(Boolean)?.toLowerCase().startsWith("de") ? "de" : "en";
}

let current: Lang = detect();

export const getLang = (): Lang => current;
export const isEn = () => current === "en";
/** Locale for Intl formatting. */
export const locale = () => (current === "en" ? "en-GB" : "de-DE");

/** Pick the text for the current language. Works for strings and JSX. */
export function t<T>(de: T, en: T): T {
  return current === "en" ? en : de;
}

/** Run fn with the given language, e.g. to index names in both languages. */
export function inLang<T>(l: Lang, fn: () => T): T {
  const prev = current;
  current = l;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

export const appTitle = () => t("Carbay – Marktintelligenz für klassische Sportwagen", "Carbay – Market intelligence for classic sports cars");

// Before the first render, so the static German <title> from index.html never shows in English.
if (typeof document !== "undefined") {
  document.documentElement.lang = current;
  document.title = appTitle();
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void } | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  current = lang;

  const setLang = useCallback((l: Lang) => {
    current = l;
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // not persisted; the choice still holds for this visit
    }
    setLangState(l);
  }, []);

  // Layout effect: runs before the pages' own effects, which may set a more specific title.
  useLayoutEffect(() => {
    document.documentElement.lang = lang;
    document.title = appTitle();
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <Fragment key={lang}>{children}</Fragment>
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}
