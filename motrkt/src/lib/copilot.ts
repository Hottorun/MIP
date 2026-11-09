import { brands, generationById, variantById, variantShortTitle, variantTitle, variants, yearsLabel } from "../data/db";
import { AS_OF, getListings, getSales } from "../data/generate";
import { brandIndex, changeOver, getMetrics, holdingValue, inflationFactor, topMovers } from "../data/market";
import type { Holding } from "../data/types";
import { date, eur, km, num, pct } from "./format";

/** AI Co-Pilot client: streams answers from the server (Claude) and falls back to a local, data-driven analyst. */

export type CopilotTurn = { role: "user" | "assistant"; content: string };
export type CopilotStatus = { ai: boolean; model?: string };

export async function fetchCopilotStatus(): Promise<CopilotStatus> {
  try {
    const res = await fetch("/api/copilot/status");
    if (!res.ok) return { ai: false };
    return (await res.json()) as CopilotStatus;
  } catch {
    return { ai: false };
  }
}

class FallbackError extends Error {}

async function streamFromServer(turns: CopilotTurn[], context: string, onDelta: (t: string) => void, signal: AbortSignal) {
  let res: Response;
  try {
    res = await fetch("/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: turns, context }),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new FallbackError("offline");
  }
  if (!res.ok || !res.body) {
    let fallback = true;
    try {
      fallback = Boolean((await res.json()).fallback ?? true);
    } catch {
      /* non-JSON error */
    }
    if (fallback) throw new FallbackError(String(res.status));
    throw new Error(`Co-Pilot nicht erreichbar (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onDelta(decoder.decode(value, { stream: true }));
  }
}

async function streamLocal(text: string, onDelta: (t: string) => void, signal: AbortSignal) {
  const parts = text.match(/\S+\s*/g) ?? [text];
  for (let i = 0; i < parts.length; i += 3) {
    if (signal.aborted) return;
    onDelta(parts.slice(i, i + 3).join(""));
    await new Promise((r) => setTimeout(r, 18));
  }
}

export async function askCopilot(opts: {
  turns: CopilotTurn[];
  focusVariantId?: string;
  portfolio: Holding[];
  watchlist: string[];
  onDelta: (text: string) => void;
  signal: AbortSignal;
  preferLocal?: boolean;
}): Promise<"claude" | "local"> {
  const { turns, focusVariantId, portfolio, watchlist, onDelta, signal } = opts;
  if (!opts.preferLocal) {
    try {
      await streamFromServer(turns, buildContext(focusVariantId, portfolio, watchlist), onDelta, signal);
      return "claude";
    } catch (e) {
      if (!(e instanceof FallbackError)) throw e;
    }
  }
  const question = turns[turns.length - 1]?.content ?? "";
  await streamLocal(localAnswer(question, focusVariantId, portfolio), onDelta, signal);
  return "local";
}

// ---------------------------------------------------------------------------------------------
// Context for the LLM

function variantLine(id: string) {
  const v = variantById.get(id)!;
  const m = getMetrics(id);
  return `- ${variantTitle(v)} (${yearsLabel(v.years)}, ${num(v.production)} Stk.): Marktwert ${eur(m.value)}, 12M ${pct(m.change12m)}, CAGR 5J ${pct(m.cagr5)}, Vol. ${pct(m.vol1y, { signed: false })}, Rarity ${m.rarityScore}/100, Liquidität ${m.liquidity}/100, Momentum ${m.momentum}, Einschätzung ${m.recommendation.label}`;
}

export function buildContext(focusVariantId: string | undefined, portfolio: Holding[], watchlist: string[]): string {
  const lines: string[] = [`Datenstand: ${date(AS_OF)}. Alle Werte in EUR. Quelle: MOTRKT-Marktdatenbank (aggregierte Auktions-, Händler- und Privatverkäufe).`];
  const focus = focusVariantId ? variantById.get(focusVariantId) : undefined;
  if (focus) {
    const m = getMetrics(focus.id);
    const sales = getSales(focus.id);
    const listings = getListings(focus.id);
    const asks = listings.map((l) => l.price).sort((a, b) => a - b);
    lines.push(
      "",
      `## Aktuell geöffnete Variante: ${variantTitle(focus)}`,
      `Bauzeit ${yearsLabel(focus.years)}, Produktion ${num(focus.production)} Stück, ${focus.hp} PS, ${focus.liters.toFixed(1).replace(".", ",")} l, ${focus.drive}, ${focus.transmission}`,
      `Neupreis ca. ${eur(focus.newPrice)} (${focus.newPriceYear}), inflationsbereinigt ca. ${eur(focus.newPrice * inflationFactor(focus.newPriceYear))}`,
      `Marktwert (Median) ${eur(m.value)}; Veränderung 1M ${pct(m.change1m)}, 3M ${pct(m.change3m)}, 6M ${pct(m.change6m)}, 12M ${pct(m.change12m)}; CAGR 5J ${pct(m.cagr5)}; Volatilität 1J ${pct(m.vol1y, { signed: false })}; max. Drawdown 5J ${pct(m.maxDD5)}`,
      `Rarity Score ${m.rarityScore}/100 (Perzentil ${m.rarityPercentile} %), Liquidität ${m.liquidity}/100, Momentum ${m.momentum}, MOTRKT-Einschätzung: ${m.recommendation.label}`,
      `Letzte 12 Monate: ${m.sales12m} Transaktionen, Ø Verkaufspreis ${eur(m.avgPrice12m)}, Median-Laufleistung ${km(m.medianMileage)}, Ø Zustandsnote ${num(m.avgCondition, 1)}, Auktionsanteil ${pct(m.auctionShare, { signed: false, digits: 0 })}, Verkaufsquote ${pct(m.sellThrough, { signed: false, digits: 0 })}, Ø Zuschlag vs. Schätzung ${pct(m.premiumVsEstimate)}`,
      `Optionen/Wertfaktoren: ${focus.options.map((o) => `${o.name}${o.standard ? "" : ` (${pct(o.impact)})`}`).join("; ")}`,
      `Typische Schwachstellen: ${focus.weaknesses.join("; ")}`,
      `Erstauslieferung: ${focus.markets.map((x) => `${x.country} ${num(x.share, 1)} %`).join(", ")}`,
      `Letzte Transaktionen:`,
      ...sales.slice(0, 10).map(
        (s) =>
          `  - ${date(s.date)} ${s.source} ${s.house} (${s.id}): ${s.price ? eur(s.price) : "nicht verkauft"}${s.estimateLow ? ` [Schätzung ${eur(s.estimateLow)}–${eur(s.estimateHigh)}]` : ""}, Zustand ${s.condition}, ${km(s.mileage)}, ${s.color}, ${s.body}/${s.gearbox}, Käufer ${s.buyerCountry}, vs. Marktwert ${pct(s.trend)}`,
      ),
      `Aktive Inserate: ${listings.length}${asks.length ? `, Angebotspreise ${eur(asks[0])} bis ${eur(asks[asks.length - 1])}, Median ${eur(asks[Math.floor(asks.length / 2)])}` : ""}`,
      ...listings.slice(0, 8).map((l) => `  - ${l.id}: ${l.year}, ${km(l.mileage)}, Zustand ${l.condition}, ${l.color}, ${eur(l.price)}, ${l.sellerType} ${l.seller} (${l.city}), Matching Numbers: ${l.matchingNumbers ? "ja" : "nein"}, Historie: ${l.serviceHistory ? "lückenlos" : "unvollständig"}`),
      "",
      `## Weitere Varianten desselben Modells`,
      ...variants.filter((o) => o.modelId === focus.modelId && o.id !== focus.id).map((o) => variantLine(o.id)),
    );
  }
  if (portfolio.length) {
    const total = portfolio.reduce((s, h) => s + holdingValue(h), 0);
    const cost = portfolio.reduce((s, h) => s + h.purchasePrice, 0);
    lines.push("", `## Portfolio des Nutzers (Gesamtwert ${eur(total)}, Einstand ${eur(cost)}, ${pct(total / cost - 1)})`);
    for (const h of portfolio) {
      const v = variantById.get(h.variantId)!;
      const value = holdingValue(h);
      lines.push(`- ${variantTitle(v)}, Zustand ${h.condition}, ${km(h.mileage)}, gekauft ${date(h.purchaseDate)} für ${eur(h.purchasePrice)}, heute ${eur(value)} (${pct(value / h.purchasePrice - 1)}), Anteil ${pct(value / total, { signed: false })}`);
    }
  }
  if (watchlist.length) {
    lines.push("", "## Watchlist", ...watchlist.filter((id) => variantById.has(id)).map(variantLine));
  }
  const { winners, losers } = topMovers(variants.map((v) => v.id), 5);
  lines.push(
    "",
    "## Gesamtmarkt",
    `Markenindizes 12M: ${brands.map((b) => `${b.name} ${pct(changeOver(brandIndex(b.id), 52))}`).join(", ")}`,
    `Top-Gewinner 12M: ${winners.map((w) => `${variantTitle(variantById.get(w.id)!)} ${pct(w.change)}`).join("; ")}`,
    `Top-Verlierer 12M: ${losers.map((w) => `${variantTitle(variantById.get(w.id)!)} ${pct(w.change)}`).join("; ")}`,
    `Abgedeckte Varianten: ${variants.map((v) => variantTitle(v)).join(", ")}`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Local analyst (no API key needed)

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/.]+/g, " ")
    .trim()} `;

/** Variants mentioned in free text, best match first ("964 RS", "Carrera RS vs. Turbo", "F40"). */
export function findMentionedVariants(text: string, focusVariantId?: string): string[] {
  const q = norm(text);
  const focus = focusVariantId ? variantById.get(focusVariantId) : undefined;
  const scored: [number, string][] = [];
  for (const v of variants) {
    const gen = generationById.get(v.generationId)!;
    const name = norm(v.name).trim();
    const tokens = name.split(" ");
    const shortName = norm(v.name.replace("Carrera ", "")).trim();
    let score = 0;
    if (q.includes(` ${name} `)) score = 10 + name.length;
    else if (shortName !== name && q.includes(` ${shortName} `)) score = 6 + shortName.length;
    else if (tokens.length > 1 && tokens.every((t) => q.includes(` ${t} `))) score = 4 + name.length / 2;
    if (!score) continue;
    if (q.includes(` ${norm(gen.name).trim()} `)) score += 8;
    if (focus && v.modelId === focus.modelId) score += 3;
    if (focus && v.generationId === focus.generationId) score += 3;
    scored.push([score, v.id]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const out: string[] = [];
  for (const [, id] of scored) {
    const v = variantById.get(id)!;
    // keep the best match per variant name (e.g. "Turbo" → prefer the focus generation)
    if (!out.some((o) => variantById.get(o)!.name === v.name)) out.push(id);
  }
  // "Carrera RS vs. Turbo" should not also match the plain "Carrera".
  const words = (id: string) => norm(variantById.get(id)!.name).trim().split(" ");
  return out.filter((id) => !out.some((o) => o !== id && words(o).length > words(id).length && words(id).every((w) => words(o).includes(w))));
}

function forecast(id: string, years: number) {
  const m = getMetrics(id);
  const momentumTilt = Math.max(-0.03, Math.min(0.03, m.momentumScore * 0.1));
  const base = Math.max(-0.04, Math.min(0.12, m.cagr5 * 0.75 + momentumTilt));
  const spread = m.vol1y * Math.sqrt(years) * 0.8;
  const mid = m.value * (1 + base) ** years;
  return { base, low: mid * Math.exp(-spread), mid, high: mid * Math.exp(spread) };
}

export function localAnswer(question: string, focusVariantId: string | undefined, portfolio: Holding[]): string {
  const q = norm(question);
  const mentioned = findMentionedVariants(question, focusVariantId);
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  const focusId = mentioned[0] ?? focusVariantId ?? "porsche-911-964-carrera-rs";
  const v = variantById.get(focusId)!;
  const m = getMetrics(focusId);
  const name = variantShortTitle(v);
  const note = "\n\n_Lokaler Analysemodus: Antwort aus MOTRKT-Daten berechnet, ohne Sprachmodell. Keine Anlageberatung._";

  if (has(" portfolio", " bestand", " sammlung", " meine fahrzeuge")) {
    if (!portfolio.length) return `Dein Portfolio ist noch leer. Lege im Bereich **Portfolio** Fahrzeuge an, dann kann ich Wertentwicklung, Klumpenrisiken und Rebalancing-Ideen auswerten.${note}`;
    const rows = portfolio.map((h) => ({ h, v: variantById.get(h.variantId)!, value: holdingValue(h) }));
    const total = rows.reduce((s, r) => s + r.value, 0);
    const cost = rows.reduce((s, r) => s + r.h.purchasePrice, 0);
    rows.sort((a, b) => b.value / b.h.purchasePrice - a.value / a.h.purchasePrice);
    const biggest = [...rows].sort((a, b) => b.value - a.value)[0];
    const brandsShare = new Map<string, number>();
    for (const r of rows) brandsShare.set(r.v.brandId, (brandsShare.get(r.v.brandId) ?? 0) + r.value);
    const topBrand = [...brandsShare.entries()].sort((a, b) => b[1] - a[1])[0];
    const avg12 = rows.reduce((s, r) => s + getMetrics(r.v.id).change12m * r.value, 0) / total;
    return `**Portfolio-Überblick**
