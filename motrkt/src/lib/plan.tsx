import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "../state/store";
import { t } from "../i18n";
import type { UserCar } from "./userCars";
import { LITE } from "../data/real/model";

/**
 * Lite and premium. Every account starts as lite: catalogue, market value of each variant, listings, portfolio, forum
 * and the auction calendar. Premium adds the analysis behind the value (history, sales, evidence, options), the
 * auction archive, Insights and the Co-Pilot. Premium is earned with a purchase contract or an appraisal
 * (server/userCars.ts); reviewers always have it.
 *
 * The locks on the pages are presentation; what makes them hold is the data. A lite account's browser gets the lite
 * copies of the market data (scripts/data/lite.ts: no value histories, no sale prices), the server refuses it the
 * full files (server/auth.ts) and the Co-Pilot (server/api.ts).
 */

/** What the user was looking at when the upgrade dialog opened: it picks the headline. */
export type LockReason = "general" | "history" | "sales" | "evidence" | "assessment" | "options" | "figures" | "profile" | "auctions" | "insights" | "copilot" | "compare";

/** Where a lite user stands on the way to premium, from their submissions. */
export type UnlockStep = "start" | "upload" | "review";

type Account = { username: string; admin: boolean; demo: boolean; premium: boolean; premiumUntil: string | null };

type Plan = {
  /** false until the first answer of the server (or the cached answer of the last visit) is there */
  ready: boolean;
  premium: boolean;
  account: Account | null;
  premiumUntil: string | null;
  /** months of premium one approved document earns */
  months: number;
  step: UnlockStep;
  /** a reviewer looking at the app as a lite user (Account page) */
  preview: boolean;
  setPreview: (on: boolean) => void;
  upgrade: { open: boolean; reason: LockReason };
  openUpgrade: (reason?: LockReason) => void;
  closeUpgrade: () => void;
  /** ask the server again, e.g. after a submission */
  refresh: () => void;
};

const CACHE_KEY = "mip:plan";
const PREVIEW_KEY = "mip:lite-preview";
const RELOAD_KEY = "mip:premium-reload";
const RECHECK_MS = 60_000;

const read = (store: () => Storage, key: string) => {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
};
const write = (store: () => Storage, key: string, value: string | null) => {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {
    /* storage blocked */
  }
};

const PlanContext = createContext<Plan | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { toast } = useStore();
  // the answer of the last visit, so a premium user never sees the locks flash up while the request runs
  const cached = read(() => localStorage, CACHE_KEY);
  const [account, setAccount] = useState<Account | null>(null);
  const [real, setReal] = useState<boolean | null>(cached === "premium" ? true : cached === "lite" ? false : null);
  const [cars, setCars] = useState<UserCar[]>([]);
  const [months, setMonths] = useState(12);
  const [preview, setPreviewState] = useState(() => read(() => sessionStorage, PREVIEW_KEY) === "1");
  const [upgrade, setUpgrade] = useState<Plan["upgrade"]>({ open: false, reason: "general" });
  const known = useRef<boolean | null>(null); // what the server said last, to notice the moment premium starts
  const loadedAt = useRef(0);

  const load = useCallback(async () => {
    loadedAt.current = Date.now();
    try {
      const r = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!r.ok) return setReal((p) => p ?? false);
      const j = (await r.json()) as Partial<Account>;
      const acc: Account = {
        username: String(j.username ?? ""),
        admin: Boolean(j.admin),
        demo: Boolean(j.demo),
        premium: Boolean(j.premium),
        premiumUntil: j.premiumUntil ?? null,
      };
      setAccount(acc);
      setReal(acc.premium);
      write(() => localStorage, CACHE_KEY, acc.premium ? "premium" : "lite");
      if (known.current === false && acc.premium) toast(t("Premium ist freigeschaltet. Viel Freude damit!", "Premium is unlocked. Enjoy!"));
      known.current = acc.premium;
      // Premium, but the browser holds the lite data (it was loaded before the approval): load the app again with the
      // full data. Once only, so a server that still refuses the full files cannot send the page in circles.
      if (acc.premium && LITE && read(() => sessionStorage, RELOAD_KEY) !== "1") {
        write(() => sessionStorage, RELOAD_KEY, "1");
        window.setTimeout(() => window.location.reload(), 1800);
      }
      if (!LITE) write(() => sessionStorage, RELOAD_KEY, null);
      if (acc.premium) return;
      // a lite user's submissions: the floating button and the dialog show where the review stands
      const f = await fetch("/api/fahrzeuge", { credentials: "same-origin" });
      if (!f.ok) return;
      const list = (await f.json()) as { cars?: UserCar[]; premiumMonths?: number };
      setCars(list.cars ?? []);
      if (list.premiumMonths) setMonths(list.premiumMonths);
    } catch {
      setReal((p) => p ?? false); // offline or no server: the lite view, never a blank page
    }
  }, [toast]);

  useEffect(() => {
    void load();
    // a review is decided while the user is away: look again when they come back to the tab
    const onVisible = () => {
      if (document.visibilityState === "visible" && known.current !== true && Date.now() - loadedAt.current > RECHECK_MS) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const setPreview = useCallback((on: boolean) => {
    write(() => sessionStorage, PREVIEW_KEY, on ? "1" : null);
    setPreviewState(on);
  }, []);
  const openUpgrade = useCallback((reason: LockReason = "general") => setUpgrade({ open: true, reason }), []);
  const closeUpgrade = useCallback(() => setUpgrade((u) => ({ ...u, open: false })), []);
  const refresh = useCallback(() => void load(), [load]);

  const value = useMemo<Plan>(() => {
    const previewing = preview && Boolean(account?.admin);
    const step: UnlockStep = cars.some((c) => c.status === "pending") ? "review" : cars.some((c) => c.status === "awaiting_contract") ? "upload" : "start";
    return {
      ready: real !== null,
      premium: real === true && !previewing,
      account,
      premiumUntil: account?.premiumUntil ?? null,
      months,
      step,
      preview: previewing,
      setPreview,
      upgrade,
      openUpgrade,
      closeUpgrade,
      refresh,
    };
  }, [real, preview, account, cars, months, upgrade, setPreview, openUpgrade, closeUpgrade, refresh]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): Plan {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used inside <PlanProvider>");
  return ctx;
}
