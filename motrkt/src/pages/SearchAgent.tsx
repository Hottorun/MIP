import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUpRight, Pause, Pencil, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { brands, variantById, variantTitle, variants } from "../data/db";
import { isEn, t } from "../i18n";
import { cn, num } from "../lib/format";
import { offerEvery, offerPrice, signInHref, usePlan } from "../lib/plan";
import { api } from "../lib/userCars";
import { EMPTY_DRAFT, askingPrice, dayTime, draftOf, type Addon, type Match, type Order, type OrderDraft, type Orders } from "../lib/searchAgent";
import { Card, Empty, Pill, useConfirm } from "../components/ui";
import { LockedBody } from "../components/premium/Locked";

const digits = (s: string) => s.replace(/\D/g, "");

const ERRORS: Record<string, () => string> = {
  query: () => t("Beschreiben Sie bitte in ein, zwei Sätzen, was Sie suchen.", "Please describe in a sentence or two what you are looking for."),
  priceMax: () => t("Preis: bitte einen Betrag ab 1.000 € eingeben.", "Price: please enter an amount from €1,000."),
  yearFrom: () => t("Baujahr ab: bitte ein Jahr eingeben.", "Year from: please enter a year."),
  yearTo: () => t("Baujahr bis: bitte ein Jahr eingeben, nicht vor „ab“.", "Year to: please enter a year, not before “from”."),
  kmMax: () => t("Laufleistung: bitte eine Zahl eingeben.", "Mileage: please enter a number."),
  max: () => t("Alle Ihre Suchaufträge sind belegt. Buchen Sie einen weiteren dazu oder pausieren Sie einen.", "All your search orders are in use. Add another one or pause one."),
  kept: () => t("So viele Suchaufträge lassen sich nicht aufbewahren. Löschen Sie bitte einen pausierten.", "That many search orders cannot be kept. Please delete a paused one."),
  too_many: () => t("Zu viele Änderungen für heute. Morgen geht es weiter.", "Too many changes for today. Please try again tomorrow."),
  demo: () => t("Das Demo-Konto speichert und bucht keine Suchaufträge.", "The demo account does not keep or buy search orders."),
  migration: () => t("Der Suchagent wird gerade eingerichtet. Bitte später erneut versuchen.", "The search agent is being set up. Please try again later."),
  ai: () => t("Der Agent ist gerade nicht erreichbar.", "The agent is not available right now."),
  unavailable: () => t("Zusätzliche Suchaufträge lassen sich gerade nicht buchen.", "Further search orders cannot be booked right now."),
  stripe: () => t("Die Zahlungsseite ist gerade nicht erreichbar. Bitte später erneut versuchen.", "The payment page cannot be reached right now. Please try again later."),
  none: () => t("Zu diesem Konto gibt es kein Abo.", "There is no subscription for this account."),
};
const errorText = (e: unknown) => {
  const body = (e as { body?: { error?: string; field?: string } }).body;
  return (ERRORS[body?.field ?? ""] ?? ERRORS[body?.error ?? ""] ?? (() => t("Das hat nicht geklappt. Bitte erneut versuchen.", "That did not work. Please try again.")))();
};
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** "6,90 € im Monat": what one further search order costs. */
const addonRate = (a: Addon) => `${offerPrice(a)} ${offerEvery(a)}`;

/**
 * The search agent: the customer says what they are looking for, and once a day Claude compares that with the stock
 * of the dealers the reviewers entered (/suchquellen) and reports what fits (server/searchApi.ts). How many orders
 * run: none with lite, three with premium, and with either as many more as the account subscribed to
 * (server/searchPayments.ts). Without an account there is only a preview.
 */