- Gesamtwert ${eur(total)} bei ${eur(cost)} Einstand (${pct(total / cost - 1)})
- Gewichtete Performance 12M: ${pct(avg12)}
- Bester Wert: ${variantShortTitle(rows[0].v)} (${pct(rows[0].value / rows[0].h.purchasePrice - 1)} seit Kauf)
- Schwächster Wert: ${variantShortTitle(rows[rows.length - 1].v)} (${pct(rows[rows.length - 1].value / rows[rows.length - 1].h.purchasePrice - 1)})

**Risiko**
- Größte Position: ${variantShortTitle(biggest.v)} mit ${pct(biggest.value / total, { signed: false })} des Werts
- Markenkonzentration: ${brands.find((b) => b.id === topBrand[0])!.name} ${pct(topBrand[1] / total, { signed: false })}${topBrand[1] / total > 0.6 ? " – deutliches Klumpenrisiko, Beimischung anderer Marken prüfen" : ""}${note}`;
  }

  if (has(" vergleich", " vs ", " versus", " gegenuber", " oder ")) {
    const others = mentioned.length >= 2 ? mentioned.slice(0, 3) : [focusId, ...variants.filter((o) => o.generationId === v.generationId && o.id !== focusId).sort((a, b) => getMetrics(b.id).value - getMetrics(a.id).value).slice(0, 1).map((o) => o.id)];
    const lines = others.map((id) => {
      const x = getMetrics(id);
      const vv = variantById.get(id)!;
      return `**${variantShortTitle(vv)}**\n- Marktwert ${eur(x.value)}, 12M ${pct(x.change12m)}, CAGR 5J ${pct(x.cagr5)}\n- Volatilität ${pct(x.vol1y, { signed: false })}, Rarity ${x.rarityScore}/100, Liquidität ${x.liquidity}/100\n- ${num(vv.production)} Stück, ${vv.hp} PS, Momentum ${x.momentum}, Einschätzung ${x.recommendation.label}`;
    });
    const best = [...others].sort((a, b) => getMetrics(b).recommendation.score - getMetrics(a).recommendation.score)[0];
    return `${lines.join("\n\n")}\n\n**Fazit:** Auf Basis von Rendite, Risiko und Seltenheit liegt aktuell der **${variantShortTitle(variantById.get(best)!)}** vorn.${note}`;
  }

  if (has(" risiko", " risk", " angebot", " inserat", " schwachstell", " prufen", " worauf")) {
    const listings = getListings(focusId);
    const scored = listings
      .map((l) => ({ l, gap: l.price / m.value - 1 }))
      .sort((a, b) => a.gap - b.gap);
    const cheap = scored[0];
    const dear = scored[scored.length - 1];
    return `**Kaufrisiko ${name}**
