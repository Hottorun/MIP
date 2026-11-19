import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../state/store";
import { isEn, locale, t } from "../i18n";
import type { UserCar } from "./userCars";
import { LITE } from "../data/real/model";

/**
 * Guest, lite and premium. A guest (no account) sees what lite shows but keeps nothing: watchlist, alerts, portfolio,
 * saved listings and writing in the forum ask for a free account first (useNeedsAccount). Every account starts as lite: catalogue, market value of each variant, listings, portfolio, forum
 * and the auction calendar. Premium adds the analysis behind the value (history, sales, evidence, options), the
 * auction archive, Insights and the Co-Pilot. Two ways lead to premium: a purchase contract of a car bought or sold
 * (free, server/userCars.ts) or buying it (server/payments.ts, where payment is set up); reviewers always have it.
 *
 * The locks on the pages are presentation; what makes them hold is the data. A lite account's browser gets the lite
 * copies of the market data (scripts/data/lite.ts: no value histories, no sale prices), the server refuses it the
 * full files (server/auth.ts) and the Co-Pilot (server/api.ts).
 */

/** What the user was looking at when the upgrade dialog opened: it picks the headline. */
export type LockReason = "general" | "history" | "sales" | "evidence" | "assessment" | "options" | "figures" | "profile" | "auctions" | "insights" | "copilot" | "compare" | AccountReason;

/** What a guest tried that needs an account: the guest version of the dialog (components/premium/Upgrade.tsx) names it. */
export type AccountReason = "account" | "watchlist" | "alerts" | "portfolio" | "saved" | "forum";

/** The sign-in page, on "create account" or "sign in", coming back to this page afterwards. */
export function signInHref(register: boolean) {
  const here = window.location.pathname + window.location.search + window.location.hash;
  return `/anmelden?${register ? "neu&" : ""}next=${encodeURIComponent(here)}`;
}

/** What premium costs to buy (server/payments.ts). Without one the purchase contract is the only way. */
export type Offer = { amount: number; currency: string; months: number };

/** "49 €", "9,90 CHF": the offer's price in the app's language. */
export const offerPrice = (o: Offer) =>
  new Intl.NumberFormat(locale(), { style: "currency", currency: o.currency, minimumFractionDigits: Number.isInteger(o.amount) ? 0 : 2 }).format(o.amount);

/** Where a lite user stands on the way to premium, from their submissions. */
export type UnlockStep = "start" | "upload" | "review";

type Account = { username: string; admin: boolean; demo: boolean; premium: boolean; premiumUntil: string | null };

