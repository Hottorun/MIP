import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

/**
 * AI pre-check of an uploaded document, a purchase contract or an appraisal (Wertgutachten): Claude reads it (PDF or
 * photo) and compares it with what the user entered. The result only helps the reviewer, who decides. Needs Anthropic
 * API access (ANTHROPIC_API_KEY or an `ant auth login` profile); without it the reviewer checks by hand.
 */

const MODEL = "claude-opus-5-5";

type EnteredCar = { title: string; variantName: string; build_year: number; vin: string; km: number; currency: string; country: string };
export type Entered =
  | (EnteredCar & { kind: "kaufvertrag"; role: string; price: number; sale_date: string; counterparty: string })
  | (EnteredCar & { kind: "gutachten"; value: number; value_basis: string; appraisal_date: string; appraiser: string; condition: string | null });

export type ContractCheck = {
  is_vehicle_purchase_contract: boolean;
  legible: boolean;
  extracted: {
    make: string | null;
    model: string | null;
    build_year: number | null;
    first_registration: string | null;
    vin: string | null;
    mileage_km: number | null;
    price: number | null;
    currency: string | null;
    contract_date: string | null;
    seller_type: "privat" | "haendler" | "auktion" | "unbekannt";
    buyer_type: "privat" | "haendler" | "unbekannt";
    signed_by_both: boolean | null;
  };
  mismatches: { field: string; entered: string; contract: string; comment: string }[];
  concerns: string[];
  verdict: "passt" | "abweichungen" | "unklar" | "kein_vertrag";
  summary: string;
};

const str = { anyOf: [{ type: "string" }, { type: "null" }] };
const int = { anyOf: [{ type: "integer" }, { type: "null" }] };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_vehicle_purchase_contract", "legible", "extracted", "mismatches", "concerns", "verdict", "summary"],
  properties: {
    is_vehicle_purchase_contract: { type: "boolean" },
    legible: { type: "boolean" },
    extracted: {
      type: "object",
      additionalProperties: false,
      required: ["make", "model", "build_year", "first_registration", "vin", "mileage_km", "price", "currency", "contract_date", "seller_type", "buyer_type", "signed_by_both"],
      properties: {
        make: str,
        model: str,
        build_year: int,
        first_registration: { ...str, description: "YYYY-MM-DD or YYYY-MM if only month and year are given" },
        vin: str,
        mileage_km: { ...int, description: "converted to km if the contract states miles" },
        price: { anyOf: [{ type: "number" }, { type: "null" }], description: "the agreed total price for the car" },
        currency: { ...str, description: "ISO 4217 code, e.g. EUR" },
        contract_date: { ...str, description: "YYYY-MM-DD" },
        seller_type: { type: "string", enum: ["privat", "haendler", "auktion", "unbekannt"] },
        buyer_type: { type: "string", enum: ["privat", "haendler", "unbekannt"] },
        signed_by_both: { anyOf: [{ type: "boolean" }, { type: "null" }] },
      },
    },
    mismatches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "entered", "contract", "comment"],
        properties: { field: { type: "string" }, entered: { type: "string" }, contract: { type: "string" }, comment: { type: "string" } },
      },
    },
    concerns: { type: "array", items: { type: "string" } },
    verdict: { type: "string", enum: ["passt", "abweichungen", "unklar", "kein_vertrag"] },
    summary: { type: "string" },
  },
};

