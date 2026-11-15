import { useEffect, useState } from "react";
import { BadgeCheck, ChevronLeft, MessageSquare } from "lucide-react";
import type { Variant } from "../../data/types";
import { variantTitle } from "../../data/db";
import { cn, num } from "../../lib/format";
import { locale, t } from "../../i18n";
import { Section } from "../ui";
import { api } from "../../lib/userCars";

/** Forum of one variant at the bottom of its page (server/forum.ts): topics, then one topic with its replies. */

type Topic = { id: string; title: string; username: string; owner: boolean; createdAt: string; lastPostAt: string; posts: number; excerpt: string | null };
type Post = { id: string; username: string; owner: boolean; createdAt: string; body: string | null; mine: boolean; canHide: boolean };
type Thread = { topic: { id: string; title: string; username: string; createdAt: string }; posts: Post[]; admin: boolean };

const when = (iso: string) =>
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
        <span className="inline-flex items-center gap-0.5 text-[12px] text-up" title={t("Besitzt diese Variante, Kaufvertrag geprüft", "Owns this variant, purchase contract checked")}>
          <BadgeCheck className="size-3.5" strokeWidth={1.6} /> {t("Besitzer", "Owner")}
        </span>
      )}
    </span>
  );
}

export function Forum({ variant }: { variant: Variant }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  const load = () =>
    api<{ topics: Topic[] }>(`/api/forum/${variant.id}`)
      .then((j) => (setTopics(j.topics), setError(false)))
      .catch(() => setError(true));
  useEffect(() => {
    setTopics(null);
    setOpen(null);
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
  const load = () =>
    api<Thread>(`/api/forum/thema/${id}`)
      .then(setThread)
      .catch(() => setError(true));
  useEffect(() => {
    load();
  }, [id]);

  async function hide(postId: string) {
    if (!confirm(t("Diesen Beitrag entfernen?", "Remove this post?"))) return;
    await api(`/api/forum/beitrag/${postId}/ausblenden`, { method: "POST" }).catch(() => {});
    load();
  }

  return (
    <div>
      <button className="mb-4 inline-flex items-center gap-1 text-[14px] text-muted hover:text-ink" onClick={onBack}>
        <ChevronLeft className="size-4" /> {t("Alle Themen", "All topics")}
      </button>
      {error && <p className="text-[14px] text-down">{t("Das Thema konnte nicht geladen werden.", "The topic could not be loaded.")}</p>}
      {thread && (
        <>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-serif text-[24px] leading-tight">{thread.topic.title}</h3>
            {thread.admin && (
              <button
                className="text-[12.5px] text-faint hover:text-down"
                onClick={async () => {
                  if (!confirm(t("Ganzes Thema ausblenden?", "Hide the whole topic?"))) return;
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
                  </span>
                  {p.canHide && (
                    <button className="hover:text-down" onClick={() => hide(p.id)}>
                      {p.mine ? t("Löschen", "Delete") : t("Ausblenden", "Hide")}
                    </button>
                  )}
                </div>
                {p.body == null ? (
                  <p className="mt-1 text-[14px] text-faint italic">{t("Beitrag entfernt.", "Post removed.")}</p>
                ) : (
                  <p className="mt-1 text-[15px] break-words whitespace-pre-wrap">{p.body}</p>
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
