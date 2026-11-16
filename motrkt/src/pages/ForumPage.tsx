import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { variantById, variantTitle } from "../data/db";
import { api } from "../lib/userCars";
import { num } from "../lib/format";
import { when } from "../components/market/Forum";
import { Empty } from "../components/ui";
import { t } from "../i18n";

type Topic = { id: string; variant: string; title: string; username: string; createdAt: string; lastPostAt: string; posts: number; excerpt: string | null };

/** Forum overview: the latest topics of all models (each model's own forum sits at the bottom of its page). */
export default function ForumPage() {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api<{ topics: Topic[] }>("/api/forum/neueste?limit=100")
      .then((j) => setTopics(j.topics))
      .catch(() => setError(true));
  }, []);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-[11px] tracking-[0.18em] text-gold uppercase">{t("Forum", "Forum")}</div>
      <h1 className="mt-1 font-serif text-3xl">{t("Neueste Themen", "Latest topics")}</h1>
      <p className="mt-2 text-[14px] text-muted">
        {t(
          "Jedes Modell hat sein eigenes Forum am Ende seiner Seite. Hier stehen die zuletzt bewegten Themen aller Modelle.",
          "Every model has its own forum at the bottom of its page. These are the most recently active topics across all models.",
        )}
      </p>
      {error && <p className="mt-6 text-[14px] text-down">{t("Das Forum konnte nicht geladen werden.", "The forum could not be loaded.")}</p>}
      {!topics && !error && <p className="mt-6 text-[14px] text-faint">{t("Themen werden geladen …", "Loading topics …")}</p>}
      {topics && !topics.length && (
        <Empty className="mt-8 py-12">
          {t("Noch keine Themen. Eröffnen Sie das erste auf der Seite Ihres Modells.", "No topics yet. Start the first one on your model's page.")}
        </Empty>
      )}
      {!!topics?.length && (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {topics.map((x) => {
            const v = variantById.get(x.variant);
            return (
              <li key={x.id}>
                <Link to={`/markt/${x.variant}?thema=${x.id}#forum`} className="group flex items-start gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] tracking-[0.08em] text-gold uppercase">{v ? variantTitle(v) : x.variant}</div>
                    <div className="font-serif text-[18px] group-hover:underline">{x.title}</div>
                    {x.excerpt && <p className="mt-0.5 line-clamp-2 text-[14px] text-muted">{x.excerpt}</p>}
                    <div className="mt-1 text-[12.5px] text-faint">
                      {x.username} · {when(x.createdAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[12.5px] text-muted">
                    <div className="inline-flex items-center gap-1">
                      <MessageSquare className="size-3.5" strokeWidth={1.5} /> {num(Math.max(0, x.posts - 1))}
                    </div>
                    <div className="text-faint">{when(x.lastPostAt)}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
