import { useState } from "react";
import { Download, FileUp, Trash2 } from "lucide-react";
import { IMPORT_STORAGE_KEY, TEMPLATE_CSV, parseSalesCsv, realSales, type ParseResult } from "../data/real/sales";
import { variantById, variantShortTitle } from "../data/db";
import { Modal } from "./ui";
import { num } from "../lib/format";
import { t } from "../i18n";

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const stored = (() => {
    try {
      return localStorage.getItem(IMPORT_STORAGE_KEY);
    } catch {
      return null;
    }
  })();

  const matched = result ? [...new Set(result.rows.map((r) => r.variantId))] : [];

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(["\ufeff" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = t("mip-verkaeufe-vorlage.csv", "mip-sales-template.csv");
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("Echte Marktdaten importieren (CSV)", "Import real market data (CSV)")}
      wide
      footer={
        <>
          {stored && (
            <button
              className="btn mr-auto text-down"
              onClick={() => {
                localStorage.removeItem(IMPORT_STORAGE_KEY);
                location.reload();
              }}
            >
              <Trash2 className="size-4" /> {t("Importierte Daten entfernen", "Remove imported data")}
            </button>
          )}
          <button className="btn" onClick={onClose}>
            {t("Abbrechen", "Cancel")}
          </button>
          <button
            className="btn btn-gold"
            disabled={!text || !result || result.rows.length === 0}
            onClick={() => {
              localStorage.setItem(IMPORT_STORAGE_KEY, text!);
              location.reload();
            }}
          >
            <FileUp className="size-4" /> {t(`${result?.rows.length ?? 0} Verkäufe importieren & neu laden`, `Import ${result?.rows.length ?? 0} sales & reload`)}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          {t(
            "Lade Auktionsergebnisse und Verkäufe, die du verwenden darfst (eigene Aufzeichnungen, lizenzierte Datensätze, manuell erfasste Ergebnisse). Varianten mit Auktionsergebnissen im Marktmodell behalten dessen Werte; für Varianten ohne belegte Verkäufe leitet MIP Marktwert und Trend aus deinen importierten Preisen ab (ab 3 Verkäufen in 24 Monaten; ab 8 Verkäufen über mindestens 3 Jahre auch die Rendite).",
            "Upload auction results and sales you are allowed to use (your own records, licensed data sets, manually collected results). Variants with auction results in the market model keep its values; for variants without recorded sales MIP derives market value and trend from your imported prices (from 3 sales in 24 months; the return from 8 sales over at least 3 years).",
          )}
        </p>
        <div className="rounded-lg border border-line bg-panel-2 p-3 text-xs text-muted">
          <div className="mb-1 font-medium text-ink">Format</div>
          {t(
            <>
              Trennzeichen „;“ oder „,“ · Pflicht: <code>variant_id</code> oder <code>fahrzeug</code> (z. B. „Porsche 911 (964) Carrera RS“), <code>datum</code>{" "}
              (JJJJ-MM-TT), <code>preis_eur</code> (oder <code>verkauft=nein</code>) · optional: quelle, haus, schaetzung_von/bis, zustand (1 … 3), km, länder, farbe,
              karosserie, getriebe, fin, los_id, url.
            </>,
            <>
              Separator “;” or “,” · required: <code>variant_id</code> or <code>vehicle</code> (e.g. “Porsche 911 (964) Carrera RS”), <code>date</code> (YYYY-MM-DD),{" "}
              <code>price_eur</code> (or <code>sold=no</code>) · optional: source, house, estimate_low/high, condition (1 … 3), mileage, buyer_country, origin_country,
              delivery_country, color, body, gearbox, vin, lot_id, url. German column names work as well.
            </>,
          )}
          <button className="mt-2 flex items-center gap-1.5 text-gold hover:underline" onClick={downloadTemplate}>
            <Download className="size-3.5" /> {t("Vorlage herunterladen", "Download template")}
          </button>
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-2 px-4 py-6 text-muted hover:border-gold/60 hover:text-ink">
          <FileUp className="size-5" />
          {fileName || t("CSV-Datei auswählen", "Choose a CSV file")}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const content = await file.text();
              setFileName(file.name);
              setText(content);
              setResult(parseSalesCsv(content, file.name));
            }}
          />
        </label>
        {result && (
          <div className="space-y-2">
            <div>
              <span className="text-up">{t(`${result.rows.length} gültige Verkäufe`, `${result.rows.length} valid sales`)}</span>{" "}
              {t(`von ${result.total} Zeilen · ${matched.length} Varianten`, `of ${result.total} rows · ${matched.length} variants`)}
              {result.errors.length > 0 && <span className="text-down"> · {t(`${result.errors.length} Fehler`, `${result.errors.length} errors`)}</span>}
            </div>
            {matched.length > 0 && (
              <div className="text-xs text-muted">{matched.slice(0, 12).map((id) => variantShortTitle(variantById.get(id)!)).join(", ")}{matched.length > 12 && " …"}</div>
            )}
            {result.errors.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-lg border border-down/30 bg-down/5 p-2 text-xs text-down">
                {result.errors.slice(0, 50).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-xs text-faint">
          {t(
            `Aktuell geladen: ${num(realSales.count)} echte Verkäufe für ${realSales.byVariant.size} Varianten${stored ? " (inkl. Browser-Import)" : ""}. Dauerhaft fürs Team: Datei als `,
            `Currently loaded: ${num(realSales.count)} real sales for ${realSales.byVariant.size} variants${stored ? " (incl. browser import)" : ""}. To keep it for the whole team, put the file into the project as `,
          )}
          <code>src/data/real/sales.csv</code>
          {t(" ins Projekt legen.", ".")}
        </p>
      </div>
    </Modal>
  );
}
