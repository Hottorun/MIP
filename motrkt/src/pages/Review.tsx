import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { variantById, variantTitle, variants } from "../data/db";
import { getMetrics } from "../data/market";
import { date, eur, num } from "../lib/format";
import { isEn, t } from "../i18n";
import { Card, Pill } from "../components/ui";
import { COUNTERPARTY, STATUS_LABEL, STATUS_TONE, api, useMe, type ReviewCar } from "../lib/userCars";

/** Amounts as typed: "350.000" / "350000,50" in German, "350,000" / "350000.50" in English. */
const parseNum = (s: string) => Number(isEn() ? s.replace(/[,\s]/g, "") : s.replace(/\./g, "").replace(/\s/g, "").replace(",", "."));

const DECIDE_ERR: Record<string, () => string> = {
  price: () => t("Preis: bitte eine Zahl zwischen 500 und 100 Mio. eingeben.", "Price: please enter a number between 500 and 100 million."),
  km: () => t("Kilometer: bitte eine Zahl zwischen 0 und 2 Mio. eingeben.", "Mileage: please enter a number between 0 and 2 million."),
  build_year: () => t("Baujahr: bitte ein Jahr ab 1948 eingeben.", "Build year: please enter a year from 1948."),
  sale_date: () => t("Datum: bitte als JJJJ-MM-TT eingeben, nicht in der Zukunft.", "Date: please enter as YYYY-MM-DD, not in the future."),
  decided: () => t("Diese Meldung wurde inzwischen entschieden oder gelöscht.", "This report has been decided or deleted in the meantime."),
  "Not found": () => t("Diese Meldung gibt es nicht mehr (vom Nutzer gelöscht).", "This report no longer exists (deleted by the user)."),
};

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
            "Angaben mit dem Kaufvertrag vergleichen. Freigeben übernimmt das Fahrzeug in die nächste Marktwert-Berechnung (nachts) und schaltet dem Nutzer Premium frei. Beide Entscheidungen löschen den Vertrag. Jedes Öffnen eines Vertrags wird mit Ihrem Namen protokolliert; Verträge bitte nicht speichern, drucken oder weitergeben.",
            "Compare the entries with the contract. Approving adds the car to the next market value run (nightly) and gives the user premium. Both decisions delete the contract. Every time a contract is opened it is logged with your name; please do not save, print or pass on contracts.",
          )}
        </p>
      </div>
      {error === "load" && <p className="text-down">{t("Konnte nicht geladen werden.", "Could not be loaded.")}</p>}
      {!data && !error && <p className="text-faint">{t("Wird geladen …", "Loading …")}</p>}
      {data && !data.open.length && <p className="text-muted">{t("Keine offenen Meldungen.", "No open reports.")}</p>}
      {data?.open.map((c) => <ReviewItem key={c.id} car={c} onDone={load} />)}
      {data && <ReportedPosts />}
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

type Reported = { id: string; topic: string; variant: string; title: string; username: string; body: string; createdAt: string; reports: number; reasons: string[] };

/** Forum posts other users reported (server/forum.ts /api/forum/meldungen): open the topic, or hide the post here. */
function ReportedPosts() {
  const [posts, setPosts] = useState<Reported[] | null>(null);
  const load = () =>
    api<{ posts: Reported[] }>("/api/forum/meldungen")
      .then((j) => setPosts(j.posts))
      .catch(() => setPosts([]));
  useEffect(() => {
    load();
  }, []);
  if (!posts?.length) return null;
  return (
    <Card title={t("Gemeldete Forumsbeiträge", "Reported forum posts")} sub={t(`${posts.length} offen`, `${posts.length} open`)}>
      <ul className="divide-y divide-line text-[14px]">
        {posts.map((p) => (
          <li key={p.id} className="space-y-1 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link to={`/markt/${p.variant}?thema=${p.topic}#forum`} className="font-serif text-[16px] hover:underline">
                {p.title}
              </Link>
              <span className="text-[12.5px] text-muted">
                {p.username} · {date(new Date(p.createdAt).getTime())} · {p.reports === 1 ? t("1 Meldung", "1 report") : t(`${p.reports} Meldungen`, `${p.reports} reports`)}
              </span>
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap text-muted">{p.body}</p>
            {p.reasons.length > 0 && <p className="text-[12.5px] text-faint">{t("Begründung", "Reason")}: {p.reasons.join(" · ")}</p>}
            <button
              className="text-[12.5px] text-faint hover:text-down"
              onClick={async () => {
                await api(`/api/forum/beitrag/${p.id}/ausblenden`, { method: "POST" }).catch(() => {});
                load();
              }}
            >
              {t("Beitrag ausblenden", "Hide post")}
            </button>
          </li>
        ))}
      </ul>
    </Card>
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
  const [variantQuery, setVariantQuery] = useState("");
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
    const corrections: Record<string, string | number> = {};
    if (fix.variant_id !== car.variant_id) corrections.variant_id = fix.variant_id;
    // numbers as the reviewer's language writes them: "350.000" sent as it is would reach the server as 350
    for (const k of ["price", "km", "build_year"] as const) {
      if (!fix[k].trim()) continue;
      const n = parseNum(fix[k]);
      if (!Number.isFinite(n)) return setMsg(DECIDE_ERR[k]());
      corrections[k] = n;
    }
    if (fix.sale_date.trim()) corrections.sale_date = fix.sale_date.trim();
    setMsg("");
    setBusy(true);
    try {
      await api(`/api/pruefung/${car.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim(), corrections }),
      });
      onDone();
    } catch (e) {
      const code = (e as Error).message;
      setMsg(DECIDE_ERR[code]?.() ?? t("Fehler: ", "Error: ") + code);
      setBusy(false);
      if (code === "decided" || code === "Not found") onDone();
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
            {car.ai_consent && (
              <button
                className="btn text-[12px]"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await api<{ ai_check: ReviewCar["ai_check"] }>(`/api/pruefung/${car.id}/ki`, { method: "POST" }).catch(() => null);
                  if (r) setAi(r.ai_check);
                  else setMsg(t("Die KI-Vorprüfung konnte nicht gestartet werden.", "The AI pre-check could not be started."));
                  setBusy(false);
                }}
              >
                {t("Erneut prüfen", "Check again")}
              </button>
            )}
          </div>
          {!car.ai_consent && (
            <p className="text-muted">
              {t("Der Nutzer hat die KI-Vorprüfung nicht erlaubt: bitte von Hand mit dem Vertrag vergleichen.", "The user did not allow the AI pre-check: please compare with the contract by hand.")}
            </p>
          )}
          {car.ai_consent && !ai && <p className="text-muted">{t("Noch keine Vorprüfung.", "No pre-check yet.")}</p>}
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
              <input
                className="input mb-1"
                placeholder={t("Varianten filtern, z. B. 993 Turbo", "Filter variants, e.g. 993 Turbo")}
                value={variantQuery}
                onChange={(e) => setVariantQuery(e.target.value)}
                aria-label={t("Varianten filtern", "Filter variants")}
              />
              <select className="input" value={fix.variant_id} onChange={(e) => setFix({ ...fix, variant_id: e.target.value })}>
                {variants
                  .filter((x) => x.id === fix.variant_id || variantQuery.trim().toLowerCase().split(/\s+/).every((w) => variantTitle(x).toLowerCase().includes(w)))
                  .map((x) => (
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