export default function SearchAgent() {
  const { guest, ready, openUpgrade } = usePlan();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Orders | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { confirm, dialog } = useConfirm();
  const signedIn = ready && !guest;

  const load = useCallback(
    () =>
      api<Orders>("/api/suchagent")
        .then((d) => {
          setData(d);
          setError((e) => (e === "load" || e === "migration" ? "" : e));
        })
        .catch((e) => setError((e as { body?: { error?: string } }).body?.error === "migration" ? "migration" : "load")),
    [],
  );
  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);
  // while an order is queued or being analysed, ask again every few seconds
  const running = data?.orders.some((o) => o.running) ?? false;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [running, load]);

  // Back from the payment page ("?suche=bezahlt&cs=<session>", server/searchPayments.ts): the marks leave the
  // address, and the server grants the further orders at once if the payment is through.
  const returned = useRef(false);
  useEffect(() => {
    const session = params.get("cs");
    if (returned.current || !signedIn || params.get("suche") !== "bezahlt" || !session) return;
    returned.current = true;
    const q = new URLSearchParams(params);
    q.delete("suche");
    q.delete("cs");
    setParams(q, { replace: true });
    api<{ status: "paid" | "pending" }>("/api/suchagent/abo/bestaetigen", post({ session }))
      .then((r) =>
        setNotice(
          r.status === "paid"
            ? t("Vielen Dank. Ihre zusätzlichen Suchaufträge sind freigeschaltet; die Bestätigung kommt per E-Mail.", "Thank you. Your further search orders are unlocked; the confirmation is on its way by email.")
            : t("Vielen Dank. Sobald die Zahlung eingegangen ist, schalten wir die zusätzlichen Suchaufträge frei.", "Thank you. As soon as the payment has arrived, we unlock the further search orders."),
        ),
      )
      .catch(() => setNotice(t("Die Zahlung konnten wir noch nicht zuordnen. Ist sie durch, erscheinen die Suchaufträge in Kürze von selbst.", "We could not match the payment yet. If it went through, the search orders appear by themselves shortly.")))
      .finally(load);
  }, [params, setParams, signedIn, load]);

  if (ready && guest) return <Preview />;

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
    await load();
  };
  /** To Stripe's payment page (further orders) or customer portal (cancel, invoices): the browser leaves the app. */
  const leave = async (path: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>(path, post({ back: "/suchagent", lang: isEn() ? "en" : "de", quantity: 1 }));
      window.location.assign(r.url);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const orders = data?.orders ?? [];
  const active = orders.filter((o) => o.active).length;
  const canAdd = data !== null && active < data.plan.allowed;

  return (
    <div className="space-y-8">
      {dialog}
      <Head />
      {notice && <p className="rounded-box border border-up/30 bg-up-soft px-4 py-3 text-[14.5px] text-up">{notice}</p>}
      {error === "migration" && <p className="text-muted">{ERRORS.migration()}</p>}
      {error === "load" && <p className="text-down">{t("Konnte nicht geladen werden.", "Could not be loaded.")}</p>}
      {error && error !== "load" && error !== "migration" && <p className="text-down">{error}</p>}
      {!data && !error && <p className="text-faint">{t("Wird geladen …", "Loading …")}</p>}
      {data && !data.ai && <p className="text-[14px] text-warn">{t("Der Agent ist auf diesem Server nicht eingerichtet; Aufträge werden gespeichert, aber noch nicht ausgewertet.", "The agent is not set up on this server; orders are saved but not analysed yet.")}</p>}

      {data && (
        <PlanPanel
          data={data}
          active={active}
          busy={busy}
          onBuy={() => leave("/api/suchagent/abo/kaufen")}
          onManage={() => leave("/api/suchagent/abo/verwalten")}
          onPremium={() => openUpgrade("agent")}
        />
      )}

      {orders.map((o) =>
        editing === o.id ? (
          <OrderForm
            key={o.id}
            title={t("Suchauftrag ändern", "Edit search order")}
            initial={draftOf(o)}
            submitLabel={t("Speichern und neu suchen", "Save and search again")}
            onCancel={() => setEditing(null)}
            onSubmit={async (body) => {
              await api(`/api/suchagent/${o.id}`, { ...post(body), method: "PUT" });
              setEditing(null);
              await load();
            }}
          />
        ) : (
          <OrderCard
            key={o.id}
            order={o}
            onEdit={() => setEditing(o.id)}
            onRun={() => act(() => api(`/api/suchagent/${o.id}/lauf`, { method: "POST" }))}
            onToggle={() => act(() => api(`/api/suchagent/${o.id}`, { ...post({ active: !o.active }), method: "PUT" }))}
            onDelete={async () => {
              if (await confirm(t(`Suchauftrag „${o.title}“ mit seinen Treffern löschen?`, `Delete the search order “${o.title}” and its matches?`), { confirmLabel: t("Löschen", "Delete") }))
                await act(() => api(`/api/suchagent/${o.id}`, { method: "DELETE" }));
            }}
          />
        ),
      )}

      {data && canAdd && (editing === "new" || !orders.length) && (
        <OrderForm
          title={orders.length ? t("Neuer Suchauftrag", "New search order") : t("Ihr erster Suchauftrag", "Your first search order")}
          initial={EMPTY_DRAFT}
          submitLabel={t("Suchauftrag anlegen", "Create search order")}
          onCancel={orders.length ? () => setEditing(null) : undefined}
          onSubmit={async (body) => {
            await api("/api/suchagent", post(body));
            setEditing(null);
            await load();
          }}
        />
      )}
      {data && canAdd && orders.length > 0 && editing === null && (
        <div>
          <button className="btn" onClick={() => setEditing("new")}>
            <Plus className="size-4" strokeWidth={1.6} aria-hidden /> {t("Weiterer Suchauftrag", "Another search order")}
          </button>
        </div>
      )}

      {data && (
        <p className="max-w-3xl text-[12.5px] leading-relaxed text-faint">
          {t(
            `Der Agent liest einmal täglich den Bestand von ${data.sources === 1 ? "einem Händler" : `${num(data.sources)} Händlern`}, die Cartag auswählt, und gleicht ihn mit Ihren Aufträgen ab. Die Auswertung übernimmt Claude von Anthropic; dafür wird Ihre Suchbeschreibung dorthin übermittelt, ohne Ihren Namen. Treffer und Marktlage sind eine Einschätzung, keine Anlageberatung; Angaben zu den Fahrzeugen stammen von den Händlern.`,
            `Once a day the agent reads the stock of ${data.sources === 1 ? "one dealer" : `${num(data.sources)} dealers`} selected by Cartag and compares it with your orders. The analysis is done by Claude from Anthropic; your search description is sent there for it, without your name. Matches and the market view are an assessment, not investment advice; the details of the cars come from the dealers.`,
          )}
        </p>
      )}
    </div>
  );
}

