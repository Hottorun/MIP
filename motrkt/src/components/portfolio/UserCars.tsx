import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, CreditCard, Crown, FileCheck2, FileSignature, FileText, Lock, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { variantById, variantTitle } from "../../data/db";
import { getMetrics } from "../../data/market";
import type { Holding } from "../../data/types";
import { cn, date, eur, num } from "../../lib/format";
import { isEn, locale, t } from "../../i18n";
import { tr } from "../../i18n/terms";
import { CarImage } from "../CarImage";
import { VariantPicker } from "../VariantPicker";
import { Pill, Section, useConfirm } from "../ui";
import { offerPrice, usePlan } from "../../lib/plan";
import {
  ACCEPT, COUNTERPARTY, DOCUMENT_HOURS, KIND_LABEL, MAX_BYTES, STATUS_LABEL, STATUS_TONE, VALUE_BASIS_LABEL, api, uploadContract,
  type Kind, type UserCar,
} from "../../lib/userCars";

/**
 * "Premium freischalten" on the portfolio page (#melden), the two ways side by side. Free: the user proves a car they
 * bought or sold with its purchase contract and gets premium once a reviewer has approved it (server/userCars.ts);
 * what happens to the document is said loudly (PrivacyBand), in the words of the privacy notice (src/legal.ts
 * section 4). Paid, where payment is set up: buying it (server/payments.ts).
 *
 * Appraisals (Wertgutachten) were a way too until November 2026. The form no longer takes them; the list still shows
 * the ones submitted before.
 */

const COUNTRIES = ["DE", "AT", "CH", "NL", "BE", "LU", "FR", "IT", "ES", "GB", "DK", "SE", "NO", "PL", "CZ", "US", "CA"];
const CURRENCIES = ["EUR", "CHF", "GBP", "USD", "SEK", "DKK", "NOK", "CAD"];
const today = () => new Date().toISOString().slice(0, 10);
const parseNum = (s: string) => Number(isEn() ? s.replace(/[,\s]/g, "") : s.replace(/\./g, "").replace(/\s/g, "").replace(",", "."));
/** "den Kaufvertrag" / "das Wertgutachten" where a line of the list names the document (appraisals: submissions from before). */
const doc = (kind: Kind) =>
  kind === "gutachten"
    ? { the: t("das Wertgutachten", "the appraisal"), The: t("Das Wertgutachten", "The appraisal") }
    : { the: t("den Kaufvertrag", "the purchase contract"), The: t("Der Kaufvertrag", "The purchase contract") };

type Draft = {
  role: "kauf" | "verkauf";
  variant_id: string;
  title: string;
  build_year: string;
  vin: string;
  km: string;
  price: string;
  currency: string;
  sale_date: string;
  country: string;
  counterparty: "privat" | "haendler" | "auktion";
  body: string;
  gearbox: string;
  steering: string;
  color_ext: string;
  color_int: string;
  condition: string;
  matching_numbers: string;
  accident_free: string;
  notes: string;
};

/** An empty form, or one started from a car of the portfolio: what the holding knows is filled in, the rest stays open. */
function startDraft(from?: Holding): Draft {
  const day = from ? new Date(from.purchaseDate).toISOString().slice(0, 10) : "";
  return {
    role: "kauf", variant_id: from?.variantId ?? "", title: "", build_year: "", vin: "", km: from?.mileage ? String(from.mileage) : "",
    // a holding's purchase price is kept in euros, whatever currency the page shows
    price: from ? String(Math.round(from.purchasePrice)) : "", currency: "EUR", sale_date: from && day >= "2000-01-01" ? day : "",
    country: "DE", counterparty: "privat", body: "", gearbox: "", steering: "links",
    color_ext: from?.color ? tr(from.color) : "", color_int: "", condition: from?.condition ?? "", matching_numbers: "", accident_free: "", notes: "",
  };
}

const FIELD_ERR: Record<string, () => string> = {
  role: () => t("Bitte Kauf oder Verkauf wählen.", "Please choose bought or sold."),
  variant_id: () => t("Bitte ein Fahrzeug wählen.", "Please choose a car."),
  build_year: () => t("Bitte ein gültiges Baujahr eingeben.", "Please enter a valid build year."),
  vin: () => t("Bitte die Fahrgestellnummer (FIN) wie im Vertrag eingeben.", "Please enter the chassis number (VIN) as in the contract."),
  km: () => t("Bitte den Kilometerstand eingeben.", "Please enter the mileage."),
  price: () => t("Bitte den Kaufpreis wie im Vertrag eingeben.", "Please enter the price as in the contract."),
  currency: () => t("Bitte eine Währung wählen.", "Please choose a currency."),
  sale_date: () => t("Bitte das Datum des Vertrags eingeben (nicht in der Zukunft).", "Please enter the contract date (not in the future)."),
  country: () => t("Bitte ein Land wählen.", "Please choose a country."),
  counterparty: () => t("Bitte wählen.", "Please choose."),
  condition: () => t("Note 1 bis 5, z. B. 2+.", "Grade 1 to 5, e.g. 2+."),
  consent: () => t("Bitte bestätigen.", "Please confirm."),
  file: () => t("Bitte den Kaufvertrag hochladen (PDF oder Foto, höchstens 4 MB).", "Please upload the purchase contract (PDF or photo, at most 4 MB)."),
};

/** What went wrong with an upload, in words: the server's answer decides (server/userCars.ts). */
const uploadError = (e: unknown) => {
  const { message, status } = e as { message?: string; status?: number };
  if (message === "storage") return t("Der Upload ist gerade nicht möglich. Ihre Angaben sind gespeichert; bitte versuchen Sie es später noch einmal.", "Uploads are not possible right now. Your details are saved; please try again later.");
  if (message === "demo") return t("Mit dem geteilten Demo-Konto lassen sich keine Fahrzeuge melden. Bitte legen Sie ein eigenes Konto an.", "The shared demo account cannot report cars. Please create your own account.");
  if (status === 429) return t("Heute wurden schon viele Dokumente hochgeladen. Bitte morgen weiter.", "Many documents uploaded today already. Please continue tomorrow.");
  return FIELD_ERR.file();
};