- Volatilität ${pct(m.vol1y, { signed: false })} p. a., max. Drawdown (5J) ${pct(m.maxDD5)} – mit Wertschwankungen dieser Größenordnung sollte man rechnen
- Liquidität ${m.liquidity}/100, Verkaufsquote bei Auktionen ${pct(m.sellThrough, { signed: false, digits: 0 })}${m.liquidity < 40 ? " – Wiederverkauf kann dauern" : ""}

**Typische Schwachstellen**
${v.weaknesses.map((w) => `- ${w}`).join("\n")}

**Aktuelle Angebote (${listings.length})**${cheap ? `\n- Günstigstes relativ zum Marktwert: ${cheap.l.id}, ${cheap.l.year}, ${km(cheap.l.mileage)}, ${eur(cheap.l.price)} (${pct(cheap.gap)}) – Zustand ${cheap.l.condition}${cheap.l.matchingNumbers ? "" : ", **keine Matching Numbers**"}` : ""}${dear && dear !== cheap ? `\n- Teuerstes: ${dear.l.id}, ${eur(dear.l.price)} (${pct(dear.gap)})` : ""}
- Vor dem Kauf: unabhängige Begutachtung, Lackschichtdicke, Historie und Werkszertifikat prüfen${note}`;
  }

  if (has(" ausblick", " prognose", " zukunft", " entwickeln", " jahre", " outlook", " wertentwicklung")) {
    const f3 = forecast(focusId, 3);
    const f5 = forecast(focusId, 5);
    return `**Preis-Ausblick ${name}** (Basis: ${eur(m.value)})
