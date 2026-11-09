import { useEffect, useMemo, useState } from "react";
import { brands, variantById, variantName, variantShortTitle, variantTitle, variants } from "../data/db";
import { t } from "../i18n";
import { getMetrics } from "../data/market";
import { useStore } from "../state/store";
import { fetchCopilotStatus, type CopilotStatus } from "../lib/copilot";
import { Copilot } from "../components/Copilot";
import { Card, Pill } from "../components/ui";

function promptGroups(name: string, sibling: string | undefined) {
  return [
    {
      title: t("Bewertung", "Valuation"),
      prompts: [
        t(`Preis-Ausblick für den ${name} (3–5 Jahre)`, `Price outlook for the ${name} (3–5 years)`),
        t(`Ist der ${name} aktuell fair bewertet?`, `Is the ${name} fairly valued right now?`),
        t(`Welche Ausstattung treibt den Wert beim ${name}?`, `Which options drive the value of the ${name}?`),
      ],
    },
    {
      title: t("Vergleich", "Comparison"),
      prompts: [
        sibling
          ? t(`Varianten vergleichen (${name} vs. ${sibling})`, `Compare variants (${name} vs. ${sibling})`)
          : t(`${name} mit ähnlichen Fahrzeugen vergleichen`, `Compare the ${name} with similar cars`),
        t(`Kaufrisiko analysieren (konkretes Angebot ${name})`, `Analyse purchase risk (specific listing ${name})`),
      ],
    },
    {
      title: "Portfolio",
      prompts: [t("Wie ist mein Portfolio aufgestellt?", "How is my portfolio positioned?"), t("Wo liegen Klumpenrisiken in meinem Portfolio?", "Where are the concentration risks in my portfolio?")],
    },
    {
      title: t("Markt", "Market"),
      prompts: [t("Auktionstrends der letzten 12 Monate zusammenfassen", "Summarise auction trends of the last 12 months"), t("Welche Varianten haben das stärkste Momentum?", "Which variants have the strongest momentum?")],
    },
  ];
}

export default function AiPage() {
  const { lastVariantId } = useStore();
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
  const sibling = useMemo(
    () =>
      variants
        .filter((o) => o.generationId === v.generationId && o.id !== v.id)
        .sort((a, b) => getMetrics(b.id).value - getMetrics(a.id).value)[0],
    [v],
  );
  const groups = promptGroups(variantShortTitle(v), sibling && variantName(sibling));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[44px] leading-tight sm:text-[52px]">Co-Pilot</h1>
        <p className="mt-1 text-[14px] text-muted">{t("Frag nach Bewertung, Vergleich, Kaufrisiko oder deinem Portfolio. Die Antworten beruhen auf unseren Marktdaten.", "Ask about valuation, comparisons, purchase risk or your portfolio. Answers are based on our market data.")}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="panel flex min-h-[520px] flex-col p-5" style={{ height: "calc(100vh - 220px)" }}>
          <Copilot mode="full" focusVariantId={v.id} prompt={prompt} />
        </section>

        <div className="space-y-4">
          <Card title={t("Fokus-Fahrzeug", "Focus car")}>
            <select className="input" value={v.id} onChange={(e) => setFocus(e.target.value)} aria-label={t("Fokus-Fahrzeug", "Focus car")}>
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
            <p className="mt-2 text-xs text-muted">{t("Der Co-Pilot bezieht Fragen ohne konkrete Fahrzeugnennung auf dieses Fahrzeug.", "Questions that don’t name a specific car refer to this one.")}</p>
          </Card>

          <Card title={t("Modus", "Mode")}>
            {status === null ? (
              <p className="text-xs text-muted">{t("Prüfe Verbindung …", "Checking connection …")}</p>
            ) : status.ai ? (
              <p className="text-xs leading-relaxed text-muted">
                <Pill tone="gold" className="mr-1">Claude</Pill>
                {t(
                  <>
                    Antworten kommen von <span className="text-ink">{status.model}</span> über den MOTRKT-Server; die Marktdaten werden als Kontext mitgeschickt. Ist die API nicht erreichbar, springt automatisch der lokale Modus ein.
                  </>,
                  <>
                    Answers come from <span className="text-ink">{status.model}</span> via the MOTRKT server; the market data is sent along as context. If the API can’t be reached, local mode takes over automatically.
                  </>,
                )}
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-muted">
                <Pill className="mr-1">{t("Lokaler Modus", "Local mode")}</Pill>
                {t(
                  <>
                    Antworten werden direkt aus den Marktdaten berechnet – ohne Sprachmodell. Für freie Fragen mit Claude Opus 5.5 vor dem Start
                    <code className="mx-1 rounded bg-panel-3 px-1 text-ink">ANTHROPIC_API_KEY</code>
                    setzen und <code className="rounded bg-panel-3 px-1 text-ink">npm run dev</code> neu starten.
                  </>,
                  <>
                    Answers are calculated directly from the market data – without a language model. For free-form questions with Claude Opus 5.5, set
                    <code className="mx-1 rounded bg-panel-3 px-1 text-ink">ANTHROPIC_API_KEY</code>
                    before starting and restart <code className="rounded bg-panel-3 px-1 text-ink">npm run dev</code>.
                  </>,
                )}
              </p>
            )}
          </Card>

          <Card title={t("Vorschläge", "Suggestions")}>
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.title}>
                  <div className="mb-1.5 text-[13px] text-muted">{g.title}</div>
                  <div className="flex flex-col gap-1">
                    {g.prompts.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPrompt({ text: p, nonce: Date.now() })}
                        className="border-b border-line py-1.5 text-left text-[13.5px] text-ink/90 transition-colors hover:text-gold"
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
