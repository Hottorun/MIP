import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Cpu, Eye, Sparkles } from "lucide-react";
import { brands, variantById, variantShortTitle, variantTitle, variants, yearsLabel } from "../data/db";
import { getMetrics } from "../data/market";
import { useStore } from "../state/store";
import { fetchCopilotStatus, type CopilotStatus } from "../lib/copilot";
import { eur, km, num, pct } from "../lib/format";
import { Copilot } from "../components/Copilot";
import { BrandEmblem, Card, Delta, Pill } from "../components/ui";

function promptGroups(name: string, sibling: string | undefined) {
  return [
    {
      title: "Bewertung",
      prompts: [`Preis-Ausblick für den ${name} (3–5 Jahre)`, `Ist der ${name} aktuell fair bewertet?`, `Welche Ausstattung treibt den Wert beim ${name}?`],
    },
    {
      title: "Vergleich",
      prompts: [sibling ? `Varianten vergleichen (${name} vs. ${sibling})` : `${name} mit ähnlichen Fahrzeugen vergleichen`, `Kaufrisiko analysieren (konkretes Angebot ${name})`],
    },
    {
      title: "Portfolio",
      prompts: ["Wie ist mein Portfolio aufgestellt?", "Wo liegen Klumpenrisiken in meinem Portfolio?"],
    },
    {
      title: "Markt",
      prompts: ["Auktionstrends der letzten 12 Monate zusammenfassen", "Welche Varianten haben das stärkste Momentum?"],
    },
  ];
}

export default function AiPage() {
  const { lastVariantId, portfolio, watchlist } = useStore();
  const [focus, setFocus] = useState(lastVariantId);
  const [prompt, setPrompt] = useState<{ text: string; nonce: number }>();
  const [status, setStatus] = useState<CopilotStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCopilotStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  const v = variantById.get(focus) ?? variantById.get(lastVariantId)!;
  const m = getMetrics(v.id);
  const sibling = useMemo(
    () =>
      variants
        .filter((o) => o.generationId === v.generationId && o.id !== v.id)
        .sort((a, b) => getMetrics(b.id).value - getMetrics(a.id).value)[0],
    [v],
  );
  const groups = promptGroups(variantShortTitle(v), sibling?.name);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 font-serif text-3xl tracking-tight">
          AI Co-Pilot <Sparkles className="size-5 text-gold" /> <Pill tone="gold">Beta</Pill>
        </h1>
        <p className="text-sm text-muted">Fragen zu Bewertung, Vergleich, Risiko und Portfolio – beantwortet auf Basis der MOTRKT-Marktdaten.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel flex min-h-[520px] flex-col p-4" style={{ height: "calc(100vh - 170px)" }}>
          <Copilot mode="full" focusVariantId={v.id} prompt={prompt} />
        </section>

        <div className="space-y-4">
          <Card title="Fokus-Fahrzeug">
            <select className="input" value={v.id} onChange={(e) => setFocus(e.target.value)} aria-label="Fokus-Fahrzeug">
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
            <p className="mt-2 text-xs text-muted">Der Co-Pilot bezieht Fragen ohne konkrete Fahrzeugnennung auf dieses Fahrzeug.</p>
          </Card>

          <Card title={<span className="inline-flex items-center gap-1.5"><Eye className="size-4 text-gold" /> Was der Co-Pilot sieht</span>}>
            <div className="mb-2 flex items-center gap-2">
              <BrandEmblem brandId={v.brandId} />
              <Link to={`/markt/${v.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-gold-2">
                {variantTitle(v)}
              </Link>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted">Marktwert</dt>
              <dd className="text-right tabular-nums">{eur(m.value)}</dd>
              <dt className="text-muted">12M</dt>
              <dd className="text-right"><Delta value={m.change12m} /></dd>
              <dt className="text-muted">CAGR 5J</dt>
              <dd className="text-right tabular-nums">{pct(m.cagr5)}</dd>
              <dt className="text-muted">Volatilität</dt>
              <dd className="text-right tabular-nums">{pct(m.vol1y, { signed: false })}</dd>
              <dt className="text-muted">Rarity / Liquidität</dt>
              <dd className="text-right tabular-nums">{m.rarityScore} / {m.liquidity}</dd>
              <dt className="text-muted">Transaktionen 12M</dt>
              <dd className="text-right tabular-nums">{num(m.sales12m)}</dd>
              <dt className="text-muted">Median-Laufleistung</dt>
              <dd className="text-right tabular-nums">{km(m.medianMileage)}</dd>
              <dt className="text-muted">Bauzeit</dt>
              <dd className="text-right">{yearsLabel(v.years)}</dd>
            </dl>
            <div className="mt-3 border-t border-line pt-2 text-xs text-muted">
              Außerdem im Kontext: Portfolio ({portfolio.length} Fahrzeuge), Watchlist ({watchlist.length}), Markenindizes und Top-Mover des Gesamtmarkts.
            </div>
          </Card>

          <Card title={<span className="inline-flex items-center gap-1.5"><Cpu className="size-4 text-gold" /> Modus</span>}>
            {status === null ? (
              <p className="text-xs text-muted">Prüfe Verbindung …</p>
            ) : status.ai ? (
              <p className="text-xs leading-relaxed text-muted">
                <Pill tone="gold" className="mr-1">Claude</Pill>
                Antworten kommen von <span className="text-ink">{status.model}</span> über den MOTRKT-Server; die Marktdaten werden als Kontext mitgeschickt. Ist die API nicht erreichbar, springt automatisch der lokale Modus ein.
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-muted">
                <Pill className="mr-1">Lokaler Modus</Pill>
                Antworten werden direkt aus den Marktdaten berechnet – ohne Sprachmodell. Für freie Fragen mit Claude Opus 5.5 vor dem Start
                <code className="mx-1 rounded bg-panel-3 px-1 text-ink">ANTHROPIC_API_KEY</code>
                setzen und <code className="rounded bg-panel-3 px-1 text-ink">npm run dev</code> neu starten.
              </p>
            )}
          </Card>

          <Card title="Prompt-Bibliothek">
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.title}>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">{g.title}</div>
                  <div className="flex flex-col gap-1">
                    {g.prompts.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPrompt({ text: p, nonce: Date.now() })}
                        className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-left text-xs text-ink/90 transition-colors hover:border-gold/50 hover:bg-panel-3"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