/**
 * What the account may run and how to get more: premium brings three orders, and any account can subscribe to
 * further ones, one price per order. The order itself is placed on Stripe's payment page, which shows price, term
 * and the terms again; the number of orders can be changed there.
 */
function PlanPanel({ data, active, busy, onBuy, onManage, onPremium }: { data: Orders; active: number; busy: boolean; onBuy: () => void; onManage: () => void; onPremium: () => void }) {
  const { plan, addon, subscriptions } = data;
  const full = active >= plan.allowed;
  const ending = subscriptions.filter((s) => s.status === "ending");
  const pastDue = subscriptions.some((s) => s.status === "past_due");
  return (
    <section className="panel px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-[22px] leading-tight tabular-nums">
              {t(`${active} von ${plan.allowed}`, `${active} of ${plan.allowed}`)} <span className="text-[15px] text-muted">{plan.allowed === 1 ? t("Suchauftrag belegt", "search order in use") : t("Suchaufträgen belegt", "search orders in use")}</span>
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            {plan.premium
              ? t(`${plan.included} Suchaufträge sind in Premium enthalten`, `${plan.included} search orders are included in premium`)
              : t("In Lite ist kein Suchauftrag enthalten; Premium bringt drei mit", "Lite includes no search order; premium brings three")}
            {plan.extra > 0 && t(`, ${plan.extra} ${plan.extra === 1 ? "weiterer läuft" : "weitere laufen"} im Abo`, `, ${plan.extra} more by subscription`)}
            {addon ? t(`. Jeder weitere kostet ${addonRate(addon)}, mit jedem Konto.`, `. Each further one costs ${addonRate(addon)}, with any account.`) : "."}
          </p>
          {ending.map((s) => (
            <p key={s.until} className="mt-1 text-[13px] text-warn">
              {t(
                `Gekündigt: ${s.quantity} ${s.quantity === 1 ? "zusätzlicher Suchauftrag endet" : "zusätzliche Suchaufträge enden"}${s.until ? ` am ${dayTime(s.until)}` : ""}.`,
                `Cancelled: ${s.quantity} further search order${s.quantity === 1 ? "" : "s"} end${s.quantity === 1 ? "s" : ""}${s.until ? ` on ${dayTime(s.until)}` : ""}.`,
              )}
            </p>
          ))}
          {pastDue && <p className="mt-1 text-[13px] text-down">{t("Eine Abbuchung für Ihr Abo ist fehlgeschlagen. Bitte prüfen Sie unter „Abo verwalten“ Ihr Zahlungsmittel.", "A charge for your subscription failed. Please check your means of payment under “Manage subscription”.")}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!plan.premium && (
            <button className="btn" onClick={onPremium}>
              {t("Premium: 3 inklusive", "Premium: 3 included")}
            </button>
          )}
          {addon && (
            <button className={cn("btn", full && "btn-gold")} onClick={onBuy} disabled={busy}>
              <Plus className="size-4" strokeWidth={1.6} aria-hidden /> {t(`Suchauftrag dazubuchen · ${addonRate(addon)}`, `Add a search order · ${addonRate(addon)}`)}
            </button>
          )}
        </div>
      </div>
      {(addon || subscriptions.length > 0) && (
        <p className="mt-3 border-t border-line pt-3 text-[12.5px] leading-relaxed text-faint">
          {addon &&
            t(
              "Zusätzliche Suchaufträge sind ein Abo je Auftrag: Es verlängert sich von selbst und ist jederzeit zum Ende des bezahlten Zeitraums kündbar. Bestellt wird auf der Zahlungsseite von Stripe; dort lässt sich auch die Anzahl ändern. ",
              "Further search orders are a subscription per order: it renews by itself and can be cancelled at any time to the end of the paid period. The order is placed on Stripe’s payment page, where the number can be changed too. ",
            )}
          {addon && (
            <>
              {t("Es gelten die ", "Our ")}
              <a className="underline hover:text-ink" href={`/agb${isEn() ? "?lang=en" : ""}`}>{t("AGB", "terms")}</a>
              {t("; Sie können binnen 14 Tagen ", " apply; you may ")}
              <a className="underline hover:text-ink" href={`/widerruf${isEn() ? "?lang=en" : ""}`}>{t("widerrufen", "withdraw")}</a>
              {t(". ", " within 14 days. ")}
            </>
          )}
          {subscriptions.length > 0 && (
            <button className="underline hover:text-ink disabled:opacity-50" onClick={onManage} disabled={busy}>
              {t("Abo verwalten oder kündigen", "Manage or cancel subscription")}
            </button>
          )}
        </p>
      )}
    </section>
  );
}

