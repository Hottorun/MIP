import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { BadgeCheck, Check, ChevronLeft, Flag, MessagesSquare, Search, X } from "lucide-react";
import type { Variant } from "../../data/types";
import { generationById, variantById, variantTitle } from "../../data/db";
import { cn, num } from "../../lib/format";
import { locale, t } from "../../i18n";
import { Section, useConfirm } from "../ui";
import { api } from "../../lib/userCars";
import { signInHref, useNeedsAccount, usePlan } from "../../lib/plan";
import { FORUM_CATEGORIES, FORUM_SORTS, type ForumCategory, type ForumKind, type ForumSort, type ForumStatus } from "../../lib/forumShared";

/**
 * Forum of one variant at the bottom of its page (server/forum.ts). Three views: the overview (areas on the left,
 * search, status tabs and the topics), one topic as a conversation, and the form for a new topic. Topics are
 * questions or discussions; the author of a question marks the reply that answered it. `?thema=<id>` in the URL
 * opens that topic (links from the site search and the review page).
 */

type Topic = {
  id: string; variant: string; title: string; category: ForumCategory; kind: ForumKind; solved: boolean; username: string; owner: boolean; mine: boolean;
  createdAt: string; lastPostAt: string; lastUsername: string | null; posts: number; excerpt: string | null;
};
type TopicList = { topics: Topic[]; hasMore: boolean; total: number; counts: Partial<Record<ForumCategory, number>> };
type Post = { id: string; username: string; owner: boolean; createdAt: string; editedAt: string | null; body: string | null; mine: boolean; canHide: boolean; reported: boolean; reports?: number };
type Thread = {
  topic: { id: string; variant: string; title: string; username: string; createdAt: string; category: ForumCategory; kind: ForumKind; solvedPost: string | null; canEdit: boolean };
  posts: Post[];
  admin: boolean;
};

const CATEGORY: Record<ForumCategory, { label: () => string; hint: () => string }> = {
  kaufberatung: {
    label: () => t("Kaufberatung", "Buying advice"),
    hint: () => t("Worauf achten, welches Baujahr, was ist ein fairer Preis", "What to look for, which model year, what is a fair price"),
  },
  technik: {
    label: () => t("Technik und Wartung", "Technical and maintenance"),
    hint: () => t("Schwachstellen, Wartung, Reparaturen, Werkstätten", "Weak points, servicing, repairs, workshops"),
  },
  markt: {
    label: () => t("Markt und Preise", "Market and prices"),
    hint: () => t("Auktionsergebnisse, Angebote, Wertentwicklung", "Auction results, listings, value history"),
  },
  historie: {
    label: () => t("Historie und Originalität", "History and originality"),
    hint: () => t("Stückzahlen, Ausstattung ab Werk, Matching Numbers, Dokumente", "Production numbers, factory specification, matching numbers, documents"),
  },
  teile: {
    label: () => t("Teile und Zubehör", "Parts and accessories"),
    hint: () => t("Ersatzteile, Zubehör, Bezugsquellen", "Spare parts, accessories, where to find them"),
  },
  erfahrung: {
    label: () => t("Erfahrungen", "Ownership"),
    hint: () => t("Alltag, Ausfahrten, Unterhalt, Berichte von Besitzern", "Daily use, drives, running costs, owners' reports"),
  },
  allgemein: {
    label: () => t("Allgemein", "General"),
    hint: () => t("Alles Weitere zu diesem Modell", "Everything else about this model"),
  },
};

/** The views offered as tabs above the topics. */
const TABS: { value: ForumStatus; label: () => string }[] = [
  { value: "alle", label: () => t("Alle", "All") },
  { value: "offen", label: () => t("Offene Fragen", "Open questions") },
  { value: "geklaert", label: () => t("Geklärt", "Answered") },
  { value: "besitzer", label: () => t("Von Besitzern", "By owners") },
  { value: "meine", label: () => t("Meine", "Mine") },
];
const SORT_LABEL: Record<ForumSort, () => string> = {
  aktiv: () => t("Zuletzt aktiv", "Latest activity"),
  neu: () => t("Neueste zuerst", "Newest first"),
  antworten: () => t("Meiste Antworten", "Most replies"),
};

