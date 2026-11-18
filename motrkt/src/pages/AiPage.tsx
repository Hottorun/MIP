import { useMemo, useState } from "react";
import { brands, variantById, variantName, variantShortTitle, variantTitle, variants } from "../data/db";
import { t } from "../i18n";
import { getMetrics } from "../data/market";
import { useStore } from "../state/store";
import { Copilot } from "../components/Copilot";
import { Card } from "../components/ui";
import { Lock as LockIcon, SendHorizontal, Sparkles } from "lucide-react";
import { usePlan } from "../lib/plan";
import { LockedBody } from "../components/premium/Locked";
import { PremiumBanner } from "../components/premium/Upgrade";

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
      prompts: [t("Auktionstrends der letzten 12 Monate zusammenfassen", "Summarise auction trends of the last 12 months"), t("Welche Varianten legen zuletzt am stärksten zu?", "Which variants have the strongest momentum?")],
    },
  ];
}

export default function AiPage() {
  const { lastVariantId } = useStore();
  const [focus, setFocus] = useState(lastVariantId);
  const [prompt, setPrompt] = useState<{ text: string; nonce: number }>();

  const v = variantById.get(focus) ?? variantById.get(lastVariantId)!;
  const sibling = useMemo(
    () =>
      variants
        .filter((o) => o.generationId === v.generationId && o.id !== v.id)
        .sort((a, b) => getMetrics(b.id).value - getMetrics(a.id).value)[0],
    [v],
  );
  const groups = promptGroups(variantShortTitle(v), sibling && variantName(sibling));
  const { premium } = usePlan();
  if (!premium) return <CopilotPreview groups={groups} />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[44px] leading-tight sm:text-[52px]">Co-Pilot</h1>
        <p className="mt-1 text-[14px] text-muted">{t("Fragen Sie nach Bewertung, Vergleich, Kaufrisiko oder Ihrem Portfolio. Die Antworten beruhen auf unseren Marktdaten.", "Ask about valuation, comparisons, purchase risk or your portfolio. Answers are based on our market data.")}</p>
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

/**
 * The page of a lite user (src/lib/plan.tsx; the endpoint is locked on the server too): the questions are real and
 * about the car the user looked at last, the answer is a stand-in of grey lines. Every question opens the upgrade dialog.
 */
function CopilotPreview({ groups }: { groups: ReturnType<typeof promptGroups> }) {
  const { openUpgrade } = usePlan();
  const ask = () => openUpgrade("copilot");
  const lines = [96, 88, 92, 61, 0, 90, 84, 95, 72, 0, 93, 80, 47];
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[44px] leading-tight sm:text-[52px]">Co-Pilot</h1>
        <p className="mt-1 text-[14px] text-muted">{t("Fragen Sie nach Bewertung, Vergleich, Kaufrisiko oder Ihrem Portfolio. Die Antworten beruhen auf unseren Marktdaten.", "Ask about valuation, comparisons, purchase risk or your portfolio. Answers are based on our market data.")}</p>
      </div>
      <PremiumBanner reason="copilot" title={t("Ein Analyst, der jede unserer Zahlen kennt", "An analyst who knows every one of our figures")}>
        {t(
          "Der Co-Pilot antwortet mit den Marktwerten, Verkäufen und Angeboten aus unserer Datenbank und kennt Ihr Portfolio.",
          "The Co-Pilot answers with the market values, sales and listings in our database and knows your portfolio.",
        )}
      </PremiumBanner>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="panel flex flex-col p-5">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-xl rounded-br-sm bg-gold/15 px-3 py-1.5 text-[13.5px] text-ink">{groups[0].prompts[1]}</div>
          </div>
          <LockedBody reason="copilot" height={300} className="mt-3">
            <div className="rounded-xl rounded-bl-sm border border-line bg-panel-2 px-4 py-4">
              <div className="space-y-2.5">
                {lines.map((w, i) => (w ? <div key={i} className="h-3 rounded-full bg-ink/25" style={{ width: `${w}%` }} /> : <div key={i} className="h-2" />))}
              </div>
            </div>
          </LockedBody>
          <button
            type="button"
            onClick={ask}
            className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-left text-sm text-faint transition-colors hover:border-gold/60"
          >
            <Sparkles className="size-3.5 shrink-0 text-gold" aria-hidden />
            <span className="min-w-0 flex-1">{t("Frage an den AI Co-Pilot …", "Ask the AI Co-Pilot …")}</span>
            <LockIcon className="size-3.5 text-gold" aria-hidden />
            <SendHorizontal className="size-4" aria-hidden />
          </button>
        </section>

        <Card title={t("Was Sie fragen können", "What you can ask")}>
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.title}>
                <div className="mb-1.5 text-[13px] text-muted">{g.title}</div>
                <div className="flex flex-col gap-1">
                  {g.prompts.map((p) => (
                    <button key={p} onClick={ask} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-left text-[13.5px] text-ink/90 transition-colors hover:text-gold">
                      {p}
                      <LockIcon className="size-3 shrink-0 translate-y-px text-faint" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
