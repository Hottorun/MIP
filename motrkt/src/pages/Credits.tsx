import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { brands, variants, variantTitle } from "../data/db";
import { cn, hostOf } from "../lib/format";
import { CarImage } from "../components/CarImage";
import { BrandEmblem, Card, Pill, Segmented } from "../components/ui";

const CONF = { high: "belegt", medium: "wahrscheinlich", low: "unsicher" } as const;

export default function Credits() {
  const [tab, setTab] = useState<"Fotos" | "Präsentationsfarben" | "Spezifikationen">("Fotos");
  const withPhotos = variants.filter((v) => v.photos.length);
  const stats = useMemo(
    () => ({
      photos: variants.reduce((s, v) => s + v.photos.length, 0),
      colors: variants.filter((v) => v.launchColor).length,
      specs: variants.filter((v) => v.specSources.length).length,
    }),
    [],
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Bildnachweise & Quellen</h1>
          <p className="mt-1 text-sm text-muted">
            {stats.photos} frei lizenzierte Fotos (Wikimedia Commons) · {stats.colors} recherchierte Präsentationsfarben · {stats.specs} Varianten mit belegten
            Spezifikationen
          </p>
        </div>
        <Segmented options={["Fotos", "Präsentationsfarben", "Spezifikationen"] as const} value={tab} onChange={setTab} />
      </div>

      {tab === "Fotos" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {withPhotos.flatMap((v) =>
            v.photos.map((p) => (
              <div key={p.file} className="panel flex gap-3 p-3">
                <Link to={`/markt/${v.id}`} className="shrink-0">
                  <CarImage variant={v} photo={p} className="h-20 w-32 rounded-md" />
                </Link>
                <div className="min-w-0 text-xs">
                  <Link to={`/markt/${v.id}`} className="block truncate text-sm text-ink hover:text-gold">
                    {variantTitle(v)}
                  </Link>
                  <div className="truncate text-muted">{p.caption}</div>
                  <div className="mt-1 text-muted">
                    Foto: {p.author || "unbekannt"} ·{" "}
                    {p.licenseUrl ? (
                      <a href={p.licenseUrl} target="_blank" rel="noreferrer" className="text-gold hover:underline">
                        {p.license}
                      </a>
                    ) : (
                      p.license
                    )}
                  </div>
                  {p.page && (
                    <a href={p.page} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-faint hover:text-ink">
                      Wikimedia Commons <ExternalLink className="size-3" />
                    </a>
                  )}
                  {p.exact === false && <Pill className="ml-1 text-[10px]">ähnliches Modell</Pill>}
                </div>
              </div>
            )),
          )}
        </div>
      )}

      {tab === "Präsentationsfarben" &&
        brands.map((b) => {
          const list = variants.filter((v) => v.brandId === b.id);
          return (
            <Card key={b.id} title={<span className="inline-flex items-center gap-2"><BrandEmblem brandId={b.id} /> {b.name}</span>}>
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="pl-0">Variante</th>
                    <th>Präsentationsfarbe</th>
                    <th>Sicherheit</th>
                    <th>Quelle / Notiz</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((v) => (
                    <tr key={v.id}>
                      <td className="pl-0">
                        <Link to={`/markt/${v.id}`} className="hover:text-gold">
                          {variantTitle(v, { brand: false })}
                        </Link>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className="size-3.5 rounded-full border border-white/30" style={{ background: v.color }} />
                          {v.launchColor?.name ?? <span className="text-faint">nicht recherchiert</span>}
                        </span>
                      </td>
                      <td>
                        {v.launchColor && (
                          <Pill tone={v.launchColor.confidence === "high" ? "up" : v.launchColor.confidence === "medium" ? "gold" : "warn"}>
                            {CONF[v.launchColor.confidence ?? "low"]}
                          </Pill>
                        )}
                      </td>
                      <td className="max-w-[420px] truncate whitespace-normal text-xs text-muted">
                        {v.launchColor?.source && (
                          <a href={v.launchColor.source} target="_blank" rel="noreferrer" className={cn("text-gold hover:underline", v.launchColor.note && "mr-2")}>
                            Quelle
                          </a>
                        )}
                        {v.launchColor?.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}

      {tab === "Spezifikationen" && (
        <Card title="Belegte Spezifikationen" sub="(Produktion, Leistung, Hubraum, Bauzeit, Neupreis)">
          <ul className="space-y-1.5 text-[13px]">
            {variants
              .filter((v) => v.specSources.length)
              .map((v) => (
                <li key={v.id} className="flex flex-wrap gap-x-3">
                  <Link to={`/markt/${v.id}`} className="w-72 shrink-0 hover:text-gold">
                    {variantTitle(v)}
                  </Link>
                  {v.specSources.map((s) => (
                    <a key={s} href={s} target="_blank" rel="noreferrer" className="truncate text-xs text-muted hover:text-gold">
                      {hostOf(s)}
                    </a>
                  ))}
                </li>
              ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-faint">
        Marktwerte, Verkäufe, Auktionen und Inserate sind weiterhin synthetische Demo-Daten. Fotos stammen ausschließlich von Wikimedia Commons unter den jeweils
        angegebenen freien Lizenzen.
      </p>
    </div>
  );
}