type Plan = {
  /** false until the first answer of the server (or the cached answer of the last visit) is there */
  ready: boolean;
  /** no account: the server answered "not signed in" */
  guest: boolean;
  premium: boolean;
  account: Account | null;
  premiumUntil: string | null;
  /** months of premium one approved purchase contract earns */
  months: number;
  /** premium for money, where payment is set up */
  offer: Offer | null;
  /** Opens the payment page for this account (the browser leaves the app); resolves to what to tell the user if that failed. */
  buy: () => Promise<string | null>;
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
  const [guest, setGuest] = useState(false);
  const [real, setReal] = useState<boolean | null>(cached === "premium" ? true : cached === "lite" ? false : null);
  const [cars, setCars] = useState<UserCar[]>([]);
  const [months, setMonths] = useState(12);
  const [offer, setOffer] = useState<Offer | null>(null);
  const navigate = useNavigate();
  const [preview, setPreviewState] = useState(() => read(() => sessionStorage, PREVIEW_KEY) === "1");
  const [upgrade, setUpgrade] = useState<Plan["upgrade"]>({ open: false, reason: "general" });
  const known = useRef<boolean | null>(null); // what the server said last, to notice the moment premium starts
  const loadedAt = useRef(0);

  const load = useCallback(async () => {
    loadedAt.current = Date.now();
    try {
      const r = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (r.status === 401) {
        setGuest(true);
        setAccount(null);
        write(() => localStorage, CACHE_KEY, "lite"); // the next visit starts without waiting, as lite
        return setReal(false);
      }
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
      setGuest(false);
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

  // Back from the payment page ("?premium=bezahlt&cs=<session>", server/payments.ts): the marks leave the address, the
  // server confirms the payment and grants it (the webhook does the same, whichever comes first), then the plan loads.
  const returned = useRef(false);
  const confirmPayment = useCallback(async () => {
    const q = new URLSearchParams(window.location.search);
    const session = q.get("cs");
    if (returned.current || q.get("premium") !== "bezahlt" || !session) return;
    returned.current = true;
    q.delete("premium");
    q.delete("cs");
    navigate({ pathname: window.location.pathname, search: q.toString(), hash: window.location.hash }, { replace: true });
    let status = "";
    try {
      const r = await fetch("/api/premium/bestaetigen", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session }),
      });
      status = r.ok ? String(((await r.json()) as { status?: string }).status ?? "") : "";
    } catch {
      /* the webhook grants it anyway */
    }
    toast(
      status === "paid"
        ? t("Zahlung erhalten. Premium ist freigeschaltet. Viel Freude damit!", "Payment received. Premium is unlocked. Enjoy!")
        : status === "open"
          ? t("Die Zahlung wurde nicht abgeschlossen.", "The payment was not completed.")
          : t("Danke! Premium startet, sobald Ihre Zahlung eingegangen ist.", "Thank you! Premium starts as soon as your payment has arrived."),
    );
  }, [navigate, toast]);

  useEffect(() => {
    void confirmPayment().then(load);
    fetch("/api/premium/angebot", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { offer?: Offer | null } | null) => setOffer(j?.offer ?? null))
      .catch(() => {});
    // a review is decided while the user is away: look again when they come back to the tab
    const onVisible = () => {
      if (document.visibilityState === "visible" && known.current !== true && Date.now() - loadedAt.current > RECHECK_MS) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, confirmPayment]);

  const setPreview = useCallback((on: boolean) => {
    write(() => sessionStorage, PREVIEW_KEY, on ? "1" : null);
    setPreviewState(on);
  }, []);
  const openUpgrade = useCallback((reason: LockReason = "general") => setUpgrade({ open: true, reason }), []);
  const closeUpgrade = useCallback(() => setUpgrade((u) => ({ ...u, open: false })), []);
  const refresh = useCallback(() => void load(), [load]);
  const buy = useCallback(async () => {
    const failed = t("Die Zahlungsseite ließ sich nicht öffnen. Bitte später noch einmal versuchen.", "The payment page could not be opened. Please try again later.");
    try {
      const r = await fetch("/api/premium/kaufen", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ back: window.location.pathname + window.location.search + window.location.hash, lang: isEn() ? "en" : "de" }),
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (r.ok && j.url) {
        window.location.assign(j.url);
        return null;
      }
      if (j.error === "demo") return t("Mit dem geteilten Demo-Konto lässt sich nichts kaufen. Bitte legen Sie ein eigenes Konto an.", "The shared demo account cannot buy anything. Please create your own account.");
      if (r.status === 429) return t("Zu viele Versuche. Bitte in einer Stunde noch einmal.", "Too many attempts. Please try again in an hour.");
      return failed;
    } catch {
      return failed;
    }
  }, []);

  const value = useMemo<Plan>(() => {
    const previewing = preview && Boolean(account?.admin);
    const step: UnlockStep = cars.some((c) => c.status === "pending") ? "review" : cars.some((c) => c.status === "awaiting_contract") ? "upload" : "start";
    return {
      ready: real !== null,
      guest,
      premium: real === true && !previewing,
      account,
      premiumUntil: account?.premiumUntil ?? null,
      months,
      offer,
      buy,
      step,
      preview: previewing,
      setPreview,
      upgrade,
      openUpgrade,
      closeUpgrade,
      refresh,
    };
  }, [real, guest, preview, account, cars, months, offer, buy, upgrade, setPreview, openUpgrade, closeUpgrade, refresh]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): Plan {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used inside <PlanProvider>");
  return ctx;
}

/**
 * For the things a guest cannot keep: runs `action` for an account, and for a guest opens the dialog that asks for a
 * free account instead (naming what they tried).
 */
export function useNeedsAccount() {
  const { guest, openUpgrade } = usePlan();
  return useCallback(
    (reason: AccountReason, action: () => void) => {
      if (guest) openUpgrade(reason);
      else action();
    },
    [guest, openUpgrade],
  );
}
