import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Clock, Crown, FileUp, Lock, ShieldCheck, UserPlus, X } from "lucide-react";
import { offerEvery, offerPrice, offerRate, signInHref, usePlan, type AccountReason, type LockReason, type UnlockStep } from "../../lib/plan";
import { DOCUMENT_HOURS } from "../../lib/userCars";
import { getAllSales } from "../../data/generate";
import { variants } from "../../data/db";
import { cn, num } from "../../lib/format";
import { t } from "../../i18n";
import { Modal } from "../ui";

/**
 * The way from lite to premium, in two parts: the floating button that is on every page of a lite user, and the
 * dialog it opens (so does every locked block). The dialog says what premium adds and shows the two ways to it:
 * buying it (where payment is set up, lib/plan.tsx `offer`; the button leads to Stripe's payment page) and the purchase
 * contract, free, with where the user stands and the way to the form on the portfolio page
 * (components/portfolio/UserCars.tsx).
 */

const UNLOCK_PATH = "/portfolio#melden";

/** Always in the corner for a lite user; shows the next step once a submission is under way. */
export function PremiumFab() {
  const { ready, guest, premium, step, openUpgrade } = usePlan();
  if (!ready || premium) return null;
  if (guest)
    return (
      <button type="button" className="premium-fab group" onClick={() => openUpgrade("account")} aria-haspopup="dialog">
        <span className="premium-fab-icon">
          <UserPlus className="size-[18px]" strokeWidth={1.9} aria-hidden />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-[10px] font-semibold tracking-[0.16em] text-[#e4c486] uppercase">{t("Kostenlos", "Free")}</span>
          <span className="block font-serif text-[16px]">{t("Konto anlegen", "Create an account")}</span>
        </span>
        <ArrowRight className="size-4 text-[#e4c486] transition-transform group-hover:translate-x-0.5" aria-hidden />
      </button>
    );
  const copy: Record<UnlockStep, [string, string]> = {
    start: ["Carbay Premium", t("Jetzt freischalten", "Unlock now")],
    upload: [t("Premium · Schritt 2 von 3", "Premium · step 2 of 3"), t("Dokument hochladen", "Upload the document")],
    review: [t("Premium · Schritt 3 von 3", "Premium · step 3 of 3"), t("Prüfung läuft", "Under review")],
  };
  const Icon = step === "review" ? Clock : step === "upload" ? FileUp : Crown;
  return (
    <button type="button" className="premium-fab group" onClick={() => openUpgrade("general")} aria-haspopup="dialog">
      <span className="premium-fab-icon">
        <Icon className="size-[18px]" strokeWidth={1.9} aria-hidden />
      </span>
      <span className="text-left leading-tight">
        <span className="block text-[10px] font-semibold tracking-[0.16em] text-[#e4c486] uppercase">{copy[step][0]}</span>
        <span className="block font-serif text-[16px]">{copy[step][1]}</span>
      </span>
      {step === "review" ? (
        <span className="relative ml-0.5 flex size-2" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#e4c486] opacity-70 motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-full bg-[#e4c486]" />
        </span>
      ) : (
        <ArrowRight className="size-4 text-[#e4c486] transition-transform group-hover:translate-x-0.5" aria-hidden />
      )}
    </button>
  );
}

const HEADLINE: Record<LockReason, () => string> = {
  general: () => t("Der ganze Markt, nicht nur der Preis.", "The whole market, not just the price."),
  history: () => t("Sehen Sie, wohin sich der Wert bewegt.", "See where the value is heading."),
  sales: () => t("Sehen Sie, was wirklich bezahlt wurde.", "See what was actually paid."),
  evidence: () => t("Jeder Beleg hinter dem Marktwert.", "Every record behind the market value."),
  assessment: () => t("Kaufen, halten oder beobachten?", "Buy, hold or watch?"),
  options: () => t("Was jede Option am Wert ändert.", "What each option adds to the value."),
  figures: () => t("Der Markt dieses Modells in Zahlen.", "This model's market in figures."),
  profile: () => t("Das ganze Bild zu diesem Modell.", "The full picture of this model."),
  auctions: () => t("Jedes Auktionsergebnis, durchsuchbar.", "Every auction result, searchable."),
  insights: () => t("Der Marktbericht, Kapitel für Kapitel.", "The market report, chapter by chapter."),
  copilot: () => t("Fragen Sie die Daten.", "Ask the data."),
  compare: () => t("Varianten Seite an Seite vergleichen.", "Compare variants side by side."),
  account: () => t("Ihr Carbay, mit kostenlosem Konto.", "Your Carbay, with a free account."),
  watchlist: () => t("Behalten Sie Ihre Favoriten im Blick.", "Keep an eye on your favourites."),
  alerts: () => t("Wir melden uns, wenn der Preis passt.", "We let you know when the price is right."),
  portfolio: () => t("Was Ihre Sammlung heute wert ist.", "What your collection is worth today."),
  saved: () => t("Merken Sie sich interessante Angebote.", "Save the listings that interest you."),
  forum: () => t("Reden Sie mit.", "Join the conversation."),
};

const ACCOUNT_REASONS = new Set<LockReason>(["account", "watchlist", "alerts", "portfolio", "saved", "forum"] satisfies AccountReason[]);

export function UpgradeDialog() {
  const { guest } = usePlan();
  return guest ? <AccountDialog /> : <PremiumDialog />;
}

/**
 * The guest version: whatever they tried (keep a car on the watchlist, write in the forum, or a premium block), the
 * first step is a free account. Leads to the sign-in page and back to this page afterwards.
 */
function AccountDialog() {
  const { upgrade, closeUpgrade, months, offer } = usePlan();
  const premiumReason = !ACCOUNT_REASONS.has(upgrade.reason);
  const free = [
    t("Watchlist und Preisalarme für jede Variante", "Watchlist and price alerts for every variant"),
    t("Portfolio: der heutige Wert Ihrer Fahrzeuge", "Portfolio: what your cars are worth today"),
    t("Angebote merken und im Forum mitschreiben", "Save listings and write in the forum"),
    offer
      ? t(`Premium freischalten: mit einem Kaufvertrag kostenlos oder für ${offerRate(offer)}${offer.recurring ? "" : ", ohne Abo"}`, `Unlock premium: free with a purchase contract or for ${offerRate(offer)}${offer.recurring ? "" : ", no subscription"}`)
      : t(`Premium freischalten: ${months} Monate für einen Kaufvertrag, ohne Abo`, `Unlock premium: ${months} months for one purchase contract, no subscription`),
  ];
  return (
    <Modal open={upgrade.open} onClose={closeUpgrade} title={t("Kostenloses Konto", "Free account")} bare>
      <div className="grid max-h-[86vh] overflow-y-auto md:grid-cols-[1.05fr_1fr]">
        <div className="night-band relative flex flex-col overflow-hidden px-7 py-8 sm:px-9 sm:py-10">
          <span className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-[radial-gradient(circle,rgba(228,196,134,0.22),transparent_65%)]" aria-hidden />
          <div className="relative flex-1">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-[#e4c486] uppercase">
              {premiumReason ? <Crown className="size-4" strokeWidth={1.7} aria-hidden /> : <UserPlus className="size-4" strokeWidth={1.7} aria-hidden />}
              {premiumReason ? "Carbay Premium" : t("Kostenloses Konto", "Free account")}
            </div>
            <h2 className="mt-4 font-display text-[30px] leading-[1.12] text-on-night sm:text-[34px]">{HEADLINE[upgrade.reason]()}</h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-on-night/75">
              {premiumReason
                ? t(
                    offer
                      ? "Premium beginnt mit einem kostenlosen Konto. Danach schalten Sie es mit einem Kaufvertrag frei oder kaufen es."
                      : "Premium beginnt mit einem kostenlosen Konto. Danach schalten Sie es mit einem Kaufvertrag frei.",
                    offer ? "Premium starts with a free account. You then unlock it with a purchase contract, or buy it." : "Premium starts with a free account. You then unlock it with a purchase contract.",
                  )
                : t("Ohne Konto sehen Sie den Marktwert. Mit Konto behalten Sie, was Sie interessiert.", "Without an account you see the market value. With one you keep what interests you.")}
            </p>
            <ul className="mt-7 space-y-3.5">
              {free.map((b) => (
                <li key={b} className="flex gap-3 text-[14.5px] leading-snug text-on-night/90">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#e4c486]/15 text-[#e4c486]">
                    <Check className="size-3" strokeWidth={2.6} aria-hidden />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="relative flex flex-col px-7 py-8 sm:px-9 sm:py-10">
          <button className="btn btn-ghost absolute top-3 right-3 p-1.5" onClick={closeUpgrade} aria-label={t("Schließen", "Close")} data-close>
            <X className="size-4" />
          </button>
          <div className="eyebrow text-gold">{t("In einer Minute startklar", "Ready in a minute")}</div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-display text-[44px] leading-none">{t("0 €", "€0")}</span>
            <span className="text-[14px] text-muted">{t("ohne Abo", "no subscription")}</span>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            {t(
              "Benutzername, Passwort und E-Mail-Adresse genügen. Die E-Mail-Adresse nutzen wir nur für Ihr Konto, nie für Werbung.",
              "A username, a password and an email address are all it takes. We use the email address for your account only, never for advertising.",
            )}
          </p>
          <a className="premium-cta mt-7" href={signInHref(true)}>
            {t("Kostenlos Konto anlegen", "Create a free account")} <ArrowRight className="size-4" aria-hidden />
          </a>
          <p className="mt-4 text-center text-[13.5px] text-muted">
            {t("Schon dabei?", "Already a member?")}{" "}
            <a className="font-medium text-accent underline-offset-4 hover:underline" href={signInHref(false)}>
              {t("Anmelden", "Sign in")}
            </a>
          </p>
          <div className="mt-auto border-t border-line pt-4 text-[13px]">
            <button className="text-muted underline-offset-4 hover:text-ink hover:underline" onClick={closeUpgrade}>
              {t("Weiter ohne Konto", "Continue without an account")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PremiumDialog() {
  const { upgrade, closeUpgrade, months, step, preview, setPreview, offer, buy } = usePlan();
  const navigate = useNavigate();
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState("");
  const purchase = async () => {
    setBuying(true);
    setBuyError("");
    const failed = await buy(); // on success the browser is on its way to the payment page: the button stays busy
    if (failed) {
      setBuyError(failed);
      setBuying(false);
    }
  };
  const go = () => {
    closeUpgrade();
    navigate(UNLOCK_PATH);
    // already on the portfolio page: the address does not change, so scroll by hand
    window.setTimeout(() => document.getElementById("melden")?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
  };

  const benefits = [
    t(`Wertentwicklung, Verkäufe und Belege zu allen ${variants.length} Varianten`, `Value history, sales and evidence for all ${variants.length} variants`),
    t(`${num(getAllSales().length)} Auktionsergebnisse seit 2015, mit Preis, Laufleistung und Haus`, `${num(getAllSales().length)} auction results since 2015, with price, mileage and house`),
    t("Insights: der Marktbericht mit Gewinnern, Geheimtipps und Preistreibern", "Insights: the market report with winners, hidden gems and price drivers"),
    t("Co-Pilot: Ihre Fragen, beantwortet aus den Marktdaten", "Co-Pilot: your questions, answered from the market data"),
  ];
  const steps: [string, string][] = [
    [t("Angaben eintragen", "Enter the details"), t("Fahrzeug, Preis und Datum, wie im Vertrag.", "Car, price and date, as in the contract.")],
    [t("Kaufvertrag hochladen", "Upload the contract"), t("Als PDF oder Foto, gern geschwärzt.", "As a PDF or photo, redacted if you like.")],
    [t(`${months} Monate Premium`, `${months} months of premium`), t("Nach unserer Prüfung, jede weitere Freigabe verlängert.", "After our review; every further approval extends it.")],
  ];
  const done = step === "review" ? 2 : step === "upload" ? 1 : 0;
  const cta = step === "review" ? t("Einreichung ansehen", "View my submission") : step === "upload" ? t("Dokument hochladen", "Upload the document") : offer ? t("Kaufvertrag einreichen", "Submit a contract") : t("Jetzt freischalten", "Unlock now");
  // with an offer and nothing submitted yet the contract is one of two choices: a line says how it works; the three
  // steps come back once a submission is under way, where they show how far it is
  const showSteps = !offer || step !== "start";

  return (
    <Modal open={upgrade.open} onClose={closeUpgrade} title="Carbay Premium" bare>
      <div className="grid max-h-[86vh] overflow-y-auto md:grid-cols-[1.05fr_1fr]">
        <div className="night-band relative flex flex-col overflow-hidden px-7 py-8 sm:px-9 sm:py-10">
          <span className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-[radial-gradient(circle,rgba(228,196,134,0.22),transparent_65%)]" aria-hidden />
          <div className="relative flex-1">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-[#e4c486] uppercase">
              <Crown className="size-4" strokeWidth={1.7} aria-hidden />
              Carbay Premium
            </div>
            <h2 className="mt-4 font-display text-[30px] leading-[1.12] text-on-night sm:text-[34px]">{HEADLINE[upgrade.reason]()}</h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-on-night/75">
              {t(
                "In der Lite-Version sehen Sie den Marktwert. Premium zeigt, woraus er entsteht und wohin er sich bewegt.",
                "The lite version shows you the market value. Premium shows what it is made of and where it is heading.",
              )}
            </p>
            <ul className="mt-7 space-y-3.5">
              {benefits.map((b) => (
                <li key={b} className="flex gap-3 text-[14.5px] leading-snug text-on-night/90">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#e4c486]/15 text-[#e4c486]">
                    <Check className="size-3" strokeWidth={2.6} aria-hidden />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative mt-8 border-t border-on-night/15 pt-4 text-[13px] leading-relaxed text-on-night/60">
            {t(
              "Lite bleibt kostenlos: Marktwert jeder Variante, Angebote, Portfolio, Forum und Auktionskalender.",
              "Lite stays free: the market value of every variant, listings, portfolio, forum and the auction calendar.",
            )}
          </p>
        </div>

        <div className="relative px-7 py-8 sm:px-9 sm:py-10">
          <button className="btn btn-ghost absolute top-3 right-3 p-1.5" onClick={closeUpgrade} aria-label={t("Schließen", "Close")} data-close>
            <X className="size-4" />
          </button>
          <div className="eyebrow text-gold">
            {step !== "start" ? t("Ihr Stand", "Where you stand") : offer ? t("Zwei Wege zu Premium", "Two ways to premium") : t("So schalten Sie frei", "How to unlock")}
          </div>

          {offer && (
            <>
              <section className="mt-3.5 rounded-[6px] border border-gold/45 bg-gold-soft/50 p-5" aria-labelledby="premium-buy">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 id="premium-buy" className="font-serif text-[18px]">
                    {offer.recurring ? t("Premium abonnieren", "Subscribe to premium") : t("Premium kaufen", "Buy premium")}
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-[34px] leading-none">{offerPrice(offer)}</span>
                    <span className="text-[13.5px] text-muted">{offer.recurring ? offerEvery(offer) : t(`für ${offer.months} Monate`, `for ${offer.months} months`)}</span>
                  </div>
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                  {offer.recurring
                    ? t("Sofort freigeschaltet. Verlängert sich von selbst und ist jederzeit im Konto kündbar, zum Ende des bezahlten Zeitraums.", "Unlocked at once. It renews by itself and can be cancelled in your account at any time, to the end of the period you paid for.")
                    : t("Sofort freigeschaltet. Einmalige Zahlung, kein Abo: Es verlängert sich nicht von selbst.", "Unlocked at once. One payment, no subscription: it does not renew by itself.")}
                </p>
                <button className="premium-cta mt-4" onClick={purchase} disabled={buying}>
                  {buying ? (
                    t("Zahlungsseite wird geöffnet …", "Opening the payment page …")
                  ) : (
                    <>
                      {offer.recurring ? t("Jetzt abonnieren", "Subscribe now") : t("Jetzt kaufen", "Buy now")} <ArrowRight className="size-4" aria-hidden />
                    </>
                  )}
                </button>
                {buyError && (
                  <p className="mt-2 text-[13px] text-down" role="alert">
                    {buyError}
                  </p>
                )}
                <p className="mt-3 flex gap-2 text-[12.5px] leading-relaxed text-faint">
                  <Lock className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.7} aria-hidden />
                  {t("Sichere Zahlung über Stripe. Ihre Karten- und Kontodaten sehen wir nicht.", "Secure payment through Stripe. We never see your card or bank details.")}
                </p>
              </section>
              <div className="my-4 flex items-center gap-3 text-[11.5px] font-semibold tracking-[0.16em] text-faint uppercase" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                {t("oder", "or")}
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          {offer ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="font-serif text-[18px]">{t("Mit Kaufvertrag", "With a purchase contract")}</h3>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[34px] leading-none">{t("0 €", "€0")}</span>
                <span className="text-[13.5px] text-muted">{t(`für ${months} Monate`, `for ${months} months`)}</span>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-baseline gap-3">
              <span className="font-display text-[44px] leading-none">{t("0 €", "€0")}</span>
              <span className="text-[14px] text-muted">{t(`für ${months} Monate`, `for ${months} months`)}</span>
            </div>
          )}
          <p className={cn("mt-2 leading-relaxed text-muted", offer ? "text-[13.5px]" : "text-[14px]")}>
            {offer
              ? t(
                  "Sie belegen ein Fahrzeug, das Sie gekauft oder verkauft haben: Angaben eintragen, Kaufvertrag hochladen, wir prüfen. Der Preis fließt anonym in die Marktanalyse ein.",
                  "You prove a car you bought or sold: enter the details, upload the purchase contract, we check it. The price enters the market analysis anonymously.",
                )
              : t(
                  "Kein Abo, keine Zahlungsdaten. Sie belegen ein Fahrzeug, das Sie gekauft oder verkauft haben. Ihr Kaufvertrag fließt anonym in die Marktanalyse ein.",
                  "No subscription, no payment details. You prove a car you bought or sold. Your purchase contract enters the market analysis anonymously.",
                )}
          </p>

          {showSteps && (
            <ol className="mt-6 space-y-4">
              {steps.map(([head, body], i) => {
                const state = i < done ? "done" : i === done ? "now" : "next";
                return (
                  <li key={head} className="flex gap-3.5">
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full border text-[13px] font-semibold tabular-nums",
                        state === "done" ? "border-up bg-up-soft text-up" : state === "now" ? "border-gold bg-gold-soft text-gold-2" : "border-line-2 text-faint",
                      )}
                    >
                      {state === "done" ? <Check className="size-3.5" strokeWidth={2.6} aria-label={t("erledigt", "done")} /> : i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className={cn("font-serif text-[16.5px] leading-snug", state === "next" && "text-muted")}>
                        {i === 2 && step === "review" ? t("Prüfung läuft", "Under review") : head}
                      </div>
                      <div className="text-[13.5px] text-muted">
                        {i === 2 && step === "review" ? t(`Danach schalten wir ${months} Monate Premium frei.`, `After that we unlock ${months} months of premium.`) : body}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <button className={offer ? "btn mt-4 w-full py-2.5 text-[14.5px]" : "premium-cta mt-7"} onClick={go}>
            {cta} <ArrowRight className="size-4" aria-hidden />
          </button>
          <p className="mt-3 flex gap-2 text-[12.5px] leading-relaxed text-faint">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.7} aria-hidden />
            <span>
              {t(
                `Schwärzen erlaubt. Das Dokument löschen wir mit der Entscheidung, spätestens nach ${DOCUMENT_HOURS} Stunden.`,
                `Redacting is fine. We delete the document with the decision, after ${DOCUMENT_HOURS} hours at the latest.`,
              )}{" "}
              <a href="/datenschutz" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                {t("Datenschutz", "Privacy")}
              </a>
            </span>
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-4 text-[13px]">
            <button className="text-muted underline-offset-4 hover:text-ink hover:underline" onClick={closeUpgrade}>
              {t("Weiter mit Lite", "Continue with lite")}
            </button>
            {preview && (
              <button
                className="text-accent-2 underline-offset-4 hover:underline"
                onClick={() => {
                  setPreview(false);
                  closeUpgrade();
                }}
              >
                {t("Lite-Vorschau beenden", "End the lite preview")}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** The band at the top of a page that is premium as a whole (Insights, Co-Pilot): what the page is and the way in. */
export function PremiumBanner({ reason, title, children }: { reason: LockReason; title: ReactNode; children: ReactNode }) {
  const { openUpgrade, months, offer } = usePlan();
  return (
    <div className="night-band relative overflow-hidden rounded-[8px] px-6 py-6 sm:px-8 sm:py-7">
      <span className="pointer-events-none absolute -top-28 -right-20 size-72 rounded-full bg-[radial-gradient(circle,rgba(228,196,134,0.2),transparent_65%)]" aria-hidden />
      <div className="relative flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
        <div className="max-w-2xl min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-[#e4c486] uppercase">
            <Crown className="size-4" strokeWidth={1.7} aria-hidden />
            {t("Teil von Carbay Premium", "Part of Carbay Premium")}
          </div>
          <div className="mt-2 font-display text-[24px] leading-snug text-on-night sm:text-[27px]">{title}</div>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-on-night/75">{children}</p>
        </div>
        <div className="shrink-0">
          <button className="premium-cta sm:w-auto" onClick={() => openUpgrade(reason)}>
            {t("Premium freischalten", "Unlock premium")} <ArrowRight className="size-4" aria-hidden />
          </button>
          <div className="mt-2 text-center text-[12.5px] text-on-night/60">
            {offer
              ? t(`Mit Kaufvertrag kostenlos oder für ${offerRate(offer)}`, `Free with a purchase contract or for ${offerRate(offer)}`)
              : t(`0 € für ${months} Monate, mit einem Kaufvertrag`, `€0 for ${months} months, with one purchase contract`)}
          </div>
        </div>
      </div>
    </div>
  );
}
