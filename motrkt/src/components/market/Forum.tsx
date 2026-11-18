import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BadgeCheck, ChevronLeft, Flag, MessageSquare } from "lucide-react";
import type { Variant } from "../../data/types";
import { variantTitle } from "../../data/db";
import { cn, num } from "../../lib/format";
import { locale, t } from "../../i18n";
import { Section, useConfirm } from "../ui";
import { api } from "../../lib/userCars";

/**
 * Forum of one variant at the bottom of its page (server/forum.ts): topics (a page at a time), then one topic with
 * its replies. `?thema=<id>` in the URL opens that topic (links from the forum overview and the search).
 */

export type Topic = { id: string; title: string; username: string; owner: boolean; createdAt: string; lastPostAt: string; posts: number; excerpt: string | null };
type Post = { id: string; username: string; owner: boolean; createdAt: string; editedAt: string | null; body: string | null; mine: boolean; canHide: boolean; reported: boolean; reports?: number };
type Thread = { topic: { id: string; title: string; username: string; createdAt: string }; posts: Post[]; admin: boolean };

export const when = (iso: string) =>
  new Date(iso).toLocaleString(locale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const ERR: Record<string, () => string> = {
  title: () => t("Bitte einen Titel mit 3 bis 120 Zeichen eingeben.", "Please enter a title of 3 to 120 characters."),
  body: () => t("Bitte einen Text eingeben (höchstens 5.000 Zeichen).", "Please enter a text (at most 5,000 characters)."),
  too_many: () => t("Sie haben in der letzten Stunde schon viel geschrieben. Bitte später weiter.", "You have posted a lot in the last hour. Please continue later."),
};
const errText = (e: unknown) => (ERR[(e as Error).message] ?? (() => t("Senden fehlgeschlagen.", "Sending failed.")))();

function Author({ name, owner }: { name: string; owner: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-ink">
      {name}
      {owner && (
        <span className="inline-flex items-center gap-0.5 text-[12px] text-up" title={t("Besitzt diese Variante, Kaufvertrag oder Wertgutachten geprüft", "Owns this variant, purchase contract or appraisal checked")}>
          <BadgeCheck className="size-3.5" strokeWidth={1.6} /> {t("Besitzer", "Owner")}
        </span>
      )}
    </span>
  );
}

export function Forum({ variant }: { variant: Variant }) {
  const [params, setParams] = useSearchParams();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const open = params.get("thema");
  const [writing, setWriting] = useState(false);
  const setOpen = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set("thema", id);
    else p.delete("thema");
    setParams(p, { replace: true });
  };

  const load = (offset = 0) =>
    api<{ topics: Topic[]; hasMore: boolean }>(`/api/forum/${variant.id}?offset=${offset}`)
      .then((j) => {
        // topics move up when someone posts: the next page can repeat one already shown
        setTopics((prev) => (offset && prev ? [...prev, ...j.topics.filter((x) => !prev.some((o) => o.id === x.id))] : j.topics));
        setHasMore(j.hasMore);
        setError(false);
      })
      .catch(() => setError(true));
  useEffect(() => {
    setTopics(null);
    setWriting(false);
    load();
  }, [variant.id]);

  return (
    <Section
      title={t("Forum", "Forum")}
      sub={t(`Austausch unter Besitzern und Kennern des ${variantTitle(variant)}`, `Owners and enthusiasts discuss the ${variantTitle(variant)}`)}
      actions={
        !open &&
        !writing && (
          <button className="btn" onClick={() => setWriting(true)}>
            {t("Neues Thema", "New topic")}
          </button>
        )
      }
    >
      {open ? (
        <ThreadView id={open} onBack={() => (setOpen(null), load())} />
      ) : (
        <>
          {writing && (
            <NewTopic
              variant={variant}
              onCancel={() => setWriting(false)}
              onDone={(id) => {
                setWriting(false);
                setOpen(id);
              }}
            />
          )}
          {error && <p className="text-[14px] text-down">{t("Das Forum konnte nicht geladen werden.", "The forum could not be loaded.")}</p>}
          {!topics && !error && <p className="text-[14px] text-faint">{t("Themen werden geladen …", "Loading topics …")}</p>}
          {topics && !topics.length && !writing && (
            <p className="text-[14px] text-muted">
              {t("Noch keine Themen. Stellen Sie die erste Frage oder teilen Sie Ihre Erfahrung.", "No topics yet. Ask the first question or share your experience.")}
            </p>
          )}
          {!!topics?.length && (
            <ul className="divide-y divide-line border-y border-line">
              {topics.map((x) => (
                <li key={x.id}>
                  <button className="group flex w-full items-start gap-4 py-4 text-left" onClick={() => setOpen(x.id)}>
                    <div className="min-w-0 flex-1">
                      <div className="font-serif text-[18px] group-hover:underline">{x.title}</div>
                      {x.excerpt && <p className="mt-0.5 line-clamp-2 text-[14px] text-muted">{x.excerpt}</p>}
                      <div className="mt-1 text-[12.5px] text-faint">
                        <Author name={x.username} owner={x.owner} /> · {when(x.createdAt)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[12.5px] text-muted">
                      <div className="inline-flex items-center gap-1">
                        <MessageSquare className="size-3.5" strokeWidth={1.5} /> {num(Math.max(0, x.posts - 1))}
                      </div>
                      <div className="text-faint">{when(x.lastPostAt)}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasMore && topics && (
            <div className="mt-4 text-center">
              <button
                className="btn"
                disabled={loadingMore}
                onClick={async () => {
                  setLoadingMore(true);
                  await load(topics.length);
                  setLoadingMore(false);
                }}
              >
                {t("Weitere Themen", "More topics")}
              </button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function NewTopic({ variant, onCancel, onDone }: { variant: Variant; onCancel: () => void; onDone: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <form
      className="panel mb-6 space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          const { id } = await api<{ id: string }>(`/api/forum/${variant.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, body }),
          });
          onDone(id);
        } catch (e) {
          setErr(errText(e));
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="forum-title">
          {t("Titel", "Title")}
        </label>
        <input id="forum-title" className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("z. B. Erfahrungen mit dem Kettenspanner-Update", "e.g. Experience with the chain tensioner update")} />
      </div>
      <div>
        <label className="label" htmlFor="forum-body">
          {t("Beitrag", "Post")}
        </label>
        <textarea id="forum-body" className="input min-h-28" maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-gold" disabled={busy}>
          {t("Thema eröffnen", "Start topic")}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {t("Abbrechen", "Cancel")}
        </button>
        {err && <span className="text-[13px] text-down">{err}</span>}
      </div>
    </form>
  );
}

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [reporting, setReporting] = useState<{ id: string; reason: string } | null>(null);
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
      await api(`/api/forum/beitrag/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: editing.body }) });
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
    await api(`/api/forum/beitrag/${reporting.id}/melden`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reporting.reason }) }).catch(() => {});
    setReporting(null);
    setBusy(false);
    await load();
  }

  return (
    <div>
      {confirmDialog}
      <button className="mb-4 inline-flex items-center gap-1 text-[14px] text-muted hover:text-ink" onClick={onBack}>
        <ChevronLeft className="size-4" /> {t("Alle Themen", "All topics")}
      </button>
      {error && <p className="text-[14px] text-down">{t("Das Thema konnte nicht geladen werden.", "The topic could not be loaded.")}</p>}
      {!thread && !error && <p className="text-[14px] text-faint">{t("Wird geladen …", "Loading …")}</p>}
      {thread && (
        <>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-serif text-[24px] leading-tight">{thread.topic.title}</h3>
            {thread.admin && (
              <button
                className="text-[12.5px] text-faint hover:text-down"
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
          <ol className="divide-y divide-line border-y border-line">
            {thread.posts.map((p) => (
              <li key={p.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px] text-faint">
                  <span>
                    <Author name={p.username} owner={p.owner} /> · {when(p.createdAt)}
                    {p.editedAt && <span title={when(p.editedAt)}> · {t("bearbeitet", "edited")}</span>}
                    {thread.admin && !!p.reports && (
                      <span className="ml-2 inline-flex items-center gap-1 text-down">
                        <Flag className="size-3" /> {p.reports === 1 ? t("1 Meldung", "1 report") : t(`${p.reports} Meldungen`, `${p.reports} reports`)}
                      </span>
                    )}
                  </span>
                  <span className="flex gap-3">
                    {p.mine && p.body != null && (
                      <button className="hover:text-ink" onClick={() => setEditing({ id: p.id, body: p.body! })}>
                        {t("Bearbeiten", "Edit")}
                      </button>
                    )}
                    {!p.mine && p.body != null && (
                      p.reported ? (
                        <span>{t("Gemeldet", "Reported")}</span>
                      ) : (
                        <button className="hover:text-down" onClick={() => setReporting({ id: p.id, reason: "" })}>
                          {t("Melden", "Report")}
                        </button>
                      )
                    )}
                    {p.canHide && (
                      <button className="hover:text-down" onClick={() => hide(p.id)}>
                        {p.mine ? t("Löschen", "Delete") : t("Ausblenden", "Hide")}
                      </button>
                    )}
                  </span>
                </div>
                {editing?.id === p.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea className="input min-h-24" maxLength={5000} value={editing.body} onChange={(e) => setEditing({ id: p.id, body: e.target.value })} autoFocus />
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
                  <p className="mt-1 text-[14px] text-faint italic">{t("Beitrag entfernt.", "Post removed.")}</p>
                ) : (
                  <p className="mt-1 text-[15px] break-words whitespace-pre-wrap">{p.body}</p>
                )}
                {reporting?.id === p.id && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 rounded-[3px] border border-line bg-panel-2 p-3">
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
              </li>
            ))}
          </ol>
          <form
            className="mt-5 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr("");
              try {
                await api(`/api/forum/thema/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: reply }) });
                setReply("");
                await load();
              } catch (e) {
                setErr(errText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="label" htmlFor="forum-reply">
              {t("Antworten", "Reply")}
            </label>
            <textarea id="forum-reply" className="input min-h-24" maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} />
            <div className="flex items-center gap-3">
              <button type="submit" className={cn("btn btn-gold")} disabled={busy || reply.trim().length < 2}>
                {t("Antwort senden", "Send reply")}
              </button>
              {err && <span className="text-[13px] text-down">{err}</span>}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
