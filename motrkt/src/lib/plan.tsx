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

/**
 * What premium costs to buy (server/payments.ts). Without one the purchase contract is the only way. `recurring`: a
 * subscription charged every `months` months; otherwise one payment for `months` months.
 */
export type Offer = { amount: number; currency: string; months: number; recurring?: boolean };
/** The account's subscription: running, cancelled to the end of the paid period, or with a payment that failed. */
export type Subscription = { status: "active" | "ending" | "past_due"; until: string | null };

/** "49 €", "9,90 CHF": the offer's price in the app's language. */
export const offerPrice = (o: Offer) =>
  new Intl.NumberFormat(locale(), { style: "currency", currency: o.currency, minimumFractionDigits: Number.isInteger(o.amount) ? 0 : 2 }).format(o.amount);

/** "im Monat", "im Jahr", "alle 3 Monate": how often a subscription is charged. */
export const offerEvery = (o: Offer) =>
  o.months === 1 ? t("im Monat", "a month") : o.months === 12 ? t("im Jahr", "a year") : t(`alle ${o.months} Monate`, `every ${o.months} months`);

/** "9,90 € im Monat" for a subscription, "49 €" for a one-time payment. */
export const offerRate = (o: Offer) => (o.recurring ? `${offerPrice(o)} ${offerEvery(o)}` : offerPrice(o));

/** "Monatlich", "Jährlich", "Alle 3 Monate": the name of a plan where two are on offer. */
export const offerPlan = (o: Offer) => (o.months === 1 ? t("Monatlich", "Monthly") : o.months === 12 ? t("Jährlich", "Yearly") : t(`Alle ${o.months} Monate`, `Every ${o.months} months`));

/** By how many percent an offer is cheaper per month than `base` (the shortest plan), rounded down; 0 when it is not. */
export const offerSaving = (o: Offer, base: Offer) => Math.max(0, Math.floor((1 - o.amount / o.months / (base.amount / base.months)) * 100 + 1e-9));

/**
 * How a subscription can be cancelled, as the terms have it (src/terms.ts, section 6): to the end of the paid period,
 * and a period longer than a month, once it has renewed, also with one month's notice.
 */
export const offerCancel = (o: Offer) => {
  if (o.months === 1) return t("Jederzeit im Konto kündbar, zum Ende des bezahlten Zeitraums", "Cancel in your account at any time, to the end of the period you paid for");
  const first = o.months === 12 ? t("dem ersten Jahr", "the first year") : t("dem ersten Abrechnungszeitraum", "the first billing period");
  return t(`Jederzeit kündbar zum Ende des bezahlten Zeitraums, nach ${first} auch mit einer Frist von einem Monat`, `Cancel at any time to the end of the period you paid for, after ${first} also with one month's notice`);
};

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
  /** premium for money, where payment is set up: the first of `offers`, the one the pages name a price from */
  offer: Offer | null;
  /** all plans on sale, the shortest billing period first: one, or a subscription charged by month and by year */
  offers: Offer[];
  /** Opens the payment page for this account and plan (the browser leaves the app); resolves to what to tell the user if that failed. */
  buy: (plan?: Offer) => Promise<string | null>;
  /** the account's subscription, if it has one that is not over */
  subscription: Subscription | null;
  /** Opens Stripe's page for the subscription (cancel, payment method, invoices); resolves like `buy`. */
  manage: () => Promise<string | null>;
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
  const [offers, setOffers] = useState<Offer[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
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
      .then((j: { offer?: Offer | null; offers?: Offer[]; subscription?: Subscription | null } | null) => {
        setOffers(j?.offers ?? (j?.offer ? [j.offer] : []));
        setSubscription(j?.subscription ?? null);
      })
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
  const buy = useCallback(async (plan?: Offer) => {
    const failed = t("Die Zahlungsseite ließ sich nicht öffnen. Bitte später noch einmal versuchen.", "The payment page could not be opened. Please try again later.");
    try {
      const r = await fetch("/api/premium/kaufen", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ back: window.location.pathname + window.location.search + window.location.hash, lang: isEn() ? "en" : "de", months: plan?.months }),
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (r.ok && j.url) {
        window.location.assign(j.url);
        return null;
      }
      if (j.error === "subscribed") return t("Sie haben bereits ein Abo. Sie verwalten es unter „Konto“.", "You already have a subscription. You manage it under “Account”.");
      if (j.error === "demo") return t("Mit dem geteilten Demo-Konto lässt sich nichts kaufen. Bitte legen Sie ein eigenes Konto an.", "The shared demo account cannot buy anything. Please create your own account.");
      if (r.status === 429) return t("Zu viele Versuche. Bitte in einer Stunde noch einmal.", "Too many attempts. Please try again in an hour.");
      return failed;
    } catch {
      return failed;
    }
  }, []);

  const manage = useCallback(async () => {
    const failed = t("Die Abo-Verwaltung ließ sich nicht öffnen. Bitte später noch einmal versuchen.", "The subscription page could not be opened. Please try again later.");
    try {
      const r = await fetch("/api/premium/verwalten", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ back: window.location.pathname + window.location.search + window.location.hash, lang: isEn() ? "en" : "de" }),
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string };
      if (r.ok && j.url) {
        window.location.assign(j.url);
        return null;
      }
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
      offer: offers[0] ?? null,
      offers,
      buy,
      subscription,
      manage,
      step,
      preview: previewing,
      setPreview,
      upgrade,
      openUpgrade,
      closeUpgrade,
      refresh,
    };
  }, [real, guest, preview, account, cars, months, offers, buy, subscription, manage, upgrade, setPreview, openUpgrade, closeUpgrade, refresh]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): Plan {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used inside <PlanProvider>");
  return ctx;
}

/**
 * The plan the user picks where two are on sale (components/premium/PlanPicker.tsx). Until they pick, it is the one
 * with the longest billing period: the lowest price per month.
 */
export function useOfferChoice(): [Offer | null, (o: Offer) => void] {
  const { offers } = usePlan();
  const [months, setMonths] = useState<number | null>(null);
  const chosen = offers.find((o) => o.months === months) ?? offers[offers.length - 1] ?? null;
  return [chosen, useCallback((o: Offer) => setMonths(o.months), [])];
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