const PROMPT = `Du prüfst für Carbay, eine Marktdaten-App für klassische Porsche, einen hochgeladenen Kaufvertrag. Ein Nutzer hat ein Auto gekauft oder verkauft und die Daten unten selbst eingetragen. Wir übernehmen den Preis nur in unsere Marktanalyse, wenn der Vertrag die Angaben belegt. Am Ende entscheidet ein Mensch; deine Prüfung bereitet das vor.

So gehst du vor:
- Lies aus dem Dokument nur ab, was dort tatsächlich steht. Was fehlt oder unleserlich ist, bleibt null. Rate nicht.
- Vergleiche Hersteller und Modell, Baujahr, Fahrgestellnummer (FIN/VIN), Kilometerstand, Preis mit Währung, Vertragsdatum und die Art des Verkäufers mit den Angaben des Nutzers. Jede Abweichung, die für den Marktwert zählt, kommt in "mismatches"; kleine Schreibvarianten (Leerzeichen in der FIN, "Coupe" statt "Coupé") sind keine Abweichung.
- Unter "concerns" gehört, was auf eine Fälschung, ein Muster oder einen nicht echten Verkauf deutet: Vorlage ohne Eintragungen, fehlende Unterschriften, nachträglich geänderte Zahlen, unplausibler Preis, Preis nur für Teile, Tausch statt Kauf, Vertrag über ein anderes Fahrzeug.
- Personenbezogene Daten (Namen, Adressen, Bankdaten) gibst du nirgends wieder, auch nicht in "summary" oder "concerns".
- "verdict": "passt", wenn der Vertrag die wesentlichen Angaben (Fahrzeug, FIN, Preis, Datum) belegt; "abweichungen", wenn er lesbar ist, aber wesentliche Angaben nicht passen; "unklar", wenn er schlecht lesbar oder unvollständig ist; "kein_vertrag", wenn es kein Kaufvertrag über ein Fahrzeug ist.
- "summary": zwei, drei Sätze auf Deutsch für den Prüfer.`;

export type AppraisalCheck = {
  is_vehicle_appraisal: boolean;
  legible: boolean;
  extracted: {
    make: string | null;
    model: string | null;
    build_year: number | null;
    first_registration: string | null;
    vin: string | null;
    mileage_km: number | null;
    value: number | null;
    currency: string | null;
    value_basis: "marktwert" | "wiederbeschaffungswert" | "wiederherstellungswert" | "unbekannt";
    appraisal_date: string | null;
    condition_grade: string | null;
    appraiser: string | null;
    signed_or_stamped: boolean | null;
  };
  mismatches: { field: string; entered: string; contract: string; comment: string }[];
  concerns: string[];
  verdict: "passt" | "abweichungen" | "unklar" | "kein_gutachten";
  summary: string;
};

const APPRAISAL_SCHEMA = {
  ...SCHEMA,
  required: ["is_vehicle_appraisal", "legible", "extracted", "mismatches", "concerns", "verdict", "summary"],
  properties: {
    is_vehicle_appraisal: { type: "boolean" },
    legible: SCHEMA.properties.legible,
    extracted: {
      type: "object",
      additionalProperties: false,
      required: ["make", "model", "build_year", "first_registration", "vin", "mileage_km", "value", "currency", "value_basis", "appraisal_date", "condition_grade", "appraiser", "signed_or_stamped"],
      properties: {
        make: str,
        model: str,
        build_year: int,
        first_registration: { ...str, description: "YYYY-MM-DD or YYYY-MM if only month and year are given" },
        vin: str,
        mileage_km: { ...int, description: "as read off the odometer, converted to km if the appraisal states miles" },
        value: { anyOf: [{ type: "number" }, { type: "null" }], description: "the value the appraisal arrives at, for the basis in value_basis" },
        currency: { ...str, description: "ISO 4217 code, e.g. EUR" },
        value_basis: { type: "string", enum: ["marktwert", "wiederbeschaffungswert", "wiederherstellungswert", "unbekannt"] },
        appraisal_date: { ...str, description: "YYYY-MM-DD, the day of the inspection or of the appraisal" },
        condition_grade: { ...str, description: "overall grade on the classic car scale 1 to 5, e.g. 2+ ; null if none is given" },
        appraiser: { ...str, description: "the organisation only (e.g. Classic Data, TÜV Süd, DEKRA), never a person's name" },
        signed_or_stamped: { anyOf: [{ type: "boolean" }, { type: "null" }] },
      },
    },
    mismatches: SCHEMA.properties.mismatches,
    concerns: SCHEMA.properties.concerns,
    verdict: { type: "string", enum: ["passt", "abweichungen", "unklar", "kein_gutachten"] },
    summary: SCHEMA.properties.summary,
  },
};

