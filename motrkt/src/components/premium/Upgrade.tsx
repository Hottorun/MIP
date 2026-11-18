import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Clock, Crown, FileUp, ShieldCheck, X } from "lucide-react";
import { usePlan, type LockReason, type UnlockStep } from "../../lib/plan";
import { DOCUMENT_HOURS } from "../../lib/userCars";
import { signOut } from "../../lib/session";
import { getAllSales } from "../../data/generate";
import { variants } from "../../data/db";
import { cn, num } from "../../lib/format";
import { t } from "../../i18n";
import { Modal } from "../ui";

/**
 * The way from lite to premium, in two parts: the floating button that is on every page of a lite user, and the
 * dialog it opens (so does every locked block). The dialog says what premium adds, what it costs (a document, not
 * money) and where the user stands, and leads to the form on the portfolio page (components/portfolio/UserCars.tsx).
 */

const UNLOCK_PATH = "/portfolio#melden";

/** Always in the corner for a lite user; shows the next step once a submission is under way. */
export function PremiumFab() {
  const { ready, premium, step, openUpgrade } = usePlan();
  if (!ready || premium) return null;
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
};

export function UpgradeDialog() {
  const { upgrade, closeUpgrade, months, step, account, preview, setPreview } = usePlan();
  const navigate = useNavigate();
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
    [t("Angaben eintragen", "Enter the details"), t("Fahrzeug, Preis oder Wert und Datum, wie im Dokument.", "Car, price or value and date, as in the document.")],
    [t("Dokument hochladen", "Upload the document"), t("Kaufvertrag oder Wertgutachten, gern geschwärzt.", "Purchase contract or appraisal, redacted if you like.")],
    [t(`${months} Monate Premium`, `${months} months of premium`), t("Nach unserer Prüfung, jede weitere Freigabe verlängert.", "After our review; every further approval extends it.")],
  ];
  const done = step === "review" ? 2 : step === "upload" ? 1 : 0;
  const cta = step === "review" ? t("Einreichung ansehen", "View my submission") : step === "upload" ? t("Dokument hochladen", "Upload the document") : t("Jetzt freischalten", "Unlock now");

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
          <div className="eyebrow text-gold">{step === "start" ? t("So schalten Sie frei", "How to unlock") : t("Ihr Stand", "Where you stand")}</div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-display text-[44px] leading-none">{t("0 €", "€0")}</span>
            <span className="text-[14px] text-muted">{t(`für ${months} Monate`, `for ${months} months`)}</span>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            {t(
              "Kein Abo, keine Zahlungsdaten. Sie belegen ein Fahrzeug, das Sie gekauft, verkauft oder begutachten lassen haben. Ihr Beleg fließt anonym in die Marktanalyse ein.",
              "No subscription, no payment details. You prove a car you bought, sold or had appraised. Your record enters the market analysis anonymously.",
            )}
          </p>

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

          {account?.demo && !account.admin ? (
            <div className="mt-7 space-y-3">
              <p className="rounded-[3px] border border-line bg-panel-2 px-4 py-3 text-[13.5px] text-muted">
                {t("Das Demo-Konto wird geteilt und kann kein Fahrzeug einreichen. Mit einem eigenen Konto schalten Sie Premium frei.", "The demo account is shared and cannot submit a car. Unlock premium with an account of your own.")}
              </p>
              <button className="premium-cta" onClick={signOut}>
                {t("Eigenes Konto anlegen", "Create my own account")} <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          ) : (
            <button className="premium-cta mt-7" onClick={go}>
              {cta} <ArrowRight className="size-4" aria-hidden />
            </button>
          )}
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
  const { openUpgrade, months } = usePlan();
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
          <div className="mt-2 text-center text-[12.5px] text-on-night/60">{t(`0 € für ${months} Monate, mit einem Beleg`, `€0 for ${months} months, with one document`)}</div>
        </div>
      </div>
    </div>
  );
}
