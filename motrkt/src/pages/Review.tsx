import { useEffect, useState } from "react";
import { variantById, variantTitle, variants } from "../data/db";
import { getMetrics } from "../data/market";
import { date, eur, num } from "../lib/format";
import { t } from "../i18n";
import { Card, Pill } from "../components/ui";
import { COUNTERPARTY, STATUS_LABEL, STATUS_TONE, api, useMe, type ReviewCar } from "../lib/userCars";

/** Reviewers (MIP_ADMINS): check the users' car reports against their contracts, then approve or reject. */
export default function Review() {
  const me = useMe();
  const [data, setData] = useState<{ open: ReviewCar[]; done: ReviewCar[] } | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    api<{ open: ReviewCar[]; done: ReviewCar[] }>("/api/pruefung")
      .then(setData)
      .catch((e) => setError((e as { status?: number }).status === 403 ? "forbidden" : "load"));
  useEffect(() => {
    load();
  }, []);

  if (error === "forbidden" || (me && !me.admin))
    return <p className="text-muted">{t("Diese Seite ist nur für Prüfer.", "This page is for reviewers only.")}</p>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[34px] leading-tight">{t("Prüfung der Nutzerfahrzeuge", "Review of user cars")}</h1>
        <p className="mt-1 text-[14px] text-muted">
          {t(
            "Angaben mit dem Kaufvertrag vergleichen. Freigeben übernimmt das Fahrzeug in die nächste Marktwert-Berechnung (nachts) und schaltet dem Nutzer Premium frei. Beide Entscheidungen löschen den Vertrag.",
            "Compare the entries with the contract. Approving adds the car to the next market value run (nightly) and gives the user premium. Both decisions delete the contract.",
          )}
        </p>
      </div>
      {error === "load" && <p className="text-down">{t("Konnte nicht geladen werden.", "Could not be loaded.")}</p>}
      {data && !data.open.length && <p className="text-muted">{t("Keine offenen Meldungen.", "No open reports.")}</p>}
      {data?.open.map((c) => <ReviewItem key={c.id} car={c} onDone={load} />)}
      {data && data.done.length > 0 && (
        <Card title={t("Zuletzt entschieden", "Recently decided")}>
          <ul className="divide-y divide-line text-[14px]">
            {data.done.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {variantById.get(c.variant_id) ? variantTitle(variantById.get(c.variant_id)!) : c.title} · {num(Number(c.price))} {c.currency} ·{" "}
                  {c.username ?? "?"}
                </span>
                <span className="flex items-center gap-2 text-muted">
                  {c.reviewer} {c.reviewed_at && date(new Date(c.reviewed_at).getTime())}
                  <Pill tone={STATUS_TONE(c.status)}>{STATUS_LABEL(c.status)}</Pill>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

const VERDICT = {
  passt: { tone: "up" as const, de: "Vertrag passt", en: "Contract matches" },
  abweichungen: { tone: "warn" as const, de: "Abweichungen", en: "Mismatches" },
  unklar: { tone: "warn" as const, de: "Unklar", en: "Unclear" },
  kein_vertrag: { tone: "down" as const, de: "Kein Kaufvertrag", en: "Not a purchase contract" },
};

function ReviewItem({ car, onDone }: { car: ReviewCar; onDone: () => void }) {
  const [ai, setAi] = useState(car.ai_check);
  const [note, setNote] = useState("");
  const [fix, setFix] = useState({ variant_id: car.variant_id, price: "", sale_date: "", km: "", build_year: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const v = variantById.get(car.variant_id);
  const value = v ? getMetrics(v.id).value : null;
  const ratio = value ? Number(car.price) / value : null;
  const contractUrl = `/api/pruefung/${car.id}/vertrag`;

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && !note.trim()) return setMsg(t("Bitte einen Grund für die Ablehnung angeben (der Nutzer sieht ihn).", "Please give a reason (the user sees it)."));
    const corrections: Record<string, string> = {};
    if (fix.variant_id !== car.variant_id) corrections.variant_id = fix.variant_id;
    for (const k of ["price", "sale_date", "km", "build_year"] as const) if (fix[k].trim()) corrections[k] = fix[k].trim();
    setBusy(true);
    try {
      await api(`/api/pruefung/${car.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim(), corrections }),
      });
      onDone();
    } catch (e) {
      setMsg(t("Fehler: ", "Error: ") + (e as Error).message);
      setBusy(false);
    }
  }

  const row = (label: string, val: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-line py-1">
      <span className="text-muted">{label}</span>
      <span className="text-right">{val}</span>
    </div>
  );

  return (
    <Card
      title={v ? variantTitle(v) : car.title}
      sub={`${car.username ?? "?"} · ${t("eingereicht", "submitted")} ${date(new Date(car.created_at).getTime())}`}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="text-[14px]">
          {row(t("Rolle", "Role"), car.role === "kauf" ? t("hat gekauft", "bought") : t("hat verkauft", "sold"))}
          {row(t("Bezeichnung", "Name"), car.title)}
          {row(t("Baujahr", "Build year"), car.build_year)}
          {row("FIN", <span className="font-mono">{car.vin}</span>)}
          {row(t("Kilometer", "Mileage"), `${num(car.km)} km`)}
          {row(t("Preis", "Price"), `${num(Number(car.price))} ${car.currency}`)}
          {row(t("Vertragsdatum", "Contract date"), date(new Date(car.sale_date).getTime()))}
          {row(t("Land", "Country"), car.country)}
          {row(t("Gegenseite", "Counterparty"), COUNTERPARTY(car.counterparty))}
          {row(
            t("Weitere Angaben", "Other details"),
            [car.body, car.gearbox, car.steering === "rechts" ? "RHD" : null, car.color_ext, car.color_int, car.condition && `Note ${car.condition}`,
              car.matching_numbers ? "Matching" : null, car.accident_free === false ? t("Unfall", "Accident") : null]
              .filter(Boolean)
              .join(" · ") || "–",
          )}
          {car.notes && row(t("Anmerkungen", "Notes"), car.notes)}
          {value != null &&
            row(
              t("Marktwert der Variante", "Variant market value"),
              <span>
                {eur(value)}
                {ratio != null && (
                  <span className={ratio > 2 || ratio < 0.5 ? " text-down" : " text-muted"}> ({Math.round((ratio - 1) * 100)} %)</span>
                )}
              </span>,
            )}
          <div className="mt-3 flex gap-3">
            <a className="btn text-[13px]" href={contractUrl} target="_blank" rel="noreferrer">
              {t("Kaufvertrag öffnen", "Open contract")}
            </a>
            <span className="self-center text-[12px] text-faint">
              {car.contract_name} · {car.contract_size ? `${Math.round(car.contract_size / 1024)} KB` : ""}
            </span>
          </div>
        </div>

        <div className="text-[14px]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="label !mb-0">{t("KI-Vorprüfung", "AI pre-check")}</span>
            <button
              className="btn text-[12px]"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await api<{ ai_check: ReviewCar["ai_check"] }>(`/api/pruefung/${car.id}/ki`, { method: "POST" }).catch(() => null);
                if (r) setAi(r.ai_check);
                setBusy(false);
              }}
            >
              {t("Erneut prüfen", "Check again")}
            </button>
          </div>
          {!ai && <p className="text-muted">{t("Noch keine Vorprüfung.", "No pre-check yet.")}</p>}
          {ai?.error && <p className="text-down">{ai.error}</p>}
          {ai?.verdict && (
            <div className="space-y-2">
              <Pill tone={VERDICT[ai.verdict].tone}>{t(VERDICT[ai.verdict].de, VERDICT[ai.verdict].en)}</Pill>
              <p>{ai.summary}</p>
              {!!ai.mismatches?.length && (
                <ul className="list-disc pl-5 text-down">
                  {ai.mismatches.map((m, i) => (
                    <li key={i}>
                      {m.field}: {t("angegeben", "entered")} {m.entered}, {t("Vertrag", "contract")} {m.contract}
                      {m.comment && <span className="text-muted"> – {m.comment}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {!!ai.concerns?.length && (
                <ul className="list-disc pl-5 text-[13px] text-muted">
                  {ai.concerns.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              {ai.extracted && (
                <details className="text-[13px]">
                  <summary className="cursor-pointer text-muted">{t("Aus dem Vertrag gelesen", "Read from the contract")}</summary>
                  {Object.entries(ai.extracted).map(([k, x]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <span className="text-muted">{k}</span>
                      <span>{x == null ? "–" : String(x)}</span>
                    </div>
                  ))}
                </details>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="label">{t("Variante korrigieren", "Correct variant")}</label>
              <select className="input" value={fix.variant_id} onChange={(e) => setFix({ ...fix, variant_id: e.target.value })}>
                {variants.map((x) => (
                  <option key={x.id} value={x.id}>
                    {variantTitle(x)}
                  </option>
                ))}
              </select>
            </div>
            {(
              [
                ["price", t("Preis laut Vertrag", "Price per contract")],
                ["sale_date", t("Datum (JJJJ-MM-TT)", "Date (YYYY-MM-DD)")],
                ["km", "km"],
                ["build_year", t("Baujahr", "Build year")],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label className="label">{label}</label>
                <input className="input" placeholder={t("unverändert", "unchanged")} value={fix[k]} onChange={(e) => setFix({ ...fix, [k]: e.target.value })} />
              </div>
            ))}
            <div className="col-span-2">
              <label className="label">{t("Hinweis an den Nutzer (bei Ablehnung Pflicht)", "Note to the user (required when rejecting)")}</label>
              <textarea className="input min-h-14" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn btn-gold" disabled={busy} onClick={() => decide("approve")}>
              {t("Freigeben", "Approve")}
            </button>
            <button className="btn" disabled={busy} onClick={() => decide("reject")}>
              {t("Ablehnen", "Reject")}
            </button>
            {msg && <span className="text-[13px] text-down">{msg}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}