- 3 Jahre: ${eur(f3.low, { compact: true })} – ${eur(f3.high, { compact: true })}, Basisszenario ${eur(f3.mid, { compact: true })}
- 5 Jahre: ${eur(f5.low, { compact: true })} – ${eur(f5.high, { compact: true })}, Basisszenario ${eur(f5.mid, { compact: true })} (${pct(f5.base)} p. a.)

**Treiber**
- Historische Rendite ${pct(m.cagr5)} p. a. (5J), Momentum ${m.momentum.toLowerCase()} (${pct(m.change3m)} in 3M)
- Rarity ${m.rarityScore}/100 bei ${num(v.production)} Stück

**Risiken**
- Volatilität ${pct(m.vol1y, { signed: false })}; letzter Rückgang bis ${pct(m.maxDD5)}
- Zinsumfeld und Nachfrage der Käufergeneration${note}`;
  }

  if (has(" trend", " auktion", " 12 monat", " zusammenfass", " verkauf", " letzte")) {
    const sales = getSales(focusId).filter((s) => s.date >= AS_OF - 365 * 86_400_000);
    const sold = sales.filter((s) => s.price !== null);
    const top = [...sold].sort((a, b) => b.price! - a.price!)[0];
    return `**Auktionstrends ${name} – letzte 12 Monate**
