import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileCheck2, ShieldCheck, Trash2, Upload } from "lucide-react";
import { brands, generationById, modelName, models, variantById, variantTitle, yearsLabel } from "../../data/db";
import { getMetrics } from "../../data/market";
import { cn, date, eur, num } from "../../lib/format";
import { isEn, t } from "../../i18n";
import { Card, Pill, Section, useConfirm } from "../ui";
import { ACCEPT, COUNTERPARTY, MAX_BYTES, STATUS_LABEL, STATUS_TONE, api, uploadContract, useMe, type UserCar } from "../../lib/userCars";

const COUNTRIES = ["DE", "AT", "CH", "NL", "BE", "LU", "FR", "IT", "ES", "GB", "DK", "SE", "NO", "PL", "CZ", "US", "CA"];
const CURRENCIES = ["EUR", "CHF", "GBP", "USD", "SEK", "DKK", "NOK", "CAD"];
const today = () => new Date().toISOString().slice(0, 10);
const parseNum = (s: string) => Number(isEn() ? s.replace(/[,\s]/g, "") : s.replace(/\./g, "").replace(/\s/g, "").replace(",", "."));

type Draft = {
  role: "kauf" | "verkauf";
  brandId: string;
  modelId: string;
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

function emptyDraft(): Draft {
  const v = variantById.get("porsche-911-g-modell-carrera-3-2") ?? variantById.values().next().value!;
  return {
    role: "kauf", brandId: v.brandId, modelId: v.modelId, variant_id: v.id, title: "", build_year: "", vin: "", km: "", price: "",
    currency: "EUR", sale_date: "", country: "DE", counterparty: "privat", body: "", gearbox: "", steering: "links", color_ext: "",
    color_int: "", condition: "", matching_numbers: "", accident_free: "", notes: "",
  };
}

const FIELD_ERR: Record<string, () => string> = {
  role: () => t("Bitte Kauf oder Verkauf wählen.", "Please choose bought or sold."),
  variant_id: () => t("Bitte eine Variante wählen.", "Please choose a variant."),
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
  if (status === 429) return t("Heute wurden schon viele Verträge hochgeladen. Bitte morgen weiter.", "Many contracts uploaded today already. Please continue tomorrow.");
  return FIELD_ERR.file();
};

/** How the contract is protected, in the words of the privacy notice (src/legal.ts section 3). Shown next to the upload. */
function ContractProtection() {
  const points: [string, string][] = [
    [t("Schwärzen erlaubt", "Redact what we do not need"), t("Namen, Anschriften, Unterschriften, Ausweis- und Bankdaten dürfen Sie unkenntlich machen. Lesbar bleiben müssen nur Fahrzeug, Fahrgestellnummer, Preis und Datum.", "You may black out names, addresses, signatures, ID and bank details. Only the car, chassis number, price and date must stay readable.")],
    [t("Verschlüsselt gespeichert", "Stored encrypted"), t("Die Übertragung läuft über HTTPS. Der Vertrag wird vor dem Speichern mit AES-256 verschlüsselt, auf Servern in Frankfurt am Main.", "The transfer runs over HTTPS. The contract is encrypted with AES-256 before it is stored, on servers in Frankfurt am Main.")],
    [t("Nur für die Prüfung", "For the review only"), t("Nur unsere Prüfer öffnen den Vertrag, jeder Zugriff wird protokolliert. Er wird nicht weitergegeben und nicht veröffentlicht.", "Only our reviewers open the contract, and every access is logged. It is not passed on and not published.")],
    [t("Danach gelöscht", "Deleted afterwards"), t("Mit der Entscheidung der Prüfung löschen wir den Vertrag, spätestens nach 90 Tagen. In die Marktwerte gehen nur Preis, Datum und Fahrzeugdaten ein, ohne Namen und ohne Fahrgestellnummer.", "We delete the contract with the review decision, after 90 days at the latest. Only price, date and car details enter the market values, without names and without the chassis number.")],
    [t("KI nur mit Ihrer Zustimmung", "AI only if you agree"), t("Die Vorprüfung durch KI (Anthropic, USA) läuft nur, wenn Sie sie erlauben. Ohne sie prüft ein Mensch von Hand.", "The AI pre-check (Anthropic, USA) runs only if you allow it. Without it a person checks by hand.")],
    [t("Jederzeit löschbar", "Delete at any time"), t("Sie können jede Meldung hier selbst löschen, auch nach der Freigabe. Das Fahrzeug verlässt dann die Marktanalyse.", "You can delete any report here yourself, also after approval. The car then leaves the market analysis.")],
  ];
  return (
    <Card title={t("So schützen wir Ihren Kaufvertrag", "How we protect your contract")}>
      <ul className="grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
        {points.map(([h, b]) => (
          <li key={h} className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold" strokeWidth={1.5} aria-hidden />
            <div>
              <div className="text-ink">{h}</div>
              <div className="text-muted">{b}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] text-muted">
        {t("Alle Einzelheiten stehen in der ", "All details are in the ")}
        <Link to="/datenschutz" className="link">
          {t("Datenschutzerklärung", "privacy notice")}
        </Link>
        .
      </p>
    </Card>
  );
}

/** Report an own bought or sold car with its purchase contract, shown on the portfolio page (#melden). */
export function UserCarsSection() {
  const me = useMe();
  const [cars, setCars] = useState<UserCar[] | null>(null);
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [months, setMonths] = useState(12);
  const [loadError, setLoadError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [partial, setPartial] = useState(false);

  const load = () =>
    api<{ cars: UserCar[]; premiumUntil: string | null; premiumMonths: number }>("/api/fahrzeuge")
      .then((j) => {
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

  return (
    <Section title={t("Eigenes Fahrzeug melden", "Report my car")} sub={t("Mit Kaufvertrag, für Ihren kostenlosen Premium-Zugang", "With the purchase contract, for your free premium access")}>
      <div id="melden" className="max-w-4xl scroll-mt-28 space-y-6">
      <div>
        <p className="max-w-2xl text-[15px] text-muted">
          {t(
            `Sie haben einen Porsche gekauft oder verkauft? Tragen Sie die Daten ein und laden Sie den Kaufvertrag hoch. Wir prüfen den Vertrag, und nach der Freigabe geht der Preis anonym in unsere Marktwerte ein. Als Dank erhalten Sie ${months} Monate Premium-Zugang kostenlos.`,
            `Bought or sold a Porsche? Enter the details and upload the purchase contract. We check the contract, and once approved the price enters our market values anonymously. As a thank-you you get ${months} months of premium access free.`,
          )}
        </p>
        {me && premium && (
          <p className="mt-3">
            <Pill tone="up">
              {t("Premium bis", "Premium until")} {date(new Date(premiumUntil!).getTime())}
            </Pill>
          </p>
        )}
      </div>

      <Card title={t("So läuft es ab", "How it works")}>
        <ol className="grid gap-3 text-[14px] sm:grid-cols-3">
          {[
            [t("Daten eintragen", "Enter the details"), t("Fahrzeug, Fahrgestellnummer, Preis und Datum, genau wie im Vertrag.", "Car, chassis number, price and date, exactly as in the contract.")],
            [t("Kaufvertrag hochladen", "Upload the contract"), t("PDF oder Foto, gern geschwärzt. Wir prüfen ihn und löschen ihn nach der Prüfung.", "PDF or photo, redacted if you like. We check it and delete it after the review.")],
            [t("Freigabe", "Approval"), t(`Der Preis geht anonym in die Analyse ein, Sie erhalten ${months} Monate Premium.`, `The price enters the analysis anonymously, you get ${months} months of premium.`)],
          ].map(([h, b], i) => (
            <li key={h} className="border-l border-line pl-3">
              <div className="font-serif text-[16px]">
                {i + 1}. {h}
              </div>
              <div className="text-muted">{b}</div>
            </li>
          ))}
        </ol>
      </Card>

      <ContractProtection />

      {done && (
        <div className="panel flex items-start gap-3 p-4 text-[14px]">
          <FileCheck2 className="mt-0.5 size-5 shrink-0 text-up" strokeWidth={1.5} />
          <div>
            {t(
              "Danke! Ihr Fahrzeug und der Kaufvertrag sind eingegangen. Wir prüfen sie und melden das Ergebnis hier.",
              "Thank you! Your car and the contract have arrived. We will check them and show the result here.",
            )}
          </div>
        </div>
      )}

      {partial && (
        <p className="panel p-4 text-[14px] text-down" role="alert">
          {t(
            "Die Daten sind gespeichert, aber der Kaufvertrag konnte nicht hochgeladen werden. Sie können ihn unten in der Liste erneut hochladen.",
            "The details are saved, but the contract could not be uploaded. You can upload it again from the list below.",
          )}
        </p>
      )}

      {formOpen ? (
        <ReportForm
          onCancel={() => setFormOpen(false)}
          onDone={() => {
            setFormOpen(false);
            setDone(true);
            load();
          }}
          onPartial={() => {
            setFormOpen(false);
            setPartial(true);
            load();
          }}
        />
      ) : (
        <button className="btn btn-gold" onClick={() => (setFormOpen(true), setDone(false), setPartial(false))}>
          {t("Fahrzeug melden", "Report a car")}
        </button>
      )}

      <Card title={t("Meine Meldungen", "My reports")}>
        {loadError && <p className="text-[14px] text-down">{t("Meldungen konnten nicht geladen werden.", "Reports could not be loaded.")}</p>}
        {cars && !cars.length && <p className="text-[14px] text-muted">{t("Noch keine Meldungen.", "No reports yet.")}</p>}
        <ul className="divide-y divide-line">
          {cars?.map((c) => <CarRow key={c.id} car={c} onChange={load} />)}
        </ul>
      </Card>
      </div>
    </Section>
  );
}

function CarRow({ car, onChange }: { car: UserCar; onChange: () => void }) {
  const v = variantById.get(car.variant_id);
  const value = v ? getMetrics(v.id).value : null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const open = car.status === "awaiting_contract" || car.status === "pending";
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
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3">
      {confirmDialog}
      <div className="min-w-0">
        <div className="font-serif text-[17px]">
          {v ? (
            <Link to={`/markt/${v.id}`} className="hover:underline">
              {variantTitle(v)}
            </Link>
          ) : (
            car.title
          )}
        </div>
        <div className="text-[13px] text-muted">
          {car.role === "kauf" ? t("Gekauft", "Bought") : t("Verkauft", "Sold")} {date(new Date(car.sale_date).getTime())} ·{" "}
          {num(Number(car.price))} {car.currency} · {car.build_year} · {num(car.km)} km · {COUNTERPARTY(car.counterparty)} · FIN {car.vin}
        </div>
        {car.status === "approved" && value != null && (
          <div className="mt-1 text-[13px]">
            {t("Marktwert dieser Variante heute", "Market value of this variant today")}: <span className="text-ink">{eur(value)}</span>
          </div>
        )}
        {car.review_note && <div className="mt-1 text-[13px] text-muted">{t("Hinweis der Prüfung", "Review note")}: {car.review_note}</div>}
        {car.status === "expired" && (
          <div className="mt-1 text-[13px] text-muted">
            {t("Die Meldung wurde nicht rechtzeitig geprüft. Der Vertrag ist gelöscht; Sie können ihn erneut einreichen, indem Sie das Fahrzeug neu melden.", "The report was not reviewed in time. The contract is deleted; you can submit it again by reporting the car anew.")}
          </div>
        )}
        {car.contract_deleted_at && (
          <div className="mt-1 text-[12px] text-faint">
            {t("Kaufvertrag gelöscht am", "Contract deleted on")} {date(new Date(car.contract_deleted_at).getTime())}.
          </div>
        )}
        {car.status === "pending" && (
          <div className="mt-1 text-[12px] text-faint">
            {car.ai_consent ? t("KI-Vorprüfung erlaubt.", "AI pre-check allowed.") : t("Ohne KI: Prüfung von Hand.", "Without AI: checked by hand.")}
          </div>
        )}
        {err && <div className="mt-1 text-[13px] text-down">{err}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Pill tone={STATUS_TONE(car.status)}>{STATUS_LABEL(car.status)}</Pill>
        {open && (
          <div className="flex gap-2">
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
            <button className="btn text-[13px]" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" /> {car.status === "pending" ? t("Anderen Vertrag hochladen", "Upload another contract") : t("Vertrag hochladen", "Upload contract")}
            </button>
            <button
              className="btn text-[13px]"
              disabled={busy}
              onClick={async () => {
                if (!(await confirm(t("Meldung zurückziehen? Die Angaben und der Vertrag werden gelöscht.", "Withdraw this report? The details and the contract will be deleted."), { confirmLabel: t("Zurückziehen", "Withdraw") }))) return;
                await remove();
              }}
            >
              {t("Zurückziehen", "Withdraw")}
            </button>
          </div>
        )}
        {!open && (
          <button
            className="btn text-[13px]"
            disabled={busy}
            onClick={async () => {
              const text =
                car.status === "approved"
                  ? t("Meldung löschen? Die Angaben werden gelöscht, und das Fahrzeug wird beim nächsten Lauf aus der Marktanalyse entfernt. Ihr Premium-Zugang bleibt bestehen.", "Delete this report? The details are deleted and the car is removed from the market analysis on the next run. Your premium access stays.")
                  : t("Meldung löschen? Alle Angaben dazu werden gelöscht.", "Delete this report? All its details will be deleted.");
              if (!(await confirm(text, { confirmLabel: t("Löschen", "Delete") }))) return;
              await remove();
            }}
          >
            <Trash2 className="size-3.5" /> {t("Löschen", "Delete")}
          </button>
        )}
      </div>
    </li>
  );
}

function ReportForm({ onCancel, onDone, onPartial }: { onCancel: () => void; onDone: () => void; onPartial: () => void }) {
  const [d, setD] = useState<Draft>(emptyDraft);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const brandModels = useMemo(() => models.filter((m) => m.brandId === d.brandId), [d.brandId]);
  const modelVariants = useMemo(() => {
    const m = models.find((x) => x.id === d.modelId);
    return (m?.generationIds ?? []).flatMap((gid) => generationById.get(gid)!.variantIds.map((id) => variantById.get(id)!));
  }, [d.modelId]);

  async function submit() {
    const e: Record<string, string> = {};
    const price = parseNum(d.price);
    const km = d.km.trim() === "" ? NaN : parseNum(d.km);
    if (!variantById.has(d.variant_id)) e.variant_id = FIELD_ERR.variant_id();
    if (!/^\d{4}$/.test(d.build_year)) e.build_year = FIELD_ERR.build_year();
    if (d.vin.replace(/\s/g, "").length < 5) e.vin = FIELD_ERR.vin();
    if (!Number.isFinite(km) || km < 0) e.km = FIELD_ERR.km();
    if (!Number.isFinite(price) || price < 500) e.price = FIELD_ERR.price();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.sale_date) || d.sale_date > today()) e.sale_date = FIELD_ERR.sale_date();
    if (d.condition && !/^[1-5][+-]?$/.test(d.condition)) e.condition = FIELD_ERR.condition();
    // checked before the report is saved: a file the server would turn down (HEIC, Word …) must not leave a report without a contract behind
    if (!file || !ACCEPT.split(",").includes(file.type) || (file.size > MAX_BYTES && !file.type.startsWith("image/"))) e.file = FIELD_ERR.file();
    if (!consent) e.consent = FIELD_ERR.consent();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setMsg("");
    const tri = (s: string) => (s === "ja" ? true : s === "nein" ? false : null);
    let id: string;
    try {
      ({ id } = await api<{ id: string }>("/api/fahrzeuge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...d, brandId: undefined, modelId: undefined, build_year: Number(d.build_year), km: Math.round(km), price,
          matching_numbers: tri(d.matching_numbers), accident_free: tri(d.accident_free), consent, ai_consent: aiConsent,
        }),
      }));
    } catch (err) {
      const fields = (err as { body?: { fields?: Record<string, string> } }).body?.fields ?? {};
      setErrors(Object.fromEntries(Object.keys(fields).map((k) => [k, (FIELD_ERR[k] ?? FIELD_ERR.counterparty)()])));
      const { status, message } = err as { status?: number; message?: string };
      setMsg(
        status === 429
          ? t("Heute wurden schon viele Fahrzeuge gemeldet. Bitte morgen weiter.", "Many cars reported today already. Please continue tomorrow.")
          : message === "demo"
            ? uploadError(err)
            : Object.keys(fields).length
              ? t("Bitte die markierten Felder prüfen.", "Please check the marked fields.")
              : t("Die Meldung konnte nicht gespeichert werden. Bitte später noch einmal versuchen.", "The report could not be saved. Please try again later."),
      );
      setBusy(false);
      return;
    }
    setMsg(t("Kaufvertrag wird hochgeladen …", "Uploading the contract …"));
    try {
      await uploadContract(id, file!);
      onDone();
    } catch {
      setBusy(false);
      onPartial();
    }
  }

  const err = (k: string) => errors[k] && <p className="mt-1 text-xs text-down">{errors[k]}</p>;
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

  return (
    <Card title={t("Fahrzeug melden", "Report a car")}>
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="sm:col-span-2">
          <label className="label">{t("Was haben Sie gemacht?", "What did you do?")}</label>
          <div className="flex gap-2">
            {(["kauf", "verkauf"] as const).map((r) => (
              <button type="button" key={r} className={cn("chip", d.role === r && "chip-active")} onClick={() => set("role", r)}>
                {r === "kauf" ? t("Ich habe das Auto gekauft", "I bought the car") : t("Ich habe das Auto verkauft", "I sold the car")}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">{t("Marke", "Brand")}</label>
          <select
            className="input"
            value={d.brandId}
            onChange={(e) => {
              const m = models.find((x) => x.brandId === e.target.value)!;
              setD((x) => ({ ...x, brandId: e.target.value, modelId: m.id, variant_id: generationById.get(m.generationIds[0])!.variantIds[0] }));
            }}
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t("Modell", "Model")}</label>
          <select
            className="input"
            value={d.modelId}
            onChange={(e) => {
              const m = models.find((x) => x.id === e.target.value)!;
              setD((x) => ({ ...x, modelId: m.id, variant_id: generationById.get(m.generationIds[0])!.variantIds[0] }));
            }}
          >
            {brandModels.map((m) => (
              <option key={m.id} value={m.id}>
                {modelName(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t("Variante", "Variant")}</label>
          <select className="input" value={d.variant_id} onChange={(e) => set("variant_id", e.target.value)}>
            {modelVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {variantTitle(v, { brand: false })} ({yearsLabel(v.years)})
              </option>
            ))}
          </select>
          {err("variant_id")}
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t("Bezeichnung im Vertrag (optional)", "Name in the contract (optional)")}</label>
          <input className="input" value={d.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder={t("z. B. 911 Carrera 3.2 Coupé G50", "e.g. 911 Carrera 3.2 Coupé G50")} />
        </div>
        <div>
          <label className="label">{t("Baujahr", "Build year")}</label>
          <input className="input" inputMode="numeric" maxLength={4} value={d.build_year} onChange={(e) => set("build_year", e.target.value)} />
          {err("build_year")}
        </div>
        <div>
          <label className="label">{t("Fahrgestellnummer (FIN)", "Chassis number (VIN)")}</label>
          <input className="input uppercase" value={d.vin} maxLength={30} autoCapitalize="characters" spellCheck={false} onChange={(e) => set("vin", e.target.value)} />
          {err("vin")}
        </div>
        <div>
          <label className="label">{t("Kilometerstand", "Mileage (km)")}</label>
          <input className="input" inputMode="numeric" value={d.km} onChange={(e) => set("km", e.target.value)} />
          {err("km")}
        </div>
        <div>
          <label className="label">{t("Datum des Kaufvertrags", "Contract date")}</label>
          <input className="input" type="date" max={today()} value={d.sale_date} onChange={(e) => set("sale_date", e.target.value)} />
          {err("sale_date")}
        </div>
        <div>
          <label className="label">{t("Kaufpreis laut Vertrag", "Price as in the contract")}</label>
          <input className="input" inputMode="decimal" value={d.price} onChange={(e) => set("price", e.target.value)} />
          {err("price")}
        </div>
        <div>
          <label className="label">{t("Währung", "Currency")}</label>
          <select className="input" value={d.currency} onChange={(e) => set("currency", e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
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
        <div>
          <label className="label">{t("Zustandsnote (1–5)", "Condition grade (1–5)")}</label>
          <input className="input" maxLength={2} placeholder={t("z. B. 2+", "e.g. 2+")} value={d.condition} onChange={(e) => set("condition", e.target.value)} />
          {err("condition")}
        </div>
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
          <label className="label">{t("Anmerkungen (optional)", "Notes (optional)")}</label>
          <textarea className="input min-h-16" maxLength={2000} value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder={t("Historie, Restaurierung, Besonderheiten …", "History, restoration, special features …")} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t("Kaufvertrag", "Purchase contract")}</label>
          <input className="input" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="mt-1 text-xs text-muted">
            {t(
              "PDF oder Foto (JPEG, PNG), höchstens 4 MB. Namen, Anschriften, Unterschriften und Bankdaten dürfen Sie schwärzen; Fahrzeug, Fahrgestellnummer, Preis und Datum müssen lesbar sein. Der Vertrag wird verschlüsselt gespeichert, nur zur Prüfung verwendet und danach gelöscht.",
              "PDF or photo (JPEG, PNG), at most 4 MB. You may black out names, addresses, signatures and bank details; the car, chassis number, price and date must stay readable. The contract is stored encrypted, used for the review only and deleted afterwards.",
            )}
          </p>
          {err("file")}
        </div>
        <label className="flex items-start gap-2 text-[13.5px] sm:col-span-2">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            {t(
              "Ich bestätige, dass die Angaben stimmen und ich an diesem Kauf oder Verkauf beteiligt war. Ich willige ein, dass Carbay meine Angaben und den Kaufvertrag speichert, ein Prüfer von Carbay den Vertrag mit den Angaben vergleicht, der Vertrag danach gelöscht wird und Preis, Datum und Fahrzeugdaten ohne meinen Namen und ohne Fahrgestellnummer in die Marktanalyse eingehen. Die Einwilligung kann ich jederzeit widerrufen, indem ich die Meldung hier lösche.",
              "I confirm that the details are correct and that I was party to this purchase or sale. I consent to Carbay storing my details and the purchase contract, a Carbay reviewer comparing the contract with the details, the contract being deleted afterwards, and price, date and car details entering the market analysis without my name and without the chassis number. I can withdraw this consent at any time by deleting the report here.",
            )}{" "}
            <Link to="/datenschutz" className="link">
              {t("Datenschutzerklärung", "Privacy notice")}
            </Link>
          </span>
        </label>
        {err("consent")}
        <label className="flex items-start gap-2 text-[13.5px] sm:col-span-2">
          <input type="checkbox" className="mt-1" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} />
          <span>
            {t(
              "Optional: Ich willige ein, dass der Vertrag zur schnelleren Vorprüfung an den KI-Dienst von Anthropic (USA) übermittelt wird. Anthropic verwendet ihn nicht zum Training seiner Modelle. Ohne dieses Häkchen prüft ein Mensch von Hand; das kann länger dauern.",
              "Optional: I consent to the contract being sent to Anthropic's AI service (USA) for a faster pre-check. Anthropic does not use it to train its models. Without this tick a person checks by hand, which can take longer.",
            )}
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" className="btn btn-gold" disabled={busy}>
            {busy ? t("Wird gesendet …", "Sending …") : t("Fahrzeug melden", "Report car")}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            {t("Abbrechen", "Cancel")}
          </button>
          {msg && <span className="text-[13px] text-muted">{msg}</span>}
        </div>
      </form>
    </Card>
  );
}