/**
 * How the document is protected, as the loudest thing in the section: a dark band with the three facts that matter
 * (deleted after a day, handled GDPR compliant and encrypted, stored in Frankfurt) and what follows from them. `compact` is the narrow version
 * that stays next to the form while it is being filled in.
 */
function PrivacyBand({ compact = false }: { compact?: boolean }) {
  const figures: [string, string, string][] = [
    [
      t(`${DOCUMENT_HOURS} Std.`, `${DOCUMENT_HOURS} h`),
      t("dann ist Ihr Dokument gelöscht", "then your document is deleted"),
      t("Mit der Entscheidung der Prüfung, spätestens 24 Stunden nach dem Hochladen. Automatisch.", "With the review decision, 24 hours after the upload at the latest. Automatically."),
    ],
    // deliberately plain text like its two neighbours, not a seal or badge: a seal would suggest a certification (DATENSCHUTZ.md section 1)
    [
      t("DSGVO-konform", "GDPR compliant"),
      t("so verarbeiten wir Ihr Dokument", "how we process your document"),
      t("Nur mit Ihrer Einwilligung, nur für die Prüfung und verschlüsselt gespeichert.", "Only with your consent, only for the review, and stored encrypted."),
    ],
    ["Frankfurt, DE", t("Serverstandort in der EU", "servers in the EU"), t("Anwendung und Datenbank laufen in Frankfurt am Main.", "Application and database run in Frankfurt am Main.")],
  ];
  const promises = [
    t("Schwärzen erlaubt: Namen, Anschriften, Unterschriften und Bankdaten brauchen wir nicht.", "Redact freely: we do not need names, addresses, signatures or bank details."),
    t("Nur unsere Prüfer öffnen das Dokument, und jeder Zugriff wird protokolliert.", "Only our reviewers open the document, and every access is logged."),
    t("Keine Weitergabe, keine Veröffentlichung. Eine KI liest nur mit, wenn Sie es ausdrücklich erlauben.", "Never passed on, never published. An AI reads it only if you expressly allow it."),
    t("Jede Einreichung können Sie jederzeit selbst löschen.", "You can delete any submission yourself at any time."),
  ];
  return (
    <aside className={cn("night-band rounded-[4px]", compact ? "p-6" : "p-6 sm:p-9")} aria-label={t("Datenschutz", "Data protection")}>
      <div className={cn("flex gap-4", compact ? "flex-col" : "flex-col sm:flex-row sm:items-start sm:gap-6")}>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10">
          <ShieldCheck className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="eyebrow text-on-night/70">{t("Datenschutz", "Data protection")}</div>
          <h3 className={cn("mt-1.5 font-display leading-[1.12]", compact ? "text-[26px]" : "text-[30px] sm:text-[38px]")}>
            {t("Ihr Dokument bleibt vertraulich.", "Your document stays confidential.")}
          </h3>
          <p className={cn("mt-2 max-w-2xl text-on-night/80", compact ? "text-[14px]" : "text-[15.5px]")}>
            {t(
              "Verschlüsselt gespeichert, nur zur Prüfung geöffnet und nach spätestens 24 Stunden gelöscht.",
              "Stored encrypted, opened for the review only and deleted after 24 hours at the latest.",
            )}
          </p>
        </div>
      </div>

      {/* the longest figure ("DSGVO-konform") is about seven em wide: three columns only from lg, the full 44px only from xl and a touch smaller on the narrowest phones, so it never wraps or runs into its neighbour */}
      <dl className={cn("mt-7 grid gap-x-8 gap-y-6 border-t border-white/15 pt-6", !compact && "lg:grid-cols-3")}>
        {figures.map(([figure, label, body]) => (
          <div key={figure}>
            <dt className={cn("font-display text-[30px] leading-none min-[360px]:text-[32px]", !compact && "sm:text-[36px] xl:text-[44px]")}>{figure}</dt>
            <dd className="mt-2">
              <span className="block text-[14.5px] font-semibold">{label}</span>
              <span className="mt-0.5 block text-[13.5px] text-on-night/70">{body}</span>
            </dd>
          </div>
        ))}
      </dl>

      <ul className={cn("mt-7 grid gap-x-8 gap-y-2.5 border-t border-white/15 pt-6 text-[14px]", !compact && "sm:grid-cols-2")}>
        {promises.map((p) => (
          <li key={p} className="flex gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-on-night/70" strokeWidth={2} aria-hidden />
            <span className="text-on-night/90">{p}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[13.5px]">
        <Link to="/datenschutz" className="inline-flex items-center gap-1.5 underline decoration-white/40 underline-offset-4 hover:decoration-white">
          {t("Alle Einzelheiten in der Datenschutzerklärung", "All details in the privacy notice")} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </p>
    </aside>
  );
}

/** One of the ways to premium, as a tile: what it is, what it takes, and the way in. */
function WayTile({ icon: Icon, color, eyebrow, title, text, points, months, action, error }: {
  icon: typeof FileSignature; color: string; eyebrow: string; title: string; text: string; points: string[];
  /** months of premium this way gives */
  months: number; action: ReactNode; error?: string;
}) {
  return (
    <article className="stat-tile flex flex-col" style={{ ["--tile-color" as string]: color }}>
      <div className="relative z-[1] flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }}>
          <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
        </span>
        <span className="eyebrow" style={{ color }}>
          {eyebrow}
        </span>
      </div>
      <h3 className="relative z-[1] mt-4 font-display text-[28px] leading-tight">{title}</h3>
      <p className="relative z-[1] mt-2 text-[14.5px] text-muted">{text}</p>
      <ul className="relative z-[1] mt-4 space-y-1.5 text-[13.5px] text-muted">
        {points.map((n) => (
          <li key={n} className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0" style={{ color }} strokeWidth={2.2} aria-hidden />
            {n}
          </li>
        ))}
      </ul>
      <div className="relative z-[1] mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
        {action}
        <span className="inline-flex items-center gap-1.5 text-[13.5px] text-ink">
          <Crown className="size-4 text-gold" strokeWidth={1.6} aria-hidden />
          {t(`${months} Monate Premium`, `${months} months of premium`)}
        </span>
      </div>
      {error && (
        <p className="relative z-[1] mt-3 text-[13.5px] text-down" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

/** The free way: the purchase contract of a car bought or sold. */
function ContractTile({ months, onStart }: { months: number; onStart: () => void }) {
  return (
    <WayTile
      months={months}
      icon={FileSignature}
      color="var(--color-gold)"
      eyebrow={t("Kostenlos · gekauft oder verkauft", "Free · bought or sold")}
      title={t("Kaufvertrag", "Purchase contract")}
      text={t("Ihr Vertrag belegt einen echten Preis. Nach der Prüfung geht er anonym in unsere Marktwerte ein und macht sie für alle genauer.", "Your contract documents a real price. Once checked it enters our market values anonymously and makes them more accurate for everyone.")}
      points={[t("Kaufvertrag als PDF oder Foto", "Purchase contract as PDF or photo"), t("Fahrzeug, Fahrgestellnummer, Preis und Datum lesbar", "Car, chassis number, price and date readable"), t("Kauf oder Verkauf, privat, vom Händler oder aus einer Auktion", "Purchase or sale, private, dealer or auction")]}
      action={
        <button className="btn btn-gold" onClick={onStart}>
          {t("Kaufvertrag einreichen", "Submit a contract")}
        </button>
      }
    />
  );
}

/** The paid way (lib/plan.tsx `offer`, server/payments.ts): the button leads to Stripe's payment page and back here. */
function BuyTile() {
  const { offer, buy } = usePlan();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!offer) return null;
  return (
    <WayTile
      icon={CreditCard}
      months={offer.months}
      color="var(--color-cobalt)"
      eyebrow={t("Sofort · ohne Dokument", "At once · no document")}
      title={t("Premium kaufen", "Buy premium")}
      text={t(`Sie zahlen einmal ${offerPrice(offer)} und Premium ist sofort für ${offer.months} Monate freigeschaltet. Ohne Prüfung, ohne Wartezeit.`, `You pay ${offerPrice(offer)} once and premium is unlocked at once for ${offer.months} months. No review, no waiting.`)}
      points={[t("Einmalige Zahlung, kein Abo", "One payment, no subscription"), t("Verlängert sich nicht von selbst", "Does not renew by itself"), t("Sichere Zahlung über Stripe; Karten- und Kontodaten sehen wir nicht", "Secure payment through Stripe; we never see card or bank details")]}
      error={error}
      action={
        <button
          className="btn btn-gold"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            const failed = await buy(); // on success the browser is on its way to the payment page
            if (failed) {
              setError(failed);
              setBusy(false);
            }
          }}
        >
          {busy ? t("Zahlungsseite wird geöffnet …", "Opening the payment page …") : t(`Für ${offerPrice(offer)} kaufen`, `Buy for ${offerPrice(offer)}`)}
        </button>
      }
    />
  );
}

export function UserCarsSection({ prefill, onPrefillClear }: { /** A car of the portfolio to start the form from. */ prefill?: Holding; onPrefillClear?: () => void }) {
  const [cars, setCars] = useState<UserCar[] | null>(null);
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [months, setMonths] = useState(12);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(false);
  const [notice, setNotice] = useState<{ partial: boolean } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const { refresh, offer } = usePlan();
  // `changed`: after a submission, upload or deletion, so the premium button and the locks follow at once
  const load = (changed = false) =>
    api<{ cars: UserCar[]; premiumUntil: string | null; premiumMonths: number }>("/api/fahrzeuge")
      .then((j) => {
        if (changed) refresh();
        setCars(j.cars);
        setPremiumUntil(j.premiumUntil);
        setMonths(j.premiumMonths);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  useEffect(() => {
    load();
  }, []);

  const premium = premiumUntil && new Date(premiumUntil) > new Date();
  const from = prefill && variantById.get(prefill.variantId);
  const toTop = () => requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  const start = () => {
    setForm(true);
    setNotice(null);
    toTop();
  };
  const finish = (partial: boolean) => {
    setForm(false);
    setNotice({ partial });
    onPrefillClear?.();
    load(true);
    toTop();
  };

  return (
    <Section
      tone="gold"
      eyebrow="Premium"
      title={t("Premium freischalten", "Unlock premium")}
      sub={
        offer
          ? t(`Mit einem Kaufvertrag kostenlos oder für ${offerPrice(offer)} kaufen`, `Free with a purchase contract, or buy it for ${offerPrice(offer)}`)
          : t(`Kaufvertrag einreichen, ${months} Monate Premium erhalten`, `Submit a purchase contract, get ${months} months of premium`)
      }
      actions={
        premium ? (
          <span className="inline-flex items-center gap-2 text-[14px]">
            <Crown className="size-4 text-gold" strokeWidth={1.6} aria-hidden />
            {t("Premium aktiv bis", "Premium active until")} <span className="font-serif text-[16px]">{date(new Date(premiumUntil!).getTime())}</span>
          </span>
        ) : undefined
      }
    >
      <div id="melden" ref={top} className="scroll-mt-28 space-y-10">
        {notice && (
          <div className={cn("flex items-start gap-3 rounded-[3px] border p-4 text-[14.5px]", notice.partial ? "border-down/30 bg-down-soft" : "border-up/30 bg-up-soft")} role={notice.partial ? "alert" : "status"}>
            <FileCheck2 className={cn("mt-0.5 size-5 shrink-0", notice.partial ? "text-down" : "text-up")} strokeWidth={1.5} aria-hidden />
            <div>
              {notice.partial
                ? t(
                    "Die Angaben sind gespeichert, aber den Kaufvertrag konnten wir nicht hochladen. Laden Sie das Dokument unten in der Liste erneut hoch.",
                    "The details are saved, but the purchase contract could not be uploaded. Upload the document again from the list below.",
                  )
                : t(
                    `Danke! Ihre Angaben und den Kaufvertrag haben wir erhalten. Das Ergebnis der Prüfung sehen Sie unten; das Dokument löschen wir mit der Entscheidung, spätestens nach ${DOCUMENT_HOURS} Stunden.`,
                    `Thank you! We have received your details and the purchase contract. You will see the result of the review below; we delete the document with the decision, after ${DOCUMENT_HOURS} hours at the latest.`,
                  )}
            </div>
          </div>
        )}

        {form ? (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <ReportForm key={prefill?.id ?? ""} from={prefill} months={months} onCancel={() => (setForm(false), onPrefillClear?.())} onDone={() => finish(false)} onPartial={() => finish(true)} />
            <div className="lg:sticky lg:top-28">
              <PrivacyBand compact />
            </div>
          </div>
        ) : (
          <>
            {from && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[3px] border border-accent/30 bg-accent-soft px-4 py-3 text-[14.5px]">
                <span className="min-w-0 flex-1">
                  {t("Für Ihr Portfolio-Fahrzeug", "For your portfolio car")} <span className="font-serif text-[16px]">{variantTitle(from)}</span>
                  {t(": Reichen Sie den Kaufvertrag ein. Die bekannten Angaben übernehmen wir.", ": submit its purchase contract. We carry over what we know.")}
                </span>
                <button className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink" onClick={onPrefillClear}>
                  <X className="size-3.5" aria-hidden /> {t("Verwerfen", "Dismiss")}
                </button>
              </div>
            )}
            <div className={cn("grid gap-6", offer && "md:grid-cols-2")}>
              <ContractTile months={months} onStart={start} />
              <BuyTile />
            </div>
            {offer && <h3 className="!mt-12 font-serif text-[21px]">{t("So geht es mit dem Kaufvertrag", "How the purchase contract works")}</h3>}
            <ol className={cn("grid gap-x-10 gap-y-5 sm:grid-cols-3", offer && "!mt-5")}>
              {[
                [t("Angaben eintragen", "Enter the details"), t("Fahrzeug, Fahrgestellnummer, Preis und Datum, genau wie im Vertrag.", "Car, chassis number, price and date, exactly as in the contract.")],
                [t("Kaufvertrag hochladen", "Upload the contract"), t("PDF oder Foto, gern geschwärzt. Wir vergleichen es mit Ihren Angaben.", "PDF or photo, redacted if you like. We compare it with your details.")],
                [t("Premium erhalten", "Get premium"), t(`Nach der Freigabe schalten wir ${months} Monate Premium frei. Jede weitere Freigabe verlängert.`, `Once approved we unlock ${months} months of premium. Every further approval extends it.`)],
              ].map(([h, b], i) => (
                <li key={h} className="flex gap-4">
                  <span className="font-display text-[40px] leading-[0.9] text-accent" aria-hidden>
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-serif text-[18px] leading-snug">{h}</div>
                    <div className="mt-1 text-[14px] text-muted">{b}</div>
                  </div>
                </li>
              ))}
            </ol>
            <PrivacyBand />
          </>
        )}

        <div>
          <h3 className="flex items-baseline gap-2 border-b border-line pb-3 font-serif text-[21px]">
            {t("Meine Einreichungen", "My submissions")}
            {!!cars?.length && <span className="font-sans text-[13px] text-muted">{cars.length}</span>}
          </h3>
          {loadError && <p className="pt-4 text-[14px] text-down">{t("Einreichungen konnten nicht geladen werden.", "Submissions could not be loaded.")}</p>}
          {cars && !cars.length && (
            <p className="py-8 text-center font-serif text-[15px] text-muted italic">{t("Noch nichts eingereicht.", "Nothing submitted yet.")}</p>
          )}
          <ul className="divide-y divide-line">{cars?.map((c) => <CarRow key={c.id} car={c} onChange={() => load(true)} />)}</ul>
        </div>
      </div>
    </Section>
  );
}

function CarRow({ car, onChange }: { car: UserCar; onChange: () => void }) {
  const v = variantById.get(car.variant_id);
  const value = v?.measured ? getMetrics(v.id).value : null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const appraisal = car.kind === "gutachten";
  const d = doc(car.kind);
  // an expired report lost its document after a day without a decision and takes a new one
  const open = car.status === "awaiting_contract" || car.status === "pending" || car.status === "expired";
  const takesUpload = open && !appraisal; // appraisals are no longer taken (server/userCars.ts)
  const deadline = car.status === "pending" && car.contract_at ? new Date(new Date(car.contract_at).getTime() + DOCUMENT_HOURS * 3_600_000) : null;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const remove = async () => {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/fahrzeuge/${car.id}`, { method: "DELETE" });
      onChange();
    } catch {
      setErr(t("Das Löschen hat nicht geklappt. Bitte später noch einmal versuchen.", "Deleting did not work. Please try again later."));
    } finally {
      setBusy(false);
    }
  };
  const day = date(new Date(car.sale_date).getTime());
  const facts = appraisal
    ? [`${t("Gutachten vom", "Appraised")} ${day}`, `${num(Number(car.price))} ${car.currency} (${VALUE_BASIS_LABEL(car.value_basis)})`, car.appraiser, car.condition && `${t("Note", "grade")} ${car.condition}`]
    : [`${car.role === "kauf" ? t("Gekauft", "Bought") : t("Verkauft", "Sold")} ${day}`, `${num(Number(car.price))} ${car.currency}`, COUNTERPARTY(car.counterparty)];
  return (
    <li className="flex flex-wrap items-start gap-x-5 gap-y-3 py-5">
      {confirmDialog}
      {v && <CarImage variant={v} className="hidden aspect-[16/10] w-32 shrink-0 rounded-[2px] sm:block" label={variantTitle(v)} />}
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Pill tone={appraisal ? "cobalt" : "gold"}>{KIND_LABEL(car.kind)}</Pill>
          <Pill tone={STATUS_TONE(car.status)}>{STATUS_LABEL(car.status, car.kind)}</Pill>
        </div>
        <div className="mt-1.5 font-serif text-[19px] leading-snug">
          {v ? (
            <Link to={`/markt/${v.id}`} className="hover:underline hover:decoration-line-2 hover:underline-offset-4">
              {variantTitle(v)}
            </Link>
          ) : (
            car.title
          )}
        </div>
        <div className="mt-0.5 text-[13.5px] text-muted">
          {[...facts, car.build_year, `${num(car.km)} km`, `FIN ${car.vin}`].filter(Boolean).join(" · ")}
        </div>
        {car.status === "approved" && value != null && (
          <div className="mt-1.5 text-[13.5px] text-muted">
            {t("Marktwert dieser Variante heute", "Market value of this variant today")}: <span className="money text-ink">{eur(value)}</span>
          </div>
        )}
        {car.review_note && (
          <div className="mt-1.5 text-[13.5px] text-muted">
            {t("Hinweis der Prüfung", "Review note")}: {car.review_note}
          </div>
        )}
        {open && appraisal && car.status !== "pending" && (
          <div className="mt-1.5 max-w-xl text-[13.5px] text-muted">
            {t("Wertgutachten nehmen wir nicht mehr an. Premium erhalten Sie mit einem Kaufvertrag oder durch Kauf.", "We no longer take appraisals. You get premium with a purchase contract or by buying it.")}
          </div>
        )}
        {car.status === "expired" && !appraisal && (
          <div className="mt-1.5 max-w-xl text-[13.5px] text-muted">
            {t(
              `Wir bewahren kein Dokument länger als ${DOCUMENT_HOURS} Stunden auf. Die Prüfung war bis dahin nicht abgeschlossen, deshalb ist ${d.the} gelöscht. Ihre Angaben sind noch da: Laden Sie das Dokument einfach erneut hoch.`,
              `We keep no document for longer than ${DOCUMENT_HOURS} hours. The review was not finished by then, so ${d.the} has been deleted. Your details are still here: simply upload the document again.`,
            )}
          </div>
        )}
        {deadline && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-faint">
            <Lock className="size-3.5 shrink-0" strokeWidth={1.6} aria-hidden />
            {t("Verschlüsselt gespeichert. Wird gelöscht mit der Entscheidung, spätestens am", "Stored encrypted. Deleted with the decision, at the latest on")}{" "}
            {deadline.toLocaleString(locale(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            {car.ai_consent ? t(" · KI-Vorprüfung erlaubt", " · AI pre-check allowed") : t(" · ohne KI, Prüfung von Hand", " · no AI, checked by hand")}
          </div>
        )}
        {car.contract_deleted_at && car.status !== "pending" && car.status !== "expired" && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-faint">
            <Trash2 className="size-3.5 shrink-0" strokeWidth={1.6} aria-hidden />
            {d.The} {t("wurde gelöscht am", "was deleted on")} {date(new Date(car.contract_deleted_at).getTime())}.
          </div>
        )}
        {err && <div className="mt-1.5 text-[13.5px] text-down" role="alert">{err}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {takesUpload && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                setErr("");
                try {
                  await uploadContract(car.id, f);
                  onChange();
                } catch (x) {
                  setErr(uploadError(x));
                } finally {
                  setBusy(false);
                  e.target.value = ""; // the same file can be chosen again after an error
                }
              }}
            />
            <button className={cn("btn px-3 py-1.5 text-[13px]", car.status !== "pending" && "btn-gold")} disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" aria-hidden />{" "}
              {car.status === "pending" ? t("Anderes Dokument", "Another document") : car.status === "expired" ? t("Erneut hochladen", "Upload again") : t("Dokument hochladen", "Upload document")}
            </button>
          </>
        )}
        <button
          className="btn px-3 py-1.5 text-[13px]"
          disabled={busy}
          onClick={async () => {
            const [text, label] =
              car.status === "approved"
                ? [
                    t(
                      "Einreichung aus Ihrem Konto entfernen? Fahrgestellnummer, Notizen und die Verbindung zu Ihrem Konto werden gelöscht. Preis oder Wert, Datum und Fahrzeugdaten bleiben anonym in der Marktanalyse. Der dafür gewährte Premium-Zugang entfällt.",
                      "Remove this submission from your account? The chassis number, notes and the link to your account are deleted. Price or value, date and car details stay in the market analysis, anonymously. The premium access granted for it ends.",
                    ),
                    t("Entfernen", "Remove"),
                  ]
                : open
                  ? [t("Einreichung zurückziehen? Die Angaben und das Dokument werden gelöscht.", "Withdraw this submission? The details and the document will be deleted."), t("Zurückziehen", "Withdraw")]
                  : [t("Einreichung löschen? Alle Angaben dazu werden gelöscht.", "Delete this submission? All its details will be deleted."), t("Löschen", "Delete")];
            if (await confirm(text, { confirmLabel: label })) await remove();
          }}
        >
          <Trash2 className="size-3.5" aria-hidden /> {car.status === "approved" ? t("Aus Konto entfernen", "Remove from account") : open ? t("Zurückziehen", "Withdraw") : t("Löschen", "Delete")}
        </button>
      </div>
    </li>
  );
}

/** The document: drop it here or pick it. Shows the chosen file and, right at the upload, what happens to it. */
function Dropzone({ file, onFile, error }: { file: File | null; onFile: (f: File | null) => void; error?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const size = file ? (file.size > 1_048_576 ? `${num(file.size / 1_048_576, 1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`) : "";
  return (
    <div>
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => (onFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
      {file ? (
        <div className={cn("flex items-center gap-3 rounded-[3px] border bg-panel-2 px-4 py-3", error ? "border-down" : "border-line-2")}>
          <FileText className="size-6 shrink-0 text-accent" strokeWidth={1.4} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] text-ink">{file.name}</div>
            <div className="text-[12.5px] text-muted">
              {size}
              {file.size > MAX_BYTES && file.type.startsWith("image/") && t(" · wird vor dem Hochladen verkleinert", " · scaled down before the upload")}
            </div>
          </div>
          <button type="button" className="btn px-3 py-1.5 text-[13px]" onClick={() => input.current?.click()}>
            {t("Ersetzen", "Replace")}
          </button>
          <button type="button" className="btn btn-ghost p-1.5" aria-label={t("Datei entfernen", "Remove file")} onClick={() => onFile(null)}>
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-[3px] border border-dashed px-4 py-8 text-center transition-colors",
            over ? "border-accent bg-accent-soft" : error ? "border-down bg-panel" : "border-line-2 bg-panel hover:border-ink",
          )}
          onClick={() => input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            onFile(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <Upload className="size-6 text-accent" strokeWidth={1.4} aria-hidden />
          <span className="font-serif text-[17px] text-ink">
            {t("Kaufvertrag hierher ziehen oder auswählen", "Drop the contract here or choose it")}
          </span>
          <span className="text-[13px] text-muted">{t("PDF oder Foto (JPEG, PNG, WebP), höchstens 4 MB", "PDF or photo (JPEG, PNG, WebP), at most 4 MB")}</span>
        </button>
      )}
      <p className="mt-2 flex items-start gap-2 text-[13px] text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={1.8} aria-hidden />
        <span>
          <strong className="font-semibold text-ink">{t(`Verschlüsselt gespeichert, nach spätestens ${DOCUMENT_HOURS} Stunden gelöscht.`, `Stored encrypted, deleted after ${DOCUMENT_HOURS} hours at the latest.`)}</strong>{" "}
          {t("Namen, Anschriften, Unterschriften und Bankdaten dürfen Sie schwärzen; Fahrzeug, Fahrgestellnummer, Preis und Datum müssen lesbar sein.", "You may black out names, addresses, signatures and bank details; the car, chassis number, price and date must stay readable.")}
        </span>
      </p>
      {error && <p className="mt-1 text-xs text-down">{error}</p>}
    </div>
  );
}

/** A numbered part of the form with its own heading. */
function Step({ n, title, sub, children }: { n: number; title: string; sub?: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t border-line px-5 py-6 first:border-t-0 sm:px-7">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-baseline gap-3" aria-hidden>
        <span className="font-display text-[26px] leading-none text-accent">{n}</span>
        <span className="font-serif text-[19px]">{title}</span>
        {sub && <span className="text-[13px] text-muted">{sub}</span>}
      </div>
      {children}
    </fieldset>
  );
}

function ReportForm({ from, months, onCancel, onDone, onPartial }: { from?: Holding; months: number; onCancel: () => void; onDone: () => void; onPartial: () => void }) {
  const [d, setD] = useState<Draft>(() => startDraft(from));
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit() {
    const e: Record<string, string> = {};
    const price = parseNum(d.price);
    const km = d.km.trim() === "" ? NaN : parseNum(d.km);
    const bad = (k: string) => (e[k] = FIELD_ERR[k]());
    if (!variantById.has(d.variant_id)) bad("variant_id");
    if (!/^\d{4}$/.test(d.build_year)) bad("build_year");
    if (d.vin.replace(/\s/g, "").length < 5) bad("vin");
    if (!Number.isFinite(km) || km < 0) bad("km");
    if (!Number.isFinite(price) || price < 500) bad("price");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.sale_date) || d.sale_date > today()) bad("sale_date");
    if (d.condition && !/^[1-5][+-]?$/.test(d.condition)) bad("condition");
    // checked before the report is saved: a file the server would turn down (HEIC, Word …) must not leave a report without a document behind
    if (!file || !ACCEPT.split(",").includes(file.type) || (file.size > MAX_BYTES && !file.type.startsWith("image/"))) bad("file");
    if (!consent) bad("consent");
    setErrors(e);
    if (Object.keys(e).length) return setMsg(t("Bitte die markierten Felder prüfen.", "Please check the marked fields."));
    setBusy(true);
    setMsg("");
    const tri = (s: string) => (s === "ja" ? true : s === "nein" ? false : null);
    let id: string;
    try {
      ({ id } = await api<{ id: string }>("/api/fahrzeuge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...d, build_year: Number(d.build_year), km: Math.round(km), price,
          matching_numbers: tri(d.matching_numbers), accident_free: tri(d.accident_free), consent, ai_consent: aiConsent,
        }),
      }));
    } catch (err) {
      const fields = (err as { body?: { fields?: Record<string, string> } }).body?.fields ?? {};
      setErrors(Object.fromEntries(Object.keys(fields).map((k) => [k, (FIELD_ERR[k] ?? FIELD_ERR.counterparty)()])));
      const { status, message } = err as { status?: number; message?: string };
      setMsg(
        status === 429
          ? t("Heute wurde schon viel eingereicht. Bitte morgen weiter.", "A lot was submitted today already. Please continue tomorrow.")
          : message === "demo"
            ? uploadError(err)
            : Object.keys(fields).length
              ? t("Bitte die markierten Felder prüfen.", "Please check the marked fields.")
              : t("Die Einreichung konnte nicht gespeichert werden. Bitte später noch einmal versuchen.", "The submission could not be saved. Please try again later."),
      );
      setBusy(false);
      return;
    }
    setMsg(t("Dokument wird verschlüsselt hochgeladen …", "Uploading the document, encrypted …"));
    try {
      await uploadContract(id, file!);
      onDone();
    } catch {
      setBusy(false);
      onPartial();
    }
  }

  const err = (k: string) => errors[k] && <p className="mt-1 text-xs text-down">{errors[k]}</p>;
  const field = (k: string) => cn("input", errors[k] && "border-down");
  const yn = (k: "matching_numbers" | "accident_free", label: string) => (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={d[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">{t("Keine Angabe", "Not stated")}</option>
        <option value="ja">{t("Ja", "Yes")}</option>
        <option value="nein">{t("Nein", "No")}</option>
      </select>
    </div>
  );
  const condition = (
    <div>
      <label className="label">{t("Zustandsnote (1–5)", "Condition grade (1–5)")}</label>
      <input className={field("condition")} maxLength={2} placeholder={t("z. B. 2+", "e.g. 2+")} value={d.condition} onChange={(e) => set("condition", e.target.value)} />
      {err("condition")}
    </div>
  );

  return (
    <form
      className="panel min-w-0"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-5 sm:px-7">
        <div>
          <div className="eyebrow text-gold">
            {t(`${months} Monate Premium nach der Freigabe`, `${months} months of premium once approved`)}
          </div>
          <h3 className="mt-1 font-display text-[28px] leading-tight">{t("Kaufvertrag einreichen", "Submit a purchase contract")}</h3>
        </div>
        <button type="button" className="btn btn-ghost px-3 py-1.5 text-[13px]" disabled={busy} onClick={onCancel}>
          <X className="size-4" aria-hidden /> {t("Abbrechen", "Cancel")}
        </button>
      </header>

      <Step n={1} title={t("Fahrzeug", "Car")}>
        <VariantPicker value={d.variant_id} onChange={(id) => (set("variant_id", id), setErrors((x) => ({ ...x, variant_id: "" })))} error={errors.variant_id || undefined} />
        <div className="mt-4">
          <span className="label">{t("Was haben Sie gemacht?", "What did you do?")}</span>
          <div className="flex flex-wrap gap-2">
            {(["kauf", "verkauf"] as const).map((r) => (
              <button type="button" key={r} className={cn("chip px-3 py-1.5 text-[14px]", d.role === r && "chip-active")} aria-pressed={d.role === r} onClick={() => set("role", r)}>
                {r === "kauf" ? t("Ich habe das Auto gekauft", "I bought the car") : t("Ich habe das Auto verkauft", "I sold the car")}
              </button>
            ))}
          </div>
        </div>
      </Step>

      <Step n={2} title={t("Angaben laut Vertrag", "Details as in the contract")} sub={t("genau wie im Dokument", "exactly as in the document")}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <div>
            <label className="label">{t("Kaufpreis laut Vertrag", "Price as in the contract")}</label>
            <div className="flex gap-2">
              <input className={field("price")} inputMode="decimal" value={d.price} onChange={(e) => set("price", e.target.value)} />
              <select className="input w-24 shrink-0" aria-label={t("Währung", "Currency")} value={d.currency} onChange={(e) => set("currency", e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            {err("price")}
          </div>
          <div>
            <label className="label">{t("Datum des Kaufvertrags", "Contract date")}</label>
            <input className={field("sale_date")} type="date" max={today()} value={d.sale_date} onChange={(e) => set("sale_date", e.target.value)} />
            {err("sale_date")}
          </div>
          <div>
            <label className="label">{t("Fahrgestellnummer (FIN)", "Chassis number (VIN)")}</label>
            <input className={cn(field("vin"), "uppercase")} value={d.vin} maxLength={30} autoCapitalize="characters" spellCheck={false} onChange={(e) => set("vin", e.target.value)} />
            {err("vin")}
          </div>
          <div>
            <label className="label">{t("Baujahr", "Build year")}</label>
            <input className={field("build_year")} inputMode="numeric" maxLength={4} value={d.build_year} onChange={(e) => set("build_year", e.target.value)} />
            {err("build_year")}
          </div>
          <div>
            <label className="label">{t("Kilometerstand", "Mileage (km)")}</label>
            <input className={field("km")} inputMode="numeric" value={d.km} onChange={(e) => set("km", e.target.value)} />
            {err("km")}
          </div>
          <div>
            <label className="label">{t("Land des Verkaufs", "Country of sale")}</label>
            <select className="input" value={d.country} onChange={(e) => set("country", e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{d.role === "kauf" ? t("Gekauft von", "Bought from") : t("Verkauft an", "Sold to")}</label>
            <select className="input" value={d.counterparty} onChange={(e) => set("counterparty", e.target.value as Draft["counterparty"])}>
              <option value="privat">{t("Privatperson", "Private person")}</option>
              <option value="haendler">{t("Händler", "Dealer")}</option>
              <option value="auktion">{t("Auktion", "Auction")}</option>
            </select>
          </div>
        </div>

        <details className="group mt-5 rounded-[3px] border border-line bg-panel-2/60" open={Boolean(errors.condition) || undefined}>
          <summary className="cursor-pointer list-none px-4 py-2.5 text-[14px] text-ink marker:hidden">
            <span className="mr-2 inline-block text-accent transition-transform group-open:rotate-90" aria-hidden>
              ›
            </span>
            {t("Weitere Angaben zum Fahrzeug", "More about the car")} <span className="text-muted">{t("(optional, machen den Beleg wertvoller)", "(optional, make the record more useful)")}</span>
          </summary>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 border-t border-line px-4 py-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">{t("Bezeichnung im Dokument", "Name in the document")}</label>
              <input className="input" value={d.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder={t("z. B. 911 Carrera 3.2 Coupé G50", "e.g. 911 Carrera 3.2 Coupé G50")} />
            </div>
            <div>
              <label className="label">{t("Karosserie", "Body")}</label>
              <select className="input" value={d.body} onChange={(e) => set("body", e.target.value)}>
                <option value="">{t("Keine Angabe", "Not stated")}</option>
                {["Coupé", "Targa", "Cabriolet", "Speedster", "Roadster"].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t("Getriebe", "Gearbox")}</label>
              <select className="input" value={d.gearbox} onChange={(e) => set("gearbox", e.target.value)}>
                <option value="">{t("Keine Angabe", "Not stated")}</option>
                <option value="Manuell">{t("Schaltgetriebe", "Manual")}</option>
                <option value="Automatik">{t("Automatik / PDK / Tiptronic", "Automatic / PDK / Tiptronic")}</option>
              </select>
            </div>
            <div>
              <label className="label">{t("Lenkung", "Steering")}</label>
              <select className="input" value={d.steering} onChange={(e) => set("steering", e.target.value)}>
                <option value="links">{t("Linkslenker", "Left-hand drive")}</option>
                <option value="rechts">{t("Rechtslenker", "Right-hand drive")}</option>
              </select>
            </div>
            {condition}
            <div>
              <label className="label">{t("Außenfarbe", "Exterior colour")}</label>
              <input className="input" maxLength={60} value={d.color_ext} onChange={(e) => set("color_ext", e.target.value)} />
            </div>
            <div>
              <label className="label">{t("Innenausstattung", "Interior")}</label>
              <input className="input" maxLength={60} value={d.color_int} onChange={(e) => set("color_int", e.target.value)} />
            </div>
            {yn("matching_numbers", "Matching Numbers")}
            {yn("accident_free", t("Unfallfrei", "Accident-free"))}
            <div className="sm:col-span-2">
              <label className="label">{t("Anmerkungen", "Notes")}</label>
              <textarea className="input min-h-16" maxLength={2000} value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder={t("Historie, Restaurierung, Besonderheiten …", "History, restoration, special features …")} />
            </div>
          </div>
        </details>
      </Step>

      <Step n={3} title={t("Kaufvertrag", "Purchase contract")}>
        <Dropzone file={file} onFile={(f) => (setFile(f), setErrors((x) => ({ ...x, file: "" })))} error={errors.file || undefined} />
      </Step>

      <Step n={4} title={t("Einwilligung", "Consent")}>
        <div className="space-y-3">
          <label className={cn("flex items-start gap-3 rounded-[3px] border bg-panel-2/60 p-4 text-[13.5px] leading-relaxed", errors.consent ? "border-down" : "border-line")}>
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" checked={consent} onChange={(e) => (setConsent(e.target.checked), setErrors((x) => ({ ...x, consent: "" })))} />
            <span>
              {t(
                    "Ich bestätige, dass die Angaben stimmen und ich an diesem Kauf oder Verkauf beteiligt war. Ich willige ein, dass Carbay meine Angaben und den Kaufvertrag speichert, ein Prüfer von Carbay den Vertrag mit den Angaben vergleicht, der Vertrag mit der Entscheidung, spätestens 24 Stunden nach dem Hochladen, gelöscht wird und Preis, Datum und Fahrzeugdaten ohne meinen Namen und ohne Fahrgestellnummer in die Marktanalyse eingehen. Die Einwilligung kann ich jederzeit widerrufen, indem ich die Einreichung hier lösche; nach der Freigabe bleiben Preis, Datum und Fahrzeugdaten anonym in der Marktanalyse.",
                    "I confirm that the details are correct and that I was party to this purchase or sale. I consent to Carbay storing my details and the purchase contract, a Carbay reviewer comparing the contract with the details, the contract being deleted with the decision, 24 hours after the upload at the latest, and price, date and car details entering the market analysis without my name and without the chassis number. I can withdraw this consent at any time by deleting the submission here; after approval, price, date and car details stay in the market analysis, anonymously.",
              )}{" "}
              <Link to="/datenschutz" className="link">
                {t("Datenschutzerklärung", "Privacy notice")}
              </Link>
            </span>
          </label>
          {err("consent")}
          <label className="flex items-start gap-3 rounded-[3px] border border-line p-4 text-[13.5px] leading-relaxed">
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} />
            <span>
              <span className="text-ink">{t("Optional: schnellere Prüfung mit KI.", "Optional: faster review with AI.")}</span>{" "}
              {t(
                "Ich willige ein, dass der Vertrag zur Vorprüfung an den KI-Dienst von Anthropic (USA) übermittelt wird. Anthropic verwendet das Dokument nicht zum Training seiner Modelle. Für die dorthin übermittelte Kopie gelten die Aufbewahrungsfristen von Anthropic. Ohne dieses Häkchen verlässt das Dokument unseren Server nicht und ein Mensch prüft von Hand; das kann länger dauern.",
                "I consent to the contract being sent to Anthropic's AI service (USA) for a pre-check. Anthropic does not use the document to train its models. The copy sent there is subject to Anthropic's retention periods. Without this tick the document does not leave our server and a person checks by hand, which can take longer.",
              )}
            </span>
          </label>
        </div>
      </Step>

      <footer className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-5 sm:px-7">
        <button type="submit" className="btn btn-gold px-5" disabled={busy}>
          {busy ? t("Wird gesendet …", "Sending …") : t("Kaufvertrag einreichen", "Submit contract")}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          {t("Abbrechen", "Cancel")}
        </button>
        {msg && (
          <span className={cn("text-[13.5px]", busy ? "text-muted" : "text-down")} role="status">
            {msg}
          </span>
        )}
      </footer>
    </form>
  );
}