const APPRAISAL_PROMPT = `Du prüfst für Carbay, eine Marktdaten-App für klassische Porsche, ein hochgeladenes Wertgutachten. Ein Nutzer besitzt ein Auto, hat es bewerten lassen und die Daten unten selbst eingetragen. Wir erkennen das Gutachten nur an, wenn es die Angaben belegt. Am Ende entscheidet ein Mensch; deine Prüfung bereitet das vor.

So gehst du vor:
- Lies aus dem Dokument nur ab, was dort tatsächlich steht. Was fehlt oder unleserlich ist, bleibt null. Rate nicht.
- Vergleiche Hersteller und Modell, Baujahr, Fahrgestellnummer (FIN/VIN), Kilometerstand, den ermittelten Wert mit Währung, die Art des Werts (Marktwert, Wiederbeschaffungswert, Wiederherstellungswert), das Datum des Gutachtens, die Zustandsnote und die Organisation des Gutachters mit den Angaben des Nutzers. Jede Abweichung, die für den Marktwert zählt, kommt in "mismatches" (das Feld "contract" nennt dort, was im Gutachten steht); kleine Schreibvarianten (Leerzeichen in der FIN, "Coupe" statt "Coupé") sind keine Abweichung. Nennt das Gutachten mehrere Werte, zählt der, den der Nutzer als Art des Werts angegeben hat.
- Unter "concerns" gehört, was gegen ein echtes Gutachten über dieses Fahrzeug spricht: Vorlage ohne Eintragungen, kein Gutachter oder keine Organisation erkennbar, fehlende Unterschrift oder Stempel, nachträglich geänderte Zahlen, unplausibler Wert, bloße Online-Bewertung oder Händlerangebot statt Gutachten, Gutachten über ein anderes Fahrzeug, Schadengutachten statt Wertgutachten.
- Personenbezogene Daten (Namen von Auftraggeber oder Gutachter, Adressen, Kennzeichen) gibst du nirgends wieder, auch nicht in "summary" oder "concerns". Als Gutachter nennst du nur die Organisation.
- "verdict": "passt", wenn das Gutachten die wesentlichen Angaben (Fahrzeug, FIN, Wert, Datum) belegt; "abweichungen", wenn es lesbar ist, aber wesentliche Angaben nicht passen; "unklar", wenn es schlecht lesbar oder unvollständig ist; "kein_gutachten", wenn es kein Wertgutachten über ein Fahrzeug ist.
- "summary": zwei, drei Sätze auf Deutsch für den Prüfer.`;

/** Best-effort check whether the SDK will find credentials (env vars or an `ant auth login` profile). */
export function hasCredentials() {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.ANTHROPIC_PROFILE ||
      existsSync(join(homedir(), ".config", "anthropic")),
  );
}

let client: Anthropic | null = null;

/** Reads the document and compares it with the entries: a contract for a "kaufvertrag" report, an appraisal for a "gutachten". */
export async function checkDocument(file: Buffer, mediaType: string, entered: Entered): Promise<ContractCheck | AppraisalCheck> {
  const appraisal = entered.kind === "gutachten";
  const { kind: _kind, ...fields } = entered;
  if (!hasCredentials()) throw new Error("Kein Anthropic-API-Zugang eingerichtet (ANTHROPIC_API_KEY): bitte von Hand prüfen.");
  client ??= new Anthropic();
  const data = file.toString("base64");
  const doc: Anthropic.Beta.BetaContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp", data } };
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: appraisal ? APPRAISAL_SCHEMA : SCHEMA } },
    system: appraisal ? APPRAISAL_PROMPT : PROMPT,
    messages: [
      {
        role: "user",
        content: [doc, { type: "text", text: `Angaben des Nutzers:\n${JSON.stringify(fields, null, 1)}` }],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("Die KI-Prüfung wurde abgelehnt (refusal).");
  if (response.stop_reason === "max_tokens") throw new Error("Die KI-Prüfung wurde abgeschnitten.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return JSON.parse(text) as ContractCheck | AppraisalCheck;
}