- ${sales.length} Transaktionen, davon ${pct(m.auctionShare, { signed: false, digits: 0 })} über Auktionen
- Verkaufsquote ${pct(m.sellThrough, { signed: false, digits: 0 })}, Ø Zuschlag vs. Schätzung ${pct(m.premiumVsEstimate)}
- Ø Verkaufspreis ${eur(m.avgPrice12m)}, Marktwert heute ${eur(m.value)} (${pct(m.change12m)} ggü. Vorjahr)${top ? `\n- Höchster Preis: ${eur(top.price)} bei ${top.house} (${date(top.date)}, Zustand ${top.condition}, ${km(top.mileage)})` : ""}
- Momentum: ${m.momentum} – ${m.change3m >= 0 ? "Preise ziehen zuletzt an" : "Preise geben zuletzt nach"} (${pct(m.change3m)} in 3M)${note}`;
  }

  return `**${variantTitle(v)} – Kurzanalyse**
- Marktwert ${eur(m.value)} (${pct(m.change12m)} in 12M), CAGR 5J ${pct(m.cagr5)}
- Rarity ${m.rarityScore}/100, Liquidität ${m.liquidity}/100, Momentum ${m.momentum}
- Einschätzung: **${m.recommendation.label}** – ${m.thesis}

Ich kann außerdem einen **Preis-Ausblick**, einen **Variantenvergleich**, eine **Risikoanalyse** konkreter Angebote oder eine **Zusammenfassung der Auktionen** liefern.${note}`;
}

export function suggestions(focusVariantId: string | undefined): string[] {
  const v = variantById.get(focusVariantId ?? "") ?? variantById.get("porsche-911-964-carrera-rs")!;
  const name = variantShortTitle(v);
  const sibling = variants
    .filter((o) => o.generationId === v.generationId && o.id !== v.id)
    .sort((a, b) => getMetrics(b.id).value - getMetrics(a.id).value)[0];
  return [
    `Preis-Ausblick für den ${name} (3–5 Jahre)`,
    sibling ? `Varianten vergleichen (${v.name} vs. ${sibling.name})` : `${name} mit ähnlichen Fahrzeugen vergleichen`,
    `Kaufrisiko analysieren (konkretes Angebot ${name})`,
    `Auktionstrends der letzten 12 Monate zusammenfassen`,
  ];
}
