import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Variant } from "../../data/types";
import { paintChart, paintNote, findPaint, type PaintColor, type PaintKind, type PaintChartPart } from "../../data/real/paints";
import { cn, hostOf } from "../../lib/format";
import { Section } from "../ui";
import { t } from "../../i18n";

const KIND_LABEL: Record<PaintKind, () => string> = {
  uni: () => "Uni",
  metallic: () => "Metallic",
  perl: () => "Perlcolor",
  sonder: () => t("Sonderfarben gegen Aufpreis", "Special colours at extra cost"),
};
const KIND_ORDER: PaintKind[] = ["uni", "metallic", "perl", "sonder"];
/** Long lists (911 of the 1980s: 50+ colours) start folded. */
const FOLD = 24;

/** "1974–1986", "1972–1973, 1976" */
function yearRanges(ys: number[]): string {
  const out: string[] = [];
  let start = ys[0];
  for (let i = 1; i <= ys.length; i++) {
    if (i === ys.length || ys[i] !== ys[i - 1] + 1) {
      out.push(start === ys[i - 1] ? `${start}` : `${start}–${ys[i - 1]}`);
      start = ys[i];
    }
  }
  return out.join(", ");
}

/** Factory colours offered in the variant's build years, from the works' own colour charts. */
export function PaintChart({ variant }: { variant: Variant }) {
  const parts = paintChart(variant);
  const note = paintNote(variant);
  const race = variant.tags.includes("Rennwagen");
  const launch = variant.launchColor ? findPaint(variant, variant.launchColor.name) : undefined;
  const total = parts.reduce((n, p) => n + p.colors.length, 0);

  return (
    <Section
      title={t("Werksfarben", "Factory colours")}
      sub={
        parts.length
          ? t(
              `${total} Lacke, die Porsche in den Baujahren dieser Variante anbot, nach den Farbkarten des Werks.`,
              `${total} paints Porsche offered in this variant's build years, from the factory's own colour charts.`,
            )
          : undefined
      }
    >
      {!parts.length ? (
        <p className="max-w-[640px] text-[14.5px] text-muted">
          {race
            ? t(
                "Rennwagen trugen Team- oder Sponsorlackierungen; eine Serien-Farbkarte gibt es dafür nicht.",
                "Race cars wore team or sponsor liveries; there is no series colour chart for them.",
              )
            : note ??
              t(
                "Für diese Baureihe liegt noch keine ausgewertete Werksfarbkarte vor.",
                "No factory colour chart has been worked through for this series yet.",
              )}
        </p>
      ) : (
        <div className="space-y-12">
          {parts.map((p) => (
            <ChartPart key={p.palette.id} part={p} variant={variant} launch={launch} />
          ))}
          <div className="max-w-[760px] space-y-2 text-[12.5px] text-faint">
            {note && <p className="text-[13.5px] text-muted">{note}</p>}
            <p>
              {t(
                "Namen, Codes und Modelljahre wie auf den Werkskarten (Porsche Classic). Die Farbtöne sind angenähert: bei den alten Karten aus dem Scan gemessen und um das vergilbte Papier korrigiert, sonst nach dem Farbnamen geschätzt. Ein Bildschirm zeigt Lack nur ungefähr.",
                "Names, codes and model years as printed on the factory charts (Porsche Classic). Shades are approximate: measured on the scans of the old charts and corrected for the yellowed paper, otherwise estimated from the colour name. A screen shows paint only roughly.",
              )}
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}

function ChartPart({ part, variant, launch }: { part: PaintChartPart; variant: Variant; launch?: PaintColor }) {
  const { palette, colors } = part;
  const [open, setOpen] = useState(colors.length <= FOLD);
  const shown = open ? colors : colors.slice(0, FOLD);
  const end = variant.years[1] ?? new Date().getFullYear();
  // Per-colour model years only help when the variant spans more than one of them.
  const showYears = palette.perYear && end > variant.years[0];
  const groups = KIND_ORDER.map((k) => [k, shown.filter((c) => c.kind === k)] as const).filter(([, cs]) => cs.length);
  const sources = [palette.source, ...(palette.alsoSources ?? [])];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="text-[17px] font-medium">
          {palette.title} <span className="text-[14px] font-normal text-muted">· {t(`${colors.length} Farben`, `${colors.length} colours`)}</span>
        </h3>
        <a href={palette.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-gold hover:underline">
          {t("Farbkarte des Werks", "Factory colour chart")} <ArrowUpRight className="size-3.5" />
        </a>
      </div>
      <div className="space-y-6">
        {groups.map(([kind, cs]) => (
          <div key={kind}>
            <div className="mb-2.5 text-[12px] tracking-[0.12em] text-muted uppercase">{KIND_LABEL[kind]()}</div>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {cs.map((c) => (
                <Chip key={c.name + c.code} c={c} years={showYears && c.years ? yearRanges(c.years) : undefined} launch={c === launch} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {!open && (
        <button onClick={() => setOpen(true)} className="btn mt-6">
          {t(`Alle ${colors.length} Farben zeigen`, `Show all ${colors.length} colours`)}
        </button>
      )}
      {palette.note && <p className="mt-5 max-w-[760px] text-[13px] text-muted">{palette.note}</p>}
      {sources.length > 1 && (
        <p className="mt-2 text-[12.5px] text-faint">
          {t("Weitere Karten", "Further charts")}:{" "}
          {sources.slice(1).map((s, i) => (
            <a key={s} href={s} target="_blank" rel="noreferrer" className="hover:text-ink">
              {i > 0 && ", "}
              {s.split("/").pop()?.replace(/-(colour-information|farbinformation|overview-paint-colours).*$/, "") ?? hostOf(s)}
            </a>
          ))}
        </p>
      )}
    </div>
  );
}

function Chip({ c, years, launch }: { c: PaintColor; years?: string; launch: boolean }) {
  return (
    <li className="flex min-w-0 items-center gap-3">
      <span
        className={cn("size-9 shrink-0 rounded-md ring-1 ring-ink/15", launch && "ring-2 ring-gold ring-offset-2 ring-offset-bg")}
        style={{ background: c.kind === "metallic" || c.kind === "perl" ? `linear-gradient(135deg, ${c.hex} 35%, color-mix(in srgb, ${c.hex} 70%, white) 60%, ${c.hex} 85%)` : c.hex }}
        aria-hidden="true"
      />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[14px]">{c.name}</span>
        <span className="block truncate text-[12px] text-faint">
          {[c.code, years && t(`MJ ${years}`, `MY ${years}`), launch && t("Präsentationsfarbe", "Launch colour")].filter(Boolean).join(" · ")}
        </span>
      </span>
    </li>
  );
}