const exact = (iso: string) => new Date(iso).toLocaleString(locale(), { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** "vor 5 Minuten", "gestern"; after a week the date. */
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return t("gerade eben", "just now");
  const rel = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  if (s < 3600) return rel.format(-Math.round(s / 60), "minute");
  if (s < 86_400) return rel.format(-Math.round(s / 3600), "hour");
  if (s < 7 * 86_400) return rel.format(-Math.round(s / 86_400), "day");
  return new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}
const When = ({ iso }: { iso: string }) => <time dateTime={iso} title={exact(iso)}>{ago(iso)}</time>;

const replies = (n: number) => (n === 1 ? t("1 Antwort", "1 reply") : t(`${num(n)} Antworten`, `${num(n)} replies`));

const ERR: Record<string, () => string> = {
  title: () => t("Der Titel braucht 3 bis 120 Zeichen.", "The title needs 3 to 120 characters."),
  body: () => t("Bitte einen Text eingeben (höchstens 5.000 Zeichen).", "Please enter a text (at most 5,000 characters)."),
  too_many: () => t("Sie haben in der letzten Stunde schon viel geschrieben. Bitte später weiter.", "You have posted a lot in the last hour. Please continue later."),
};
const errText = (e: unknown) => (ERR[(e as Error).message] ?? (() => t("Das hat nicht geklappt. Bitte noch einmal versuchen.", "That did not work. Please try again.")))();
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** The search words as the server reads them (two letters or more, five at most). */
const searchTerms = (q: string) => q.trim().split(/\s+/).filter((w) => w.length >= 2).slice(0, 5);

/** Text with the search words marked. */
function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-tag bg-gold-soft px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** A guest gets no usernames from the server (server/forum.ts), only "": the author shows as a member. */
const shownName = (name: string) => name || t("Mitglied", "Member");

function Author({ name, owner }: { name: string; owner: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-ink">{shownName(name)}</span>
      {owner && (
        <span className="inline-flex items-center gap-0.5 text-[12px] text-up" title={t("Besitzt diese Variante, Kaufvertrag geprüft", "Owns this variant, purchase contract checked")}>
          <BadgeCheck className="size-3.5" strokeWidth={1.6} /> {t("Besitzer", "Owner")}
        </span>
      )}
    </span>
  );
}

/** First letter of the name in a circle: gives every post its place in the conversation. */
function Avatar({ name, dim }: { name: string; dim?: boolean }) {
  return (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-panel-3 font-display text-[16px] text-muted uppercase", dim && "opacity-50")}>
      {shownName(name).replace(/[^\p{L}\p{N}]/gu, "").charAt(0) || "?"}
    </span>
  );
}

/** What a topic is, at a glance: answered question, open question or discussion. */
function TopicMark({ kind, solved }: { kind: ForumKind; solved: boolean }) {
  const base = "flex size-9 shrink-0 items-center justify-center rounded-full";
  if (solved)
    return (
      <span className={cn(base, "bg-up-soft text-up")} title={t("Geklärte Frage", "Answered question")}>
        <Check className="size-[18px]" strokeWidth={2} />
      </span>
    );
  if (kind === "frage")
    return (
      <span className={cn(base, "bg-gold-soft font-display text-[19px] leading-none text-gold")} title={t("Offene Frage", "Open question")}>
        ?
      </span>
    );
  return (
    <span className={cn(base, "bg-panel-3 text-muted")} title={t("Diskussion", "Discussion")}>
      <MessagesSquare className="size-[17px]" strokeWidth={1.5} />
    </span>
  );
}

const stateLabel = (kind: ForumKind, solved: boolean) =>
  solved ? t("Geklärte Frage", "Answered question") : kind === "frage" ? t("Offene Frage", "Open question") : t("Diskussion", "Discussion");

export function Forum({ variant }: { variant: Variant }) {
  const [params, setParams] = useSearchParams();
  const open = params.get("thema");
  const box = useRef<HTMLDivElement>(null);
  /** A view replaced the one before it: bring the top of the forum back when it scrolled out. */
  const toTop = () => {
    const el = box.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  };
  const setOpen = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set("thema", id);
    else p.delete("thema");
    setParams(p, { replace: true, preventScrollReset: true });
    toTop();
  };

  // sister variants of the model line: their topics can be read along
  const sisters = useMemo(
    () => (generationById.get(variant.generationId)?.variantIds ?? []).filter((id) => id !== variant.id && variantById.has(id)),
    [variant],
  );

  const [input, setInput] = useState("");
  const [q, setQ] = useState(""); // the search actually sent, a moment after typing stops
  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [status, setStatus] = useState<ForumStatus>("alle");
  const [sort, setSort] = useState<ForumSort>("aktiv");
  const [wholeLine, setWholeLine] = useState(false);
  const [writing, setWriting] = useState<ForumCategory | null>(null); // the area the new topic starts in
  const [list, setList] = useState<TopicList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setQ(input.trim()), 250);
    return () => window.clearTimeout(id);
  }, [input]);

  // an answer that arrives after the filters changed again is dropped
  const request = useRef(0);
  const load = (offset = 0) => {
    const n = ++request.current;
    const p = new URLSearchParams({ offset: String(offset), status, sortierung: sort });
    if (q) p.set("q", q);
    if (category) p.set("kategorie", category);
    if (wholeLine && sisters.length) p.set("mit", sisters.join(","));
    setLoading(true);
    return api<TopicList>(`/api/forum/${variant.id}?${p}`)
      .then((j) => {
        if (n !== request.current) return;
        // topics move up when someone posts: the next page can repeat one already shown
        setList((prev) => (offset && prev ? { ...j, topics: [...prev.topics, ...j.topics.filter((x) => !prev.topics.some((o) => o.id === x.id))] } : j));
        setError(false);
      })
      .catch(() => n === request.current && setError(true))
      .finally(() => n === request.current && setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant.id, q, category, status, sort, wholeLine]);

  const terms = searchTerms(q);
  const filtered = Boolean(q || category || status !== "alle");
  const counts = list?.counts ?? {};
  const inAll = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  // nothing written here yet and nothing filtered: an invitation instead of an empty list
  const untouched = Boolean(list && !list.topics.length && !filtered && !inAll);
  const reset = () => {
    setInput("");
    setQ("");
    setCategory(null);
    setStatus("alle");
  };
  const needsAccount = useNeedsAccount(); // guests read; writing needs an account
  const startWriting = (c: ForumCategory | null = category) =>
    needsAccount("forum", () => {
      setWriting(c ?? "allgemein");
      toTop();
    });
  const name = variantTitle(variant);

  return (
    <div ref={box} className="scroll-mt-[136px]">
      <Section
        title={t("Forum", "Forum")}
        sub={t(`Fragen und Erfahrungen zum ${name}`, `Questions and experience around the ${name}`)}
        actions={
          !open &&
          !writing && (
            <button className="btn btn-gold" onClick={() => startWriting()}>
              {t("Neues Thema", "New topic")}
            </button>
          )
        }
      >
        {open ? (
          <ThreadView id={open} here={variant.id} onBack={() => (setOpen(null), load())} />
        ) : writing ? (
          <NewTopic
            variant={variant}
            category={writing}
            onCancel={() => setWriting(null)}
            onDone={(id) => {
              setWriting(null);
              setOpen(id);
            }}
          />
        ) : (
          <Columns
            rail={
              /* areas: a list beside the topics on wide screens, a menu above them on narrow ones */
              <nav aria-label={t("Bereiche", "Areas")}>
                <div className="mb-2 px-3 text-[13px] text-faint">{t("Bereiche", "Areas")}</div>
                <ul>
                  <li>
                    <AreaLink active={!category} count={inAll} onClick={() => setCategory(null)}>
                      {t("Alle Themen", "All topics")}
                    </AreaLink>
                  </li>
                  {FORUM_CATEGORIES.map((c) => (
                    <li key={c}>
                      <AreaLink active={category === c} count={counts[c] ?? 0} onClick={() => setCategory(c)} title={CATEGORY[c].hint()}>
                        {CATEGORY[c].label()}
                      </AreaLink>
                    </li>
                  ))}
                </ul>
                {sisters.length > 0 && (
                  <div className="mt-4 border-t border-line px-3 pt-4">
                    <WholeLine checked={wholeLine} onChange={setWholeLine} others={sisters.length} />
                  </div>
                )}
              </nav>
            }
          >
            {error && <p className="text-[14px] text-down">{t("Das Forum konnte nicht geladen werden. Bitte die Seite neu laden.", "The forum could not be loaded. Please reload the page.")}</p>}
            {!list && !error && <p className="text-[14px] text-faint">{t("Themen werden geladen …", "Loading topics …")}</p>}

            {untouched && (
              <div className="rounded-card border border-dashed border-line-2 px-6 py-12 text-center">
                <h3 className="font-display text-[22px] leading-snug">{t("Hier hat noch niemand geschrieben.", "Nobody has written here yet.")}</h3>
                <p className="mx-auto mt-2 max-w-md text-[14.5px] text-muted">
                  {t(
                    `Stellen Sie die erste Frage zum ${variantTitle(variant, { brand: false })} oder teilen Sie, was Sie über dieses Modell wissen.`,
                    `Ask the first question about the ${variantTitle(variant, { brand: false })} or share what you know about this model.`,
                  )}
                </p>
                <button className="btn btn-gold mt-6" onClick={() => startWriting()}>
                  {t("Erstes Thema eröffnen", "Start the first topic")}
                </button>
                {sisters.length > 0 && !wholeLine && (
                  <p className="mt-5 text-[13.5px] text-muted">
                    <button className="link" onClick={() => setWholeLine(true)}>
                      {t("Themen der ganzen Baureihe ansehen", "See the topics of the whole model line")}
                    </button>
                  </p>
                )}
              </div>
            )}

            {list && !untouched && (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-faint" strokeWidth={1.5} />
                  <input
                    type="search"
                    className="input py-2.5 pr-10 pl-11 text-[15px] [&::-webkit-search-cancel-button]:hidden"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t("Im Forum suchen", "Search the forum")}
                    aria-label={t("Im Forum suchen", "Search the forum")}
                  />
                  {input && (
                    <button className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 text-muted hover:text-ink" onClick={() => setInput("")} aria-label={t("Suche leeren", "Clear search")}>
                      <X className="size-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>

                {/* narrow screens: area, order and model line in one row of menus */}
                <div className="mt-3 flex flex-wrap items-center gap-2 lg:hidden">
                  <select className="pill-select" value={category ?? ""} onChange={(e) => setCategory((e.target.value || null) as ForumCategory | null)} aria-label={t("Bereich", "Area")}>
                    <option value="">{t(`Alle Themen (${inAll})`, `All topics (${inAll})`)}</option>
                    {FORUM_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY[c].label()} ({counts[c] ?? 0})
                      </option>
                    ))}
                  </select>
                  <SortMenu value={sort} onChange={setSort} />
                  {sisters.length > 0 && <WholeLine checked={wholeLine} onChange={setWholeLine} others={sisters.length} compact />}
                </div>

                <div className="mt-4 flex items-end justify-between gap-4 border-b border-line">
                  <div className="-mb-px flex gap-6 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label={t("Ansicht", "View")}>
                    {TABS.map((tab) => (
                      <button
                        key={tab.value}
                        role="tab"
                        aria-selected={status === tab.value}
                        onClick={() => setStatus(tab.value)}
                        className={cn(
                          "border-b-2 pt-1 pb-2.5 text-[14.5px] whitespace-nowrap transition-colors",
                          status === tab.value ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
                        )}
                      >
                        {tab.label()}
                      </button>
                    ))}
                  </div>
                  <div className="mb-2 hidden shrink-0 lg:block">
                    <SortMenu value={sort} onChange={setSort} />
                  </div>
                </div>

                <div className={cn("transition-opacity", loading && "opacity-60")} aria-busy={loading}>
                  {filtered && list.topics.length > 0 && (
                    <div className="flex flex-wrap items-baseline justify-between gap-3 pt-3 text-[13px] text-faint">
                      <span aria-live="polite">
                        {q
                          ? list.total === 1 ? t(`1 Treffer für „${q}“`, `1 result for “${q}”`) : t(`${num(list.total)} Treffer für „${q}“`, `${num(list.total)} results for “${q}”`)
                          : list.total === 1 ? t("1 Thema", "1 topic") : t(`${num(list.total)} Themen`, `${num(list.total)} topics`)}
                      </span>
                      <button className="hover:text-ink" onClick={reset}>
                        {t("Alles zeigen", "Show everything")}
                      </button>
                    </div>
                  )}

                  {!list.topics.length ? (
                    <div className="py-12 text-center">
                      <p className="font-display text-[18px] text-muted">
                        {q
                          ? t(`Nichts gefunden für „${q}“.`, `Nothing found for “${q}”.`)
                          : category && status === "alle"
                            ? t(`In „${CATEGORY[category].label()}“ gibt es noch keine Themen.`, `There are no topics in “${CATEGORY[category].label()}” yet.`)
                            : filtered
                              ? t("Dazu gibt es noch keine Themen.", "There are no topics for this yet.")
                              : t("In der ganzen Baureihe gibt es noch keine Themen.", "There are no topics in the whole model line yet.")}
                      </p>
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <button className="btn btn-gold" onClick={() => startWriting()}>
                          {category ? t(`Thema in „${CATEGORY[category].label()}“ eröffnen`, `Start a topic in “${CATEGORY[category].label()}”`) : t("Neues Thema", "New topic")}
                        </button>
                        {filtered && (
                          <button className="btn" onClick={reset}>
                            {t("Alles zeigen", "Show everything")}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <ul className="divide-y divide-line">
                      {list.topics.map((x) => (
                        <li key={x.id}>
                          <TopicRow topic={x} terms={terms} here={variant.id} onOpen={() => setOpen(x.id)} />
                        </li>
                      ))}
                    </ul>
                  )}

                  {list.hasMore && (
                    <div className="mt-2 border-t border-line pt-5 text-center">
                      <button
                        className="btn"
                        disabled={loadingMore}
                        onClick={async () => {
                          setLoadingMore(true);
                          await load(list.topics.length);
                          setLoadingMore(false);
                        }}
                      >
                        {t("Weitere Themen laden", "Load more topics")}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </Columns>
        )}
      </Section>
    </div>
  );
}

/** The forum's frame in every view: a narrow column for finding one's way, the content beside it (below lg: content only). */
function Columns({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  return (
    <div className="gap-12 lg:flex">
      <aside className="hidden w-[236px] shrink-0 lg:block">{rail}</aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Way back to the overview: first entry of the side column, a line above the content on narrow screens. */
function Back({ onClick, rail }: { onClick: () => void; rail?: boolean }) {
  return (
    <button
      className={cn("items-center gap-1.5 text-[14.5px] text-muted transition-colors hover:text-ink", rail ? "flex w-full rounded-box px-2 py-2 hover:bg-panel-2" : "mb-6 inline-flex lg:hidden")}
      onClick={onClick}
    >
      <ChevronLeft className="size-4" /> {t("Alle Themen", "All topics")}
    </button>
  );
}

/** One area in the list beside the topics, with the number of topics in it. */
function AreaLink({ active, count, onClick, title, children }: { active: boolean; count: number; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-baseline justify-between gap-3 rounded-r-[3px] border-l-2 px-3 py-2 text-left text-[14.5px] transition-colors",
        active ? "border-accent bg-panel-2 text-ink" : "border-transparent text-muted hover:bg-panel-2 hover:text-ink",
      )}
    >
      <span>{children}</span>
      {count > 0 && <span className={cn("text-[13px] tabular-nums", active ? "text-muted" : "text-faint")}>{num(count)}</span>}
    </button>
  );
}

function SortMenu({ value, onChange }: { value: ForumSort; onChange: (s: ForumSort) => void }) {
  return (
    <select className="pill-select" value={value} onChange={(e) => onChange(e.target.value as ForumSort)} aria-label={t("Reihenfolge", "Order")}>
      {FORUM_SORTS.map((s) => (
        <option key={s} value={s}>
          {SORT_LABEL[s]()}
        </option>
      ))}
    </select>
  );
}

/** Takes in the topics of the sister variants of the model line. */
function WholeLine({ checked, onChange, others, compact }: { checked: boolean; onChange: (v: boolean) => void; others: number; compact?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-[13.5px] text-muted hover:text-ink", compact && "items-center")}>
      <input type="checkbox" className={cn("size-4 shrink-0 accent-accent", !compact && "mt-0.5")} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {t("Ganze Baureihe zeigen", "Show the whole model line")}
        {!compact && (
          <span className="block text-[12.5px] text-faint">
            {others === 1 ? t("auch die Themen der Schwestervariante", "including the topics of the sister variant") : t(`auch die Themen der ${others} anderen Varianten`, `including the topics of the ${others} other variants`)}
          </span>
        )}
      </span>
    </label>
  );
}

function TopicRow({ topic: x, terms, here, onOpen }: { topic: Topic; terms: string[]; here: string; onOpen: () => void }) {
  const other = x.variant !== here ? variantById.get(x.variant) : undefined;
  const n = Math.max(0, x.posts - 1);
  return (
    <button className="group -mx-3 flex w-[calc(100%+1.5rem)] items-start gap-4 rounded-box px-3 py-5 text-left transition-colors hover:bg-panel-2" onClick={onOpen}>
      <TopicMark kind={x.kind} solved={x.solved} />
      <span className="block min-w-0 flex-1">
        <span className="block font-display text-[19px] leading-snug text-ink decoration-line-2 underline-offset-4 group-hover:underline">
          <Marked text={x.title} terms={terms} />
        </span>
        {x.excerpt && (
          <span className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-muted">
            <Marked text={x.excerpt} terms={terms} />
          </span>
        )}
        <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-faint">
          {x.kind === "frage" && <span className={x.solved ? "text-up" : "text-gold"}>{x.solved ? t("Geklärt", "Answered") : t("Offene Frage", "Open question")}</span>}
          <span className="rounded-full bg-panel-3 px-2 py-0.5 text-muted">{CATEGORY[x.category]?.label() ?? x.category}</span>
          {other && <span>{variantTitle(other, { brand: false })}</span>}
          <span>
            <Author name={x.username} owner={x.owner} />, <When iso={x.createdAt} />
          </span>
          <span className="sm:hidden">{n ? replies(n) : t("Noch keine Antwort", "No replies yet")}</span>
        </span>
      </span>
      <span className="hidden w-36 shrink-0 text-right whitespace-nowrap sm:block">
        <span className={cn("block font-display text-[24px] leading-none tabular-nums", n ? "text-ink" : "text-faint")}>{num(n)}</span>
        <span className="mt-1 block text-[12.5px] text-faint">{n === 1 ? t("Antwort", "reply") : t("Antworten", "replies")}</span>
        {n > 0 && (
          <span className="mt-1.5 block text-[12px] text-faint">
            {t("zuletzt", "last")} <When iso={x.lastPostAt} />
          </span>
        )}
      </span>
    </button>
  );
}

/** A choice between two things, each with a sentence that says what it means. */
function KindChoice({ value, onChange }: { value: ForumKind; onChange: (k: ForumKind) => void }) {
  const options: { kind: ForumKind; label: string; text: string }[] = [
    {
      kind: "frage",
      label: t("Frage stellen", "Ask a question"),
      text: t("Sie suchen eine Antwort. Hilft Ihnen eine weiter, markieren Sie sie als Lösung.", "You are looking for an answer. When one helps, you mark it as the solution."),
    },
    {
      kind: "diskussion",
      label: t("Diskussion starten", "Start a discussion"),
      text: t("Sie teilen eine Erfahrung, eine Beobachtung oder eine Meinung.", "You share an experience, an observation or an opinion."),
    },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("Art des Themas", "Kind of topic")}>
      {options.map((o) => (
        <button
          key={o.kind}
          type="button"
          role="radio"
          aria-checked={value === o.kind}
          onClick={() => onChange(o.kind)}
          className={cn("flex items-start gap-3 rounded-card border p-4 text-left transition-colors", value === o.kind ? "border-accent bg-accent-soft" : "border-line hover:border-line-2")}
        >
          <TopicMark kind={o.kind} solved={false} />
          <span>
            <span className="block font-display text-[17px] text-ink">{o.label}</span>
            <span className="mt-0.5 block text-[13.5px] text-muted">{o.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** The area of a topic as buttons, with what belongs there underneath. */
function CategoryPicker({ value, onChange }: { value: ForumCategory; onChange: (c: ForumCategory) => void }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Bereich", "Area")}>
        {FORUM_CATEGORIES.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={value === c} className={cn("chip", value === c && "chip-active")} onClick={() => onChange(c)}>
            {CATEGORY[c].label()}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-faint">{CATEGORY[value].hint()}</p>
    </div>
  );
}

function NewTopic({ variant, category: startCategory, onCancel, onDone }: { variant: Variant; category: ForumCategory; onCancel: () => void; onDone: (id: string) => void }) {
  const [category, setCategory] = useState(startCategory);
  const [kind, setKind] = useState<ForumKind>("frage");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const question = kind === "frage";
  const ready = title.trim().length >= 3 && body.trim().length >= 2;
  const step = "mb-2 block font-display text-[17px] text-ink";
  const tips = [
    t("Ein Thema je Frage. Der Titel sagt, worum es geht.", "One topic per question. The title says what it is about."),
    t("Nennen Sie Baujahr, Laufleistung und Zustand.", "Give the model year, mileage and condition."),
    t("Schreiben Sie dazu, was Sie schon geprüft haben.", "Add what you have already checked."),
  ];
  return (
    <Columns
      rail={
        <>
          <Back rail onClick={onCancel} />
          <div className="mt-4 border-t border-line px-2 pt-4">
            <div className="text-[13px] text-faint">{t("So bekommen Sie gute Antworten", "How to get good answers")}</div>
            <ul className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-muted">
              {tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </>
      }
    >
      <div className="max-w-3xl">
        <Back onClick={onCancel} />
        <h3 className="font-display text-[26px] leading-tight">{t(`Neues Thema zum ${variantTitle(variant, { brand: false })}`, `New topic on the ${variantTitle(variant, { brand: false })}`)}</h3>
        <form
          className="mt-7 space-y-8"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr("");
            try {
              const { id } = await api<{ id: string }>(`/api/forum/${variant.id}`, json("POST", { title, body, category, kind }));
              onDone(id);
            } catch (e) {
              setErr(errText(e));
              setBusy(false);
            }
          }}
        >
          <div>
            <span className={step}>{t("Was möchten Sie tun?", "What would you like to do?")}</span>
            <KindChoice value={kind} onChange={setKind} />
          </div>
          <div>
            <span className={step}>{t("In welchen Bereich gehört es?", "Which area does it belong to?")}</span>
            <CategoryPicker value={category} onChange={setCategory} />
          </div>
          <div>
            <label className={step} htmlFor="forum-title">
              {question ? t("Ihre Frage in einem Satz", "Your question in one sentence") : t("Titel", "Title")}
            </label>
            <input
              id="forum-title"
              className="input py-2.5 text-[15px]"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={question ? t("z. B. Worauf beim Kettenspanner achten?", "e.g. What to check on the chain tensioner?") : t("z. B. Erfahrungen mit dem Kettenspanner-Update", "e.g. Experience with the chain tensioner update")}
              autoFocus
            />
          </div>
          <div>
            <label className={step} htmlFor="forum-body">
              {question ? t("Einzelheiten", "Details") : t("Ihr Beitrag", "Your post")}
            </label>
            <textarea
              id="forum-body"
              className="input min-h-40 text-[15px] leading-relaxed"
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={question ? t("Baujahr, Laufleistung, was Sie schon wissen oder geprüft haben", "Model year, mileage, what you already know or have checked") : ""}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
            <button type="submit" className="btn btn-gold" disabled={busy || !ready}>
              {t("Thema veröffentlichen", "Publish topic")}
            </button>
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              {t("Abbrechen", "Cancel")}
            </button>
            {err && <span className="text-[13.5px] text-down">{err}</span>}
          </div>
        </form>
      </div>
    </Columns>
  );
}

function ThreadView({ id, here, onBack }: { id: string; here: string; onBack: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [reporting, setReporting] = useState<{ id: string; reason: string } | null>(null);
  const { guest } = usePlan(); // a guest reads, without reply form and report buttons
  const [filing, setFiling] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  // another topic opened (?thema= changed) while this one was loading: drop the late answer
  const current = useRef(id);
  current.current = id;
  const load = () =>
    api<Thread>(`/api/forum/thema/${id}`)
      .then((x) => current.current === id && (setThread(x), setError(false)))
      .catch(() => current.current === id && setError(true));
  useEffect(() => {
    setThread(null);
    setEditing(null);
    setReporting(null);
    setFiling(false);
    load();
  }, [id]);

  async function hide(postId: string) {
    if (!(await confirm(t("Diesen Beitrag entfernen?", "Remove this post?"), { confirmLabel: t("Entfernen", "Remove") }))) return;
    await api(`/api/forum/beitrag/${postId}/ausblenden`, { method: "POST" }).catch(() => {});
    load();
  }
  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    try {
      await api(`/api/forum/beitrag/${editing.id}`, json("PUT", { body: editing.body }));
      setEditing(null);
      await load();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }
  async function sendReport() {
    if (!reporting) return;
    setBusy(true);
    await api(`/api/forum/beitrag/${reporting.id}/melden`, json("POST", { reason: reporting.reason })).catch(() => {});
    setReporting(null);
    setBusy(false);
    await load();
  }
  /** Marks the reply as the answer to the question, or takes the mark away (null). */
  async function solve(post: string | null) {
    await api(`/api/forum/thema/${id}/loesung`, json("POST", { post })).catch(() => {});
    load();
  }
  /** Files the topic in another area or changes question / discussion. */
  async function file(change: { category?: ForumCategory; kind?: ForumKind }) {
    await api(`/api/forum/thema/${id}`, json("PUT", change)).catch(() => {});
    load();
  }

  const topic = thread?.topic;
  const elsewhere = topic && topic.variant !== here ? variantById.get(topic.variant) : undefined;
  const solution = thread?.posts.find((p) => p.id === topic?.solvedPost);
  const answers = thread ? thread.posts.slice(1) : [];
  const shown = answers.filter((p) => p.body != null).length;

  const renderPost = (p: Post, first: boolean) => {
    if (!topic || !thread) return null;
    const isSolution = p.id === topic.solvedPost;
    const canSolve = topic.canEdit && topic.kind === "frage" && !first && p.body != null;
    return (
      <div id={`beitrag-${p.id}`} className="flex scroll-mt-[150px] gap-4">
        <Avatar name={p.username} dim={p.body == null} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13px] text-faint">
            <span className="text-[14.5px]">
              <Author name={p.username} owner={p.owner} />
            </span>
            <When iso={p.createdAt} />
            {p.editedAt && <span title={exact(p.editedAt)}>{t("bearbeitet", "edited")}</span>}
            {isSolution && (
              <span className="inline-flex items-center gap-1 text-up">
                <Check className="size-3.5" strokeWidth={2} /> {t("Lösung", "Solution")}
              </span>
            )}
            {thread.admin && !!p.reports && (
              <span className="inline-flex items-center gap-1 text-down">
                <Flag className="size-3" /> {p.reports === 1 ? t("1 Meldung", "1 report") : t(`${p.reports} Meldungen`, `${p.reports} reports`)}
              </span>
            )}
          </div>

          {editing?.id === p.id ? (
            <div className="mt-2 space-y-2">
              <textarea className="input min-h-28 text-[15px] leading-relaxed" maxLength={5000} value={editing.body} onChange={(e) => setEditing({ id: p.id, body: e.target.value })} autoFocus />
              <div className="flex gap-2">
                <button className="btn btn-gold text-[13px]" onClick={saveEdit} disabled={busy || editing.body.trim().length < 2}>
                  {t("Speichern", "Save")}
                </button>
                <button className="btn text-[13px]" onClick={() => setEditing(null)} disabled={busy}>
                  {t("Abbrechen", "Cancel")}
                </button>
              </div>
            </div>
          ) : p.body == null ? (
            <p className="mt-1 text-[14px] text-faint italic">{t("Dieser Beitrag wurde entfernt.", "This post was removed.")}</p>
          ) : (
            <p className={cn("mt-1.5 max-w-[68ch] leading-relaxed break-words whitespace-pre-wrap", first ? "text-[16px]" : "text-[15px]")}>{p.body}</p>
          )}

          {p.body != null && editing?.id !== p.id && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-faint">
              {canSolve && !topic.solvedPost && (
                <button className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1 text-ink transition-colors hover:border-up hover:text-up" onClick={() => solve(p.id)}>
                  <Check className="size-3.5" strokeWidth={2} /> {t("Als Lösung markieren", "Mark as solution")}
                </button>
              )}
              {canSolve && isSolution && (
                <button className="hover:text-ink" onClick={() => solve(null)}>
                  {t("Doch nicht die Lösung", "Not the solution after all")}
                </button>
              )}
              {p.mine && (
                <button className="hover:text-ink" onClick={() => setEditing({ id: p.id, body: p.body! })}>
                  {t("Bearbeiten", "Edit")}
                </button>
              )}
              {p.canHide && (
                <button className="hover:text-down" onClick={() => hide(p.id)}>
                  {p.mine ? t("Löschen", "Delete") : t("Ausblenden", "Hide")}
                </button>
              )}
              {!p.mine &&
                !guest &&
                (p.reported ? (
                  <span>{t("Gemeldet", "Reported")}</span>
                ) : (
                  <button className="hover:text-down" onClick={() => setReporting({ id: p.id, reason: "" })}>
                    {t("Melden", "Report")}
                  </button>
                ))}
            </div>
          )}

          {reporting?.id === p.id && (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-box border border-line bg-panel-2 p-3">
              <div className="min-w-0 flex-1">
                <label className="label" htmlFor={`report-${p.id}`}>
                  {t("Was stimmt mit dem Beitrag nicht? (optional)", "What is wrong with this post? (optional)")}
                </label>
                <input id={`report-${p.id}`} className="input" maxLength={500} value={reporting.reason} onChange={(e) => setReporting({ id: p.id, reason: e.target.value })} autoFocus />
              </div>
              <button className="btn text-[13px]" onClick={sendReport} disabled={busy}>
                <Flag className="size-3.5" /> {t("An Prüfer melden", "Report to reviewers")}
              </button>
              <button className="btn btn-ghost text-[13px]" onClick={() => setReporting(null)}>
                {t("Abbrechen", "Cancel")}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const last = answers.filter((p) => p.body != null).at(-1);
  const fact = "flex items-baseline justify-between gap-3 py-1.5";
  return (
    <Columns
      rail={
        <>
          <Back rail onClick={onBack} />
          {thread && topic && (
            <div className="mt-4 border-t border-line px-2 pt-3 text-[13.5px]">
              <dl>
                <div className={fact}>
                  <dt className="text-faint">{t("Gestartet", "Started")}</dt>
                  <dd className="text-right text-muted">
                    <When iso={topic.createdAt} />
                  </dd>
                </div>
                <div className={fact}>
                  <dt className="text-faint">{t("Antworten", "Replies")}</dt>
                  <dd className="text-right text-muted tabular-nums">{num(shown)}</dd>
                </div>
                {last && (
                  <div className={fact}>
                    <dt className="text-faint">{t("Letzte Antwort", "Last reply")}</dt>
                    <dd className="text-right text-muted">
                      <When iso={last.createdAt} />
                    </dd>
                  </div>
                )}
              </dl>
              {topic.canEdit && topic.kind === "frage" && !topic.solvedPost && shown > 0 && (
                <p className="mt-4 rounded-card bg-gold-soft p-3 text-[13px] leading-relaxed text-ink">
                  {t("Hilft Ihnen eine Antwort weiter? Markieren Sie sie als Lösung, dann gilt die Frage als geklärt.", "Does a reply help? Mark it as the solution and the question counts as answered.")}
                </p>
              )}
            </div>
          )}
        </>
      }
    >
      <div className="max-w-3xl">
        {confirmDialog}
        <Back onClick={onBack} />
        {error && <p className="text-[14px] text-down">{t("Das Thema konnte nicht geladen werden.", "The topic could not be loaded.")}</p>}
        {!thread && !error && <p className="text-[14px] text-faint">{t("Thema wird geladen …", "Loading the topic …")}</p>}
        {thread && topic && (
          <>
            <header>
              <div className="flex items-center gap-3">
                <TopicMark kind={topic.kind} solved={Boolean(topic.solvedPost)} />
                <p className="text-[13.5px] text-muted">
                  <span className={topic.solvedPost ? "text-up" : topic.kind === "frage" ? "text-gold" : undefined}>{stateLabel(topic.kind, Boolean(topic.solvedPost))}</span>{" "}
                  {t(`in ${CATEGORY[topic.category]?.label() ?? topic.category}`, `in ${CATEGORY[topic.category]?.label() ?? topic.category}`)}
                  {elsewhere && <span className="text-faint">, {variantTitle(elsewhere, { brand: false })}</span>}
                </p>
              </div>
              <h3 className="mt-3 font-display text-[28px] leading-tight sm:text-[32px]">{topic.title}</h3>
              {(topic.canEdit || thread.admin) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-faint">
                  {topic.canEdit && !filing && (
                    <button className="hover:text-ink" onClick={() => setFiling(true)}>
                      {t("Bereich oder Art ändern", "Change area or kind")}
                    </button>
                  )}
                  {topic.canEdit && filing && (
                    <>
                      <select className="pill-select" value={topic.category} onChange={(e) => file({ category: e.target.value as ForumCategory })} aria-label={t("Bereich", "Area")}>
                        {FORUM_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY[c].label()}
                          </option>
                        ))}
                      </select>
                      <select className="pill-select" value={topic.kind} onChange={(e) => file({ kind: e.target.value as ForumKind })} aria-label={t("Art des Themas", "Kind of topic")}>
                        <option value="frage">{t("Frage", "Question")}</option>
                        <option value="diskussion">{t("Diskussion", "Discussion")}</option>
                      </select>
                      <button className="hover:text-ink" onClick={() => setFiling(false)}>
                        {t("Fertig", "Done")}
                      </button>
                    </>
                  )}
                  {thread.admin && (
                    <button
                      className="hover:text-down"
                      onClick={async () => {
                        if (!(await confirm(t("Ganzes Thema ausblenden?", "Hide the whole topic?"), { confirmLabel: t("Ausblenden", "Hide") }))) return;
                        await api(`/api/forum/thema/${id}/ausblenden`, { method: "POST" }).catch(() => {});
                        onBack();
                      }}
                    >
                      {t("Thema ausblenden", "Hide topic")}
                    </button>
                  )}
                </div>
              )}
            </header>

            {/* the opening post: the question, or what the discussion starts from */}
            {thread.posts[0] && <div className="mt-6 rounded-card border border-line bg-panel p-5 sm:p-6">{renderPost(thread.posts[0], true)}</div>}

            {solution && (
              <button
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-up-soft px-3.5 py-1.5 text-[13.5px] text-up hover:underline"
                onClick={() => document.getElementById(`beitrag-${solution.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <Check className="size-4" strokeWidth={2} /> {solution.username ? t(`Zur Lösung von ${solution.username}`, `Go to the solution by ${solution.username}`) : t("Zur Lösung", "Go to the solution")}
              </button>
            )}

            <h4 className="mt-10 border-b border-line pb-3 font-display text-[19px]">{shown ? replies(shown) : t("Noch keine Antwort", "No replies yet")}</h4>
            {answers.length > 0 && (
              <ol className="mt-3">
                {answers.map((p) => (
                  // the same inset as the opening post, so every author sits on one line down the page
                  <li key={p.id} className={cn("px-5 py-4 sm:px-6", p.id === topic.solvedPost && "my-2 rounded-card bg-up-soft py-5")}>
                    {renderPost(p, false)}
                  </li>
                ))}
              </ol>
            )}

            {guest ? (
              <div className={cn("mt-8 rounded-card border border-dashed border-line-2 px-6 py-7 text-center", answers.length > 0 && "mt-10")}>
                <div className="font-display text-[18px]">{t("Antworten Sie mit kostenlosem Konto.", "Reply with a free account.")}</div>
                <p className="mx-auto mt-1.5 max-w-md text-[14px] text-muted">{t("Lesen geht ohne Konto. Zum Schreiben melden Sie sich an, dann sehen Sie auch, wer geschrieben hat.", "Reading works without an account. To write, sign in; you then also see who wrote.")}</p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <a className="btn btn-gold" href={signInHref(true)}>
                    {t("Konto anlegen", "Create an account")}
                  </a>
                  <a className="btn" href={signInHref(false)}>
                    {t("Anmelden", "Sign in")}
                  </a>
                </div>
              </div>
            ) : (
            <form
              className={cn("mt-8", answers.length > 0 && "border-t border-line pt-8")}
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setErr("");
                try {
                  await api(`/api/forum/thema/${id}`, json("POST", { body: reply }));
                  setReply("");
                  await load();
                } catch (e) {
                  setErr(errText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="mb-2 block font-display text-[17px]" htmlFor="forum-reply">
                {t("Ihre Antwort", "Your reply")}
              </label>
              <textarea
                id="forum-reply"
                className="input min-h-32 text-[15px] leading-relaxed"
                maxLength={5000}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={shown ? "" : t("Schreiben Sie die erste Antwort.", "Write the first reply.")}
              />
              <div className="mt-3 flex items-center gap-3">
                <button type="submit" className="btn btn-gold" disabled={busy || reply.trim().length < 2}>
                  {t("Antwort senden", "Send reply")}
                </button>
                {err && <span className="text-[13.5px] text-down">{err}</span>}
              </div>
            </form>
            )}
          </>
        )}
      </div>
    </Columns>
  );
}
