import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { locale, t } from "../i18n";
import { cn, num } from "../lib/format";
import { api, useMe } from "../lib/userCars";
import { askingPrice, dayTime, type Admin, type Source, type SourceListing } from "../lib/searchAgent";
import { Card, Empty, Pill, useConfirm } from "../components/ui";

const usd = (v: number) => new Intl.NumberFormat(locale(), { style: "currency", currency: "USD", maximumFractionDigits: v < 10 ? 2 : 0 }).format(v);
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * Reviewers (MIP_ADMINS): the dealer pages and listings the search agent reads once a day (server/searchApi.ts),
 * what it found there, and what its runs cost.
 */
export default function SearchSources() {
  const me = useMe();
  const [data, setData] = useState<Admin | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { confirm, dialog } = useConfirm();

  const load = useCallback(
    () =>
      api<Admin>("/api/suchquellen")
        .then((d) => {
          setData(d);
          setError("");
        })
        .catch((e) => {
          const err = e as { status?: number; body?: { error?: string } };
          setError(err.status === 403 ? "forbidden" : err.body?.error === "migration" ? "migration" : "load");
        }),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  // while a source is queued or being read, ask again every few seconds
  const running = data?.sources.some((s) => s.running) ?? false;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [running, load]);

  if (error === "forbidden" || (me && !me.admin)) return <p className="text-muted">{t("Diese Seite ist nur für Prüfer.", "This page is for reviewers only.")}</p>;

  const act = async (work: () => Promise<unknown>) => {
    setNotice("");
    await work().catch((e) => setNotice((e as { body?: { error?: string } }).body?.error === "ai" ? t("Kein Anthropic-Zugang auf diesem Server.", "No Anthropic access on this server.") : t("Das hat nicht geklappt.", "That did not work.")));
    await load();
  };
  const active = data?.sources.filter((s) => s.active) ?? [];
  const cars = active.reduce((n, s) => n + s.listings, 0);

  return (
    <div className="space-y-6">
      {dialog}
      <div>
        <h1 className="font-display text-heading text-[34px] leading-tight">{t("Suchquellen", "Search sources")}</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-muted">
          {t(
            "Bestandsseiten von Händlern und einzelne Inserate, die der Suchagent einmal täglich liest. Was er dort findet, gleicht er mit den Suchaufträgen der Kunden ab. Eine neue Adresse wird sofort gelesen.",
            "Dealers’ stock pages and single listings the search agent reads once a day. What it finds there is matched against the customers’ search orders. A new address is read right away.",
          )}
        </p>
      </div>
      {error === "migration" && <p className="text-warn">{t("Die Tabellen fehlen noch: npm run db:migrate (Produktion: npm run db:migrate:prod).", "The tables are missing: npm run db:migrate (production: npm run db:migrate:prod).")}</p>}
      {error === "load" && <p className="text-down">{t("Konnte nicht geladen werden.", "Could not be loaded.")}</p>}
      {!data && !error && <p className="text-faint">{t("Wird geladen …", "Loading …")}</p>}
      {data && !data.ai && <p className="text-[14px] text-warn">{t("ANTHROPIC_API_KEY fehlt auf diesem Server: Der Agent kann nichts lesen.", "ANTHROPIC_API_KEY is missing on this server: the agent cannot read anything.")}</p>}
      {data && !data.cron && (
        <p className="text-[14px] text-warn">
          {t(
            "CRON_SECRET ist nicht gesetzt: Der tägliche Lauf startet nicht, und auf Vercel endet ein Lauf nach den ersten vier Quellen. Bis dahin lässt sich jede Quelle hier von Hand lesen.",
            "CRON_SECRET is not set: the daily run does not start, and on Vercel a run ends after the first four sources. Until then each source can be read by hand here.",
          )}
        </p>
      )}

      {data && (
        <>
          <dl className="flex flex-wrap gap-x-10 gap-y-4">
            {[
              [t("Aktive Quellen", "Active sources"), num(active.length)],
              [t("Fahrzeuge im Bestand", "Cars in stock"), num(cars)],
              [t("Aktive Suchaufträge", "Active search orders"), `${num(data.orders.active)}`],
              [t("Kosten, 30 Tage", "Cost, 30 days"), `≈ ${usd(data.usage.usd)}`],
            ].map(([k, v]) => (
              <div key={k}>
                <dd className="font-display text-[28px] leading-none tabular-nums">{v}</dd>
                <dt className="mt-1.5 text-[11px] tracking-[0.12em] text-muted uppercase">{k}</dt>
              </div>
            ))}
          </dl>

          <AddSources onAdded={load} />

          <Card
            title={t("Quellen", "Sources")}
            sub={t(`${data.sources.length} eingetragen`, `${data.sources.length} entered`)}
            actions={
              <button className="btn" disabled={!data.ai || !active.length} onClick={() => act(() => api("/api/suchquellen/lauf", { method: "POST" }))}>
                <RefreshCw className={cn("size-3.5", running && "animate-spin motion-reduce:animate-none")} strokeWidth={1.6} aria-hidden /> {t("Alle jetzt lesen", "Read all now")}
              </button>
            }
          >
            {notice && <p className="mb-3 text-[14px] text-down">{notice}</p>}
            {data.sources.length ? (
              <ul className="divide-y divide-line">
                {data.sources.map((s) => (
                  <SourceRow
                    key={s.id}
                    s={s}
                    ai={data.ai}
                    onRun={() => act(() => api(`/api/suchquellen/${s.id}/lauf`, { method: "POST" }))}
                    onToggle={() => act(() => api(`/api/suchquellen/${s.id}`, json("PUT", { active: !s.active })))}
                    onSave={(patch) => act(() => api(`/api/suchquellen/${s.id}`, json("PUT", patch)))}
                    onDelete={async () => {
                      if (await confirm(t(`„${s.name || s.host}“ mit ${s.listings + s.gone} gelesenen Fahrzeugen löschen? Treffer der Kunden aus dieser Quelle verschwinden.`, `Delete “${s.name || s.host}” and its ${s.listings + s.gone} cars? Customers’ matches from this source disappear.`), { confirmLabel: t("Löschen", "Delete") }))
                        await act(() => api(`/api/suchquellen/${s.id}`, { method: "DELETE" }));
                    }}
                  />
                ))}
              </ul>
            ) : (
              <Empty>{t("Noch keine Quelle. Fügen Sie oben die erste Händleradresse ein.", "No source yet. Paste the first dealer address above.")}</Empty>
            )}
          </Card>

          <Card title={t("Letzte Läufe", "Recent runs")} sub={t(`${num(data.usage.runs)} in 30 Tagen · ${data.model} · ${num(data.usage.tokensIn)} Token gelesen, ${num(data.usage.tokensOut)} geschrieben`, `${num(data.usage.runs)} in 30 days · ${data.model} · ${num(data.usage.tokensIn)} tokens read, ${num(data.usage.tokensOut)} written`)}>
            {data.runs.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[13.5px]">
                  <thead className="text-[11px] tracking-[0.1em] text-muted uppercase">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">{t("Zeit", "Time")}</th>
                      <th className="py-1.5 pr-3 font-medium">{t("Was", "What")}</th>
                      <th className="py-1.5 pr-3 text-right font-medium">{t("Dauer", "Duration")}</th>
                      <th className="py-1.5 pr-3 text-right font-medium">{t("Seiten", "Pages")}</th>
                      <th className="py-1.5 pr-3 text-right font-medium">{t("Ergebnis", "Result")}</th>
                      <th className="py-1.5 text-right font-medium">{t("Kosten", "Cost")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.runs.map((r) => (
                      <tr key={r.id}>
                        <td className="py-1.5 pr-3 whitespace-nowrap text-muted tabular-nums">{dayTime(r.startedAt)}</td>
                        <td className="py-1.5 pr-3">
                          <span className="text-faint">{r.kind === "source" ? t("Quelle", "Source") : t("Auftrag", "Order")}</span> {r.label}
                          {!r.ok && <span className="block text-[12.5px] text-down">{r.error}</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{r.seconds} s</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{r.kind === "source" ? r.fetches : "–"}</td>
                        <td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">
                          {r.ok ? (r.kind === "source" ? t(`${r.found} Fahrzeuge`, `${r.found} cars`) : t(`${r.found} Treffer`, `${r.found} matches`)) : t("Fehler", "Failed")}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{r.tokensIn || r.tokensOut ? usd(r.usd) : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>{t("Noch kein Lauf.", "No run yet.")}</Empty>
            )}
            <p className="mt-3 text-[12.5px] text-faint">{t("Kosten geschätzt aus den Token zu Listenpreisen von Anthropic; maßgeblich ist die Abrechnung dort.", "Cost estimated from the tokens at Anthropic’s list prices; the invoice there is what counts.")}</p>
          </Card>
        </>
      )}
    </div>
  );
}

function AddSources({ onAdded }: { onAdded: () => void }) {
  const [urls, setUrls] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: { line: string; reason: "invalid" | "exists" }[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const r = await api<{ added: number; skipped: { line: string; reason: "invalid" | "exists" }[] }>("/api/suchquellen", json("POST", { urls, note }));
      setResult(r);
      if (r.added) setUrls(r.skipped.filter((s) => s.reason === "invalid").map((s) => s.line).join("\n"));
      onAdded();
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };
  return (
    <Card title={t("Händler oder Inserate hinzufügen", "Add dealers or listings")}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="source-urls">{t("Adressen, eine pro Zeile", "Addresses, one per line")}</label>
          <textarea
            id="source-urls"
            className="input min-h-[110px] resize-y font-mono text-[13px]"
            required
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={"https://www.haendler.de/fahrzeuge\nhttps://www.klassik-haus.de/bestand/porsche"}
            spellCheck={false}
          />
          <p className="mt-1 text-[12.5px] text-faint">
            {t(
              "Am besten die Seite, die den ganzen Bestand zeigt (oder nur die Porsche). Der Agent blättert selbst weiter, bleibt aber auf der Website des Händlers. Seiten, die den Bestand erst per JavaScript nachladen, kann er nicht lesen; das steht dann beim Ergebnis.",
              "Ideally the page that shows the whole stock (or the Porsches only). The agent pages through by itself but stays on the dealer’s website. It cannot read pages that load the stock by JavaScript; the result says so.",
            )}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="source-note">{t("Hinweis für den Agenten (optional, gilt für alle Adressen oben)", "Hint for the agent (optional, applies to all addresses above)")}</label>
          <input id="source-note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("z. B. nur Porsche erfassen", "e.g. Porsche only")} />
        </div>
        {failed && <p className="text-[14px] text-down">{t("Das hat nicht geklappt.", "That did not work.")}</p>}
        {result && (
          <p className="text-[14px] text-muted">
            {t(`${result.added} hinzugefügt.`, `${result.added} added.`)}{" "}
            {result.skipped.length > 0 &&
              result.skipped.map((s) => `${s.line} (${s.reason === "exists" ? t("schon eingetragen", "already entered") : t("keine gültige Adresse", "not a valid address")})`).join(" · ")}
          </p>
        )}
        <button className="btn btn-gold" disabled={busy}>
          {busy ? t("Wird hinzugefügt …", "Adding …") : t("Hinzufügen und lesen", "Add and read")}
        </button>
      </form>
    </Card>
  );
}

function SourceRow({ s, ai, onRun, onToggle, onSave, onDelete }: { s: Source; ai: boolean; onRun: () => void; onToggle: () => void; onSave: (patch: { name: string; note: string }) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(s.name);
  const [note, setNote] = useState(s.note);
  const [listings, setListings] = useState<SourceListing[] | null>(null);
  // the list of cars follows the scans while it is open
  useEffect(() => {
    if (!open) return;
    api<{ listings: SourceListing[] }>(`/api/suchquellen/${s.id}/inserate`)
      .then((j) => setListings(j.listings))
      .catch(() => setListings([]));
  }, [open, s.id, s.scannedAt]);
  const icon = "inline-flex items-center gap-1.5 rounded-box px-2 py-1 text-[13px] text-muted transition-colors hover:bg-panel-3 hover:text-ink disabled:opacity-40";
  const status = !s.active ? (
    <Pill>{t("Pausiert", "Paused")}</Pill>
  ) : s.running ? (
    <Pill tone="gold">
      <RefreshCw className="size-3 animate-spin motion-reduce:animate-none" aria-hidden /> {t("Wird gelesen …", "Reading …")}
    </Pill>
  ) : s.scanOk === null ? (
    <Pill>{t("Noch nicht gelesen", "Not read yet")}</Pill>
  ) : s.scanOk ? (
    <Pill tone={s.listings ? "up" : "warn"}>{t(`${s.listings} Fahrzeuge`, `${s.listings} cars`)}</Pill>
  ) : (
    <Pill tone="down">{t("Fehler", "Failed")}</Pill>
  );
  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button className="-ml-1 inline-flex items-center gap-1 font-display text-[17px] hover:text-accent" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? <ChevronDown className="size-4 text-muted" aria-hidden /> : <ChevronRight className="size-4 text-muted" aria-hidden />}
              {s.name || s.host}
            </button>
            {status}
          </div>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 text-[12.5px] text-muted hover:text-accent">
            <span className="truncate">{s.url}</span> <ArrowUpRight className="size-3 shrink-0" aria-hidden />
          </a>
          <div className="mt-1 text-[12.5px] text-faint">
            {s.scannedAt ? t(`Zuletzt gelesen ${dayTime(s.scannedAt)}`, `Last read ${dayTime(s.scannedAt)}`) : t("Wartet auf den ersten Lauf", "Waiting for its first run")}
            {s.gone > 0 && ` · ${t(`${s.gone} nicht mehr im Bestand`, `${s.gone} no longer in stock`)}`}
            {` · ${t("eingetragen von", "entered by")} ${s.createdBy}`}
          </div>
          {s.note && <div className="mt-1 text-[13px] text-muted">{t("Hinweis", "Hint")}: {s.note}</div>}
          {(s.scanError || s.scanNote) && <div className={cn("mt-1 text-[13px]", s.scanOk === false ? "text-down" : "text-muted")}>{t("Agent", "Agent")}: {s.scanOk === false ? s.scanError : s.scanNote}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-0.5">
          <button className={icon} onClick={onRun} disabled={!ai || !s.active || s.running}>
            <RefreshCw className="size-3.5" strokeWidth={1.6} aria-hidden /> {t("Jetzt lesen", "Read now")}
          </button>
          <button className={icon} onClick={() => setEdit((e) => !e)}>
            {t("Bearbeiten", "Edit")}
          </button>
          <button className={icon} onClick={onToggle}>
            {s.active ? <Pause className="size-3.5" strokeWidth={1.6} aria-hidden /> : <Play className="size-3.5" strokeWidth={1.6} aria-hidden />}
            {s.active ? t("Pausieren", "Pause") : t("Aktivieren", "Activate")}
          </button>
          <button className={cn(icon, "hover:text-down")} onClick={onDelete} aria-label={t("Quelle löschen", "Delete source")}>
            <Trash2 className="size-3.5" strokeWidth={1.6} aria-hidden />
          </button>
        </div>
      </div>
      {edit && (
        <form
          className="mt-3 grid gap-3 rounded-box border border-line bg-panel-2 p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ name, note });
            setEdit(false);
          }}
        >
          <div>
            <label className="label" htmlFor={`name-${s.id}`}>{t("Name des Händlers", "Dealer’s name")}</label>
            <input id={`name-${s.id}`} className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={`note-${s.id}`}>{t("Hinweis für den Agenten", "Hint for the agent")}</label>
            <input id={`note-${s.id}`} className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className="btn btn-gold">{t("Speichern", "Save")}</button>
        </form>
      )}
      {open && (
        <div className="mt-3 overflow-x-auto rounded-box border border-line">
          {!listings ? (
            <p className="p-3 text-[13px] text-faint">{t("Wird geladen …", "Loading …")}</p>
          ) : !listings.length ? (
            <p className="p-3 text-[13px] text-muted">{t("Aus dieser Quelle ist noch kein Fahrzeug gelesen.", "No car has been read from this source yet.")}</p>
          ) : (
            <table className="w-full min-w-[620px] text-left text-[13px]">
              <thead className="text-[11px] tracking-[0.1em] text-muted uppercase">
                <tr>
                  <th className="px-3 py-1.5 font-medium">{t("Fahrzeug", "Car")}</th>
                  <th className="px-3 py-1.5 text-right font-medium">{t("Baujahr", "Year")}</th>
                  <th className="px-3 py-1.5 text-right font-medium">km</th>
                  <th className="px-3 py-1.5 text-right font-medium">{t("Preis", "Price")}</th>
                  <th className="px-3 py-1.5 text-right font-medium">{t("Erstmals gesehen", "First seen")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {listings.map((l) => (
                  <tr key={l.id} className={cn(l.goneAt && "text-faint")}>
                    <td className="px-3 py-1.5">
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline" title={l.details}>
                        {l.title}
                      </a>
                      {l.goneAt && <span className="ml-2 text-[12px]">{t(`weg seit ${dayTime(l.goneAt)}`, `gone since ${dayTime(l.goneAt)}`)}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.year ?? "–"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.km !== null ? num(l.km) : "–"}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                      {askingPrice(l.price, l.currency)}
                      {l.pricePrev !== null && l.price !== null && l.pricePrev !== l.price && <span className="ml-1.5 text-[12px] text-faint line-through">{askingPrice(l.pricePrev, l.currency)}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">{dayTime(l.firstSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}