function Head() {
  return (
    <header className="max-w-2xl">
      <div className="text-[11px] font-medium tracking-[0.18em] text-gold uppercase">{t("Täglich für Sie am Markt", "On the market for you, every day")}</div>
      <h1 className="mt-2 font-display text-heading text-[44px] leading-[1.05] sm:text-[56px]">{t("Suchagent", "Search agent")}</h1>
      <p className="mt-3 font-display text-[17px] leading-relaxed text-muted italic">
        {t(
          "Sagen Sie, welches Auto Sie suchen. Der Agent prüft jeden Morgen den Bestand ausgewählter Händler und meldet, was passt und wie der Markt dafür steht.",
          "Say which car you are looking for. Every morning the agent checks the stock of selected dealers and reports what fits and how the market stands.",
        )}
      </p>
    </header>
  );
}

function OrderCard({ order: o, onEdit, onRun, onToggle, onDelete }: { order: Order; onEdit: () => void; onRun: () => void; onToggle: () => void; onDelete: () => void }) {
  const fresh = o.matches.filter((m) => m.isNew).length;
  const limits = [
    o.variantTitle,
    o.priceMax !== null && t(`bis ${askingPrice(o.priceMax, "EUR")}`, `up to ${askingPrice(o.priceMax, "EUR")}`),
    (o.yearFrom !== null || o.yearTo !== null) && `${t("Baujahr", "Year")} ${o.yearFrom ?? "…"}–${o.yearTo ?? "…"}`,
    o.kmMax !== null && t(`bis ${num(o.kmMax)} km`, `up to ${num(o.kmMax)} km`),
  ].filter(Boolean) as string[];
  const icon = "inline-flex items-center gap-1.5 rounded-box px-2 py-1 text-[13px] text-muted transition-colors hover:bg-panel-3 hover:text-ink disabled:opacity-40";
  return (
    <section className="panel">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[24px] leading-tight text-heading">{o.title}</h2>
            {!o.active ? (
              <Pill>{t("Pausiert", "Paused")}</Pill>
            ) : o.running ? (
              <Pill tone="gold">
                <RefreshCw className="size-3 animate-spin motion-reduce:animate-none" aria-hidden /> {t("Agent sucht …", "Agent is searching …")}
              </Pill>
            ) : o.waiting ? (
              <Pill tone="warn">{t("Wartet auf freien Platz", "Waiting for a free place")}</Pill>
            ) : (
              <Pill tone="up">{t("Aktiv", "Active")}</Pill>
            )}
            {fresh > 0 && <Pill tone="accent">{t(`${fresh} neu`, `${fresh} new`)}</Pill>}
          </div>
          {o.query !== o.title && <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-ink/90">{o.query}</p>}
          {limits.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {limits.map((l) => (
                <Pill key={l}>{l}</Pill>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-0.5">
          <button className={icon} onClick={onRun} disabled={!o.active || o.running || o.waiting} title={t("Jetzt erneut prüfen", "Check again now")}>
            <RefreshCw className="size-3.5" strokeWidth={1.6} aria-hidden /> {t("Jetzt prüfen", "Check now")}
          </button>
          <button className={icon} onClick={onEdit}>
            <Pencil className="size-3.5" strokeWidth={1.6} aria-hidden /> {t("Ändern", "Edit")}
          </button>
          <button className={icon} onClick={onToggle}>
            {o.active ? <Pause className="size-3.5" strokeWidth={1.6} aria-hidden /> : <Play className="size-3.5" strokeWidth={1.6} aria-hidden />}
            {o.active ? t("Pausieren", "Pause") : t("Fortsetzen", "Resume")}
          </button>
          <button className={cn(icon, "hover:text-down")} onClick={onDelete} aria-label={t("Suchauftrag löschen", "Delete search order")}>
            <Trash2 className="size-3.5" strokeWidth={1.6} aria-hidden />
          </button>
        </div>
      </header>

      <div className="space-y-6 px-5 pt-5 pb-5">
        {o.summary ? (
          <div className="border-l-2 border-gold/60 pl-4">
            <div className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
              {t("Marktlage", "Market view")}
              {o.summaryAt && <span className="ml-2 tracking-normal text-faint normal-case">{t(`Stand ${dayTime(o.summaryAt)}`, `as of ${dayTime(o.summaryAt)}`)}</span>}
            </div>
            <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed whitespace-pre-line">{o.summary}</p>
          </div>
        ) : (
          <p className="text-[14px] text-muted">
            {o.running
              ? t("Der Agent sieht sich gerade den Bestand der Händler an. Das dauert etwa eine Minute.", "The agent is looking through the dealers’ stock. This takes about a minute.")
              : o.waiting
                ? t("Der Auftrag ruht, weil alle Ihre Suchaufträge belegt sind. Buchen Sie einen weiteren dazu oder pausieren Sie einen anderen.", "The order rests because all your search orders are in use. Add another one or pause a different one.")
                : o.error && o.error !== "quota"
                  ? t("Die letzte Auswertung ist fehlgeschlagen. Der Agent versucht es beim nächsten Lauf erneut.", "The last analysis failed. The agent tries again on its next run.")
                  : t("Noch keine Auswertung. Der Agent meldet sich nach seinem nächsten Lauf.", "No analysis yet. The agent reports after its next run.")}
          </p>
        )}
        {o.summary && o.waiting && (
          <p className="text-[13px] text-warn">{t("Der Auftrag ruht, weil alle Ihre Suchaufträge belegt sind; zu sehen ist sein letzter Stand.", "The order rests because all your search orders are in use; this is its last state.")}</p>
        )}
        {o.summary && !o.waiting && o.error && o.error !== "quota" && (
          <p className="text-[13px] text-warn">{t("Die letzte Auswertung ist fehlgeschlagen; zu sehen ist der Stand davor.", "The last analysis failed; this is the state before it.")}</p>
        )}

        {o.matches.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {o.matches.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </ul>
        ) : (
          o.summary && <Empty className="rounded-box border border-dashed border-line py-8">{t("Heute kein passendes Fahrzeug im beobachteten Bestand.", "No matching car in the watched stock today.")}</Empty>
        )}
      </div>
    </section>
  );
}

function MatchCard({ m }: { m: Match }) {
  const [photo, setPhoto] = useState(Boolean(m.image));
  const cut = m.pricePrev !== null && m.price !== null && m.price < m.pricePrev;
  const facts = [m.year, m.km !== null && `${num(m.km)} km`, m.gearbox, m.body, m.color].filter(Boolean).join(" · ");
  return (
    <li className={cn("flex min-w-0 flex-col overflow-hidden rounded-box border border-line bg-panel-2", m.gone && "opacity-60")}>
      {photo && m.image && (
        <div className="aspect-[16/9] overflow-hidden bg-panel-3">
          <img src={m.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setPhoto(false)} />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {m.isNew && <Pill tone="accent">{t("Neu", "New")}</Pill>}
              {cut && <Pill tone="up">{t("Preis gesenkt", "Price cut")}</Pill>}
              {m.gone && <Pill>{t("Nicht mehr im Bestand", "No longer in stock")}</Pill>}
            </div>
            <h3 className="mt-1 font-display text-[18px] leading-snug">{m.title}</h3>
            <div className="mt-0.5 text-[12.5px] text-muted">{[m.dealer, m.location].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="shrink-0 text-right" title={t("Übereinstimmung mit Ihrem Auftrag", "Fit with your order")}>
            <div className="font-display text-[26px] leading-none tabular-nums text-gold-2">{m.score}</div>
            <div className="mt-1 text-[10px] tracking-[0.12em] text-faint uppercase">{t("von 100", "of 100")}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="font-display text-[20px] tabular-nums">{askingPrice(m.price, m.currency)}</span>
          {cut && <span className="text-[13px] text-faint tabular-nums line-through">{askingPrice(m.pricePrev, m.currency)}</span>}
          {facts && <span className="text-[13px] text-muted">{facts}</span>}
        </div>
        <p className="text-[14px] leading-relaxed">{m.reason}</p>
        {m.concerns && (
          <p className="text-[13px] leading-relaxed text-muted">
            <span className="font-medium text-ink/80">{t("Vorher klären: ", "Check first: ")}</span>
            {m.concerns}
          </p>
        )}
        <a href={m.url} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 self-start pt-1 text-[13.5px] font-medium text-accent hover:underline">
          {t("Zum Inserat beim Händler", "View the dealer’s listing")} <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </div>
    </li>
  );
}

function OrderForm({
  title,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: ReactNode;
  initial: OrderDraft;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
}) {
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<OrderDraft>) => setD((x) => ({ ...x, ...patch }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const v = variantById.get(d.variantId);
    try {
      await onSubmit({
        query: d.query,
        variantId: v?.id ?? null,
        variantTitle: v ? variantTitle(v) : null,
        priceMax: d.priceMax ? Number(d.priceMax) : null,
        yearFrom: d.yearFrom ? Number(d.yearFrom) : null,
        yearTo: d.yearTo ? Number(d.yearTo) : null,
        kmMax: d.kmMax ? Number(d.kmMax) : null,
        lang: isEn() ? "en" : "de",
      });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };
  return (
    <Card title={title}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="order-query">{t("Was suchen Sie?", "What are you looking for?")}</label>
          <textarea
            id="order-query"
            className="input min-h-[96px] resize-y"
            maxLength={1000}
            required
            minLength={10}
            value={d.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder={t(
              "z. B. Porsche 911 (993) Carrera Coupé mit Schaltgetriebe, unfallfrei, nachvollziehbare Historie, gern in Blau oder Silber, deutsche Auslieferung",
              "e.g. Porsche 911 (993) Carrera coupé with manual gearbox, accident-free, documented history, preferably blue or silver, German delivery",
            )}
          />
          <p className="mt-1 text-[12.5px] text-faint">{t("In Ihren Worten: Modell, Ausstattung, Zustand, Farben, was ausgeschlossen ist. Bitte keine persönlichen Daten.", "In your own words: model, equipment, condition, colours, what is ruled out. Please no personal data.")}</p>
        </div>
        <div>
          <label className="label" htmlFor="order-variant">{t("Variante aus dem Katalog (optional)", "Variant from the catalogue (optional)")}</label>
          <select id="order-variant" className="input" value={d.variantId} onChange={(e) => set({ variantId: e.target.value })}>
            <option value="">{t("Keine Auswahl", "None")}</option>
            {brands.map((b) => (
              <optgroup key={b.id} label={b.name}>
                {variants
                  .filter((x) => x.brandId === b.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {variantTitle(x, { brand: false })}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-1 text-[12.5px] text-faint">{t("Mit Variante vergleicht der Agent die Angebote mit unserem Marktwert.", "With a variant the agent compares the listings with our market value.")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="order-price">{t("Preis bis (€)", "Price up to (€)")}</label>
            <input id="order-price" className="input" inputMode="numeric" maxLength={9} value={d.priceMax} onChange={(e) => set({ priceMax: digits(e.target.value) })} placeholder={t("ohne Grenze", "no limit")} />
          </div>
          <div>
            <label className="label" htmlFor="order-year-from">{t("Baujahr ab", "Year from")}</label>
            <input id="order-year-from" className="input" inputMode="numeric" maxLength={4} value={d.yearFrom} onChange={(e) => set({ yearFrom: digits(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="order-year-to">{t("Baujahr bis", "Year to")}</label>
            <input id="order-year-to" className="input" inputMode="numeric" maxLength={4} value={d.yearTo} onChange={(e) => set({ yearTo: digits(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="order-km">{t("Laufleistung bis (km)", "Mileage up to (km)")}</label>
            <input id="order-km" className="input" inputMode="numeric" maxLength={7} value={d.kmMax} onChange={(e) => set({ kmMax: digits(e.target.value) })} placeholder={t("ohne Grenze", "no limit")} />
          </div>
        </div>
        {error && <p className="text-[14px] text-down">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-gold" disabled={busy}>
            {busy ? t("Wird gespeichert …", "Saving …") : submitLabel}
          </button>
          {onCancel && (
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              {t("Abbrechen", "Cancel")}
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}

/** The page without an account: what an order and its matches look like, behind the lock (the API answers accounts only). */
function Preview() {
  const sample: Order = {
    id: "beispiel", title: t("911 (993) Carrera, Schalter", "911 (993) Carrera, manual"),
    query: t("Porsche 911 (993) Carrera Coupé mit Schaltgetriebe, unfallfrei, nachvollziehbare Historie.", "Porsche 911 (993) Carrera coupé with manual gearbox, accident-free, documented history."),
    variantId: null, variantTitle: null, priceMax: 130_000, yearFrom: 1994, yearTo: 1998, kmMax: 120_000, active: true, createdAt: "", lastRunAt: null, running: false, waiting: false, error: null,
    summary: t(
      "Heute passen drei Fahrzeuge zu Ihrem Auftrag, zwischen 104.000 und 128.000 Euro. Zwei liegen unter unserem Marktwert, eines davon wurde diese Woche im Preis gesenkt.",
      "Three cars fit your order today, between €104,000 and €128,000. Two are below our market value, and one of them was reduced this week.",
    ),
    summaryAt: null,
    matches: [0, 1].map((i) => ({
      id: String(i), score: 92 - i * 9, reason: t("Schaltgetriebe, unfallfrei laut Händler, Preis unter dem Marktwert.", "Manual gearbox, accident-free according to the dealer, priced below market value."),
      concerns: t("Serviceheft und Vorbesitzer erfragen.", "Ask for the service book and previous owners."), matchedAt: "", isNew: i === 0, url: "#", title: "Porsche 911 (993) Carrera Coupé",
      year: 1995 + i, km: 86_000 + i * 21_000, price: 118_000 - i * 9_000, currency: "EUR", pricePrev: null, priceChangedAt: null, location: i ? "Hamburg" : "München", gearbox: t("Schaltgetriebe", "Manual"),
      body: "Coupé", color: null, image: null, details: "", firstSeenAt: "", gone: false, dealer: t("Händler", "Dealer"),
    })),
  };
  const nothing = () => {};
  return (
    <div className="space-y-8">
      <Head />
      <div className="night-band relative overflow-hidden rounded-panel px-6 py-6 sm:px-8 sm:py-7">
        <div className="relative flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
          <div className="max-w-2xl min-w-0">
            <div className="font-display text-[24px] leading-snug text-on-night sm:text-[27px]">{t("Ein Agent, der jeden Morgen für Sie sucht", "An agent that searches for you every morning")}</div>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-on-night/75">
              {t(
                "Sie beschreiben Ihr Wunschauto, der Agent liest täglich den Bestand ausgewählter Händler, nennt die passenden Fahrzeuge und ordnet sie zum Marktwert ein. Mit Konto: drei Suchaufträge in Premium, einzelne auch ohne Premium im Abo.",
                "You describe the car you want, the agent reads the stock of selected dealers every day, names the cars that fit and sets them against the market value. With an account: three search orders in premium, single ones by subscription without premium too.",
              )}
            </p>
          </div>
          <a className="premium-cta shrink-0 sm:w-auto" href={signInHref(true)}>
            {t("Kostenlos Konto anlegen", "Create a free account")}
          </a>
        </div>
      </div>
      <LockedBody reason="agent" height={520}>
        <OrderCard order={sample} onEdit={nothing} onRun={nothing} onToggle={nothing} onDelete={nothing} />
      </LockedBody>
    </div>
  );
}
