import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import variantIds from "../scripts/market/variant_ids.json" with { type: "json" };
import { readText } from "./body.ts";
import { currentUser, isAdmin } from "./auth.ts";
import { db } from "./db.ts";
import { FORUM_CATEGORIES, FORUM_KINDS, FORUM_SORTS, FORUM_STATUS, oneOf } from "../src/lib/forumShared.ts";

/**
 * Forum per variant (db/migrations/005_forum.sql, 012_forum_structure.sql), shown at the bottom of each model page.
 * Everyone reads, guests too, but a guest sees no usernames (the authors wrote for members, not for the open web);
 * signed-in users write, report and see the names. A user whose own car of this variant was approved with its contract or appraisal
 * (user_cars) is marked as a verified owner. Every topic sits in a category and is a question or a discussion; the
 * author of a question (or a reviewer) marks the reply that answered it. Authors remove their own posts, reviewers
 * (MIP_ADMINS) hide posts and topics; rows stay in the database (hidden_at), nothing is deleted.
 *
 *   GET  /api/forum/neueste?limit=20              latest topics across all variants (site search)
 *   GET  /api/forum/meldungen                     reviewers: reported posts
 *   GET  /api/forum/:variant                      topics, PAGE at a time (hasMore), with the number per category.
 *        ?offset=0
 *        &q=kettenspanner                         every word must be in the title or in a post
 *        &kategorie=technik                       one of FORUM_CATEGORIES
 *        &status=offen                            FORUM_STATUS: open or answered questions, without reply, by
 *                                                 verified owners, with posts of the reader
 *        &sortierung=aktiv                        FORUM_SORTS: latest activity, newest topic, most replies
 *        &mit=<variant>,<variant>                 also the topics of these variants (the whole model line)
 *   POST /api/forum/:variant                      { title, body, category, kind } -> new topic with its first post
 *   GET  /api/forum/thema/:id                     the topic and its posts
 *   POST /api/forum/thema/:id                     { body } -> reply
 *   PUT  /api/forum/thema/:id                     author or reviewer: { category?, kind? } -> file the topic elsewhere
 *   POST /api/forum/thema/:id/loesung             author or reviewer: { post: id | null } -> the reply that answered it
 *   POST /api/forum/thema/:id/ausblenden          reviewers: hide the topic
 *   PUT  /api/forum/beitrag/:id                   author: { body } -> edit the post
 *   POST /api/forum/beitrag/:id/ausblenden        author or reviewer: hide the post
 *   POST /api/forum/beitrag/:id/melden            { reason } -> report the post to the reviewers
 */

const VARIANTS = new Set((variantIds as [string, string][]).map(([id]) => id));
const TITLE = [3, 120] as const;
const BODY = [2, 5000] as const;
const MAX_POSTS_HOUR = 30;
const MAX_TOPICS_HOUR = 5;
const PAGE = 30;
const REASON = [0, 500] as const;
const MAX_TERMS = 5;
const MAX_SCOPE = 80; // variants read together (?mit=): a model line has far fewer
const EXCERPT = 220;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

const sameOrigin = (req: IncomingMessage) => {
  const origin = req.headers.origin;
  return !origin || origin.replace(/^https?:\/\//, "") === req.headers.host;
};

/** Trimmed text with runs of blank lines collapsed, or null when its length is outside [min, max]. */
function text(v: unknown, [min, max]: readonly [number, number]) {
  if (typeof v !== "string") return null;
  const s = v.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s.length >= min && s.length <= max ? s : null;
}

const hasUserCars = async () => (await db()<{ ok: boolean }[]>`select to_regclass('user_cars') is not null as ok`)[0].ok;

const ownerKey = (variant: string, userId: string) => `${variant}\n${userId}`;
/** Users with an approved car of one of these variants (purchase contract or appraisal checked), as ownerKey(variant, user). */
async function verifiedOwners(variants: string[]): Promise<Set<string>> {
  if (!(await hasUserCars())) return new Set();
  const rows = await db()<{ user_id: string; variant_id: string }[]>`
    select distinct user_id, variant_id from user_cars where variant_id in ${db()(variants)} and status = 'approved'`;
  return new Set(rows.map((r) => ownerKey(r.variant_id, r.user_id)));
}

/** "%word%" for ilike, with the pattern characters of the word itself escaped. */
const like = (word: string) => `%${word.replace(/[\\%_]/g, "\\$&")}%`;

/** The beginning of a post for the topic list, cut at a word and marked when the post goes on. */
function excerptStart(body: string | null) {
  if (!body || body.length <= EXCERPT) return body;
  const cut = body.slice(0, EXCERPT);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), EXCERPT - 40)).trimEnd() + " …";
}

/** The part of a post around the first search word found in it; its beginning when none is. */
function excerptAround(body: string, terms: string[]) {
  const low = body.toLowerCase();
  let at = -1;
  for (const w of terms) {
    const i = low.indexOf(w.toLowerCase());
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const from = Math.max(0, at - 70);
  const cut = body.slice(from, from + EXCERPT).trim();
  return (from ? "… " : "") + cut + (from + EXCERPT < body.length ? " …" : "");
}

async function tooMany(userId: string) {
  const [{ posts, topics }] = await db()<{ posts: number; topics: number }[]>`
    select (select count(*)::int from forum_posts where user_id = ${userId} and created_at > now() - interval '1 hour') as posts,
           (select count(*)::int from forum_topics where user_id = ${userId} and created_at > now() - interval '1 hour') as topics`;
  return { posts: posts >= MAX_POSTS_HOUR, topics: topics >= MAX_TOPICS_HOUR };
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    const v = JSON.parse((await readText(req, 30_000)) || "{}");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export async function handleForum(req: IncomingMessage, res: ServerResponse, url: URL) {
  const signedIn = await currentUser(req);
  // guests only read: writing, reporting and the reviewers' list need an account
  if (!signedIn && (req.method !== "GET" || url.pathname === "/api/forum/meldungen")) return sendJson(res, 401, { error: "not signed in" });
  if (req.method !== "GET" && !sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
  const user = signedIn ?? { id: "", username: "" }; // a guest owns nothing and has reported nothing
  const admin = signedIn ? isAdmin(signedIn) : false;
  // usernames go to members only; a guest gets "" and the app shows "Mitglied"
  const name = <T extends string | null>(n: T): T => (signedIn || n === null ? n : ("" as T));
  const [, , , a, b, c] = url.pathname.split("/"); // "", "api", "forum", a, b, c

  // ---------------------------------------------------------------- latest topics everywhere
  if (a === "neueste" && !b && req.method === "GET") {
    const limit = Math.max(1, Math.min(200, Math.floor(Number(url.searchParams.get("limit"))) || 20));
    const topics = await db()<{ id: string; variant_id: string; username: string; title: string; category: string; created_at: Date; last_post_at: Date; posts: number; first: string | null }[]>`
      select t.id, t.variant_id, t.username, t.title, t.category, t.created_at, t.last_post_at,
             (select count(*)::int from forum_posts p where p.topic_id = t.id and p.hidden_at is null) as posts,
             (select left(p.body, 220) from forum_posts p where p.topic_id = t.id and p.hidden_at is null order by p.created_at limit 1) as first
      from forum_topics t where t.hidden_at is null order by t.last_post_at desc limit ${limit}`;
    return sendJson(res, 200, {
      topics: topics.map((x) => ({ id: x.id, variant: x.variant_id, title: x.title, category: x.category, username: name(x.username), createdAt: x.created_at, lastPostAt: x.last_post_at, posts: x.posts, excerpt: x.first })),
    });
  }

  // ---------------------------------------------------------------- reported posts (reviewers)
  if (a === "meldungen" && !b && req.method === "GET") {
    if (!admin) return sendJson(res, 403, { error: "forbidden" });
    const rows = await db()<{ id: string; topic_id: string; variant_id: string; title: string; username: string; body: string; created_at: Date; reports: number; reasons: string[] }[]>`
      select p.id, p.topic_id, t.variant_id, t.title, p.username, left(p.body, 400) as body, p.created_at,
             count(r.*)::int as reports, array_remove(array_agg(r.reason), null) as reasons
      from forum_reports r join forum_posts p on p.id = r.post_id join forum_topics t on t.id = p.topic_id
      where p.hidden_at is null group by p.id, t.id order by max(r.created_at) desc limit 100`;
    return sendJson(res, 200, { posts: rows.map((r) => ({ id: r.id, topic: r.topic_id, variant: r.variant_id, title: r.title, username: r.username, body: r.body, createdAt: r.created_at, reports: r.reports, reasons: r.reasons })) });
  }

  // ---------------------------------------------------------------- one topic
  if (a === "thema" && b) {
    const [topic] = await db()<{ id: string; variant_id: string; user_id: string; username: string; title: string; category: string; kind: string; solved_post_id: string | null; created_at: Date; hidden_at: Date | null }[]>`
      select id, variant_id, user_id, username, title, category, kind, solved_post_id, created_at, hidden_at from forum_topics where id = ${b}`;
    if (!topic || (topic.hidden_at && !admin)) return sendJson(res, 404, { error: "Not found" });
    // the author files the topic and says which reply answered the question; so does a reviewer
    const canEdit = admin || topic.user_id === user.id;
    if (c === "loesung" && req.method === "POST") {
      if (!canEdit) return sendJson(res, 403, { error: "forbidden" });
      if (topic.kind !== "frage") return sendJson(res, 400, { error: "kind" });
      const body = await readBody(req);
      const post = body?.post;
      if (post === null) {
        await db()`update forum_topics set solved_post_id = null, solved_at = null where id = ${topic.id}`;
        return sendJson(res, 200, { ok: true });
      }
      if (typeof post !== "string") return sendJson(res, 400, { error: "post" });
      // a visible reply of this topic: the opening post is the question, not its answer
      const [ok] = await db()<{ id: string }[]>`
        select p.id from forum_posts p where p.id = ${post} and p.topic_id = ${topic.id} and p.hidden_at is null
          and p.id <> (select f.id from forum_posts f where f.topic_id = ${topic.id} order by f.created_at, f.id limit 1)`;
      if (!ok) return sendJson(res, 400, { error: "post" });
      await db()`update forum_topics set solved_post_id = ${ok.id}, solved_at = now() where id = ${topic.id}`;
      return sendJson(res, 200, { ok: true });
    }
    if (c === "ausblenden" && req.method === "POST") {
      if (!admin) return sendJson(res, 403, { error: "forbidden" });
      await db()`update forum_topics set hidden_at = now(), hidden_by = ${user.username} where id = ${topic.id} and hidden_at is null`;
      return sendJson(res, 200, { ok: true });
    }
    if (c) return sendJson(res, 404, { error: "Not found" });
    if (req.method === "GET") {
      const owners = await verifiedOwners([topic.variant_id]);
      const posts = await db()<{ id: string; user_id: string; username: string; body: string; created_at: Date; edited_at: Date | null; hidden_at: Date | null; reports: number; reported: boolean }[]>`
        select p.id, p.user_id, p.username, p.body, p.created_at, p.edited_at, p.hidden_at,
               (select count(*)::int from forum_reports r where r.post_id = p.id) as reports,
               exists(select 1 from forum_reports r where r.post_id = p.id and r.user_id = ${user.id}) as reported
        from forum_posts p where p.topic_id = ${topic.id} order by p.created_at, p.id`;
      return sendJson(res, 200, {
        topic: {
          id: topic.id, variant: topic.variant_id, title: topic.title, username: name(topic.username), createdAt: topic.created_at, hidden: Boolean(topic.hidden_at),
          category: topic.category, kind: topic.kind, solvedPost: topic.solved_post_id, canEdit,
        },
        posts: posts.map((p) => ({
          id: p.id,
          username: name(p.username),
          owner: owners.has(ownerKey(topic.variant_id, p.user_id)),
          createdAt: p.created_at,
          editedAt: p.edited_at,
          // a removed post keeps its place in the thread, without its text
          body: p.hidden_at ? null : p.body,
          mine: p.user_id === user.id,
          canHide: !p.hidden_at && (admin || p.user_id === user.id),
          reported: p.reported,
          reports: admin ? p.reports : undefined,
        })),
        admin,
      });
    }
    if (req.method === "POST") {
      if (topic.hidden_at) return sendJson(res, 409, { error: "hidden" });
      const body = await readBody(req);
      const t = body && text(body.body, BODY);
      if (!t) return sendJson(res, 400, { error: "body" });
      if ((await tooMany(user.id)).posts) return sendJson(res, 429, { error: "too_many" });
      const id = randomUUID();
      await db().begin(async (tx) => {
        await tx`insert into forum_posts (id, topic_id, user_id, username, body) values (${id}, ${topic.id}, ${user.id}, ${user.username}, ${t})`;
        await tx`update forum_topics set last_post_at = now() where id = ${topic.id}`;
      });
      return sendJson(res, 201, { id });
    }
    if (req.method === "PUT") {
      if (!canEdit) return sendJson(res, 403, { error: "forbidden" });
      const body = await readBody(req);
      const category = body?.category === undefined ? topic.category : oneOf(FORUM_CATEGORIES, body.category);
      const kind = body?.kind === undefined ? topic.kind : oneOf(FORUM_KINDS, body.kind);
      if (!category || !kind) return sendJson(res, 400, { error: !category ? "category" : "kind" });
      // a discussion has no solution: turning a question into one drops the mark
      if (kind === "diskussion") await db()`update forum_topics set category = ${category}, kind = ${kind}, solved_post_id = null, solved_at = null where id = ${topic.id}`;
      else await db()`update forum_topics set category = ${category}, kind = ${kind} where id = ${topic.id}`;
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: "Not found" });
  }

  // ---------------------------------------------------------------- one post: hide, edit, report
  if (a === "beitrag" && b) {
    const [p] = await db()<{ id: string; user_id: string }[]>`select id, user_id from forum_posts where id = ${b} and hidden_at is null`;
    if (!p) return sendJson(res, 404, { error: "Not found" });
    if (c === "ausblenden" && req.method === "POST") {
      if (!admin && p.user_id !== user.id) return sendJson(res, 403, { error: "forbidden" });
      // the author's own removal erases the text (right to erasure); a reviewer hiding someone else's post keeps it
      if (p.user_id === user.id) await db()`update forum_posts set hidden_at = now(), hidden_by = ${user.username}, body = '' where id = ${p.id}`;
      else await db()`update forum_posts set hidden_at = now(), hidden_by = ${user.username} where id = ${p.id}`;
      // a removed reply no longer answers its question
      await db()`update forum_topics set solved_post_id = null, solved_at = null where solved_post_id = ${p.id}`;
      return sendJson(res, 200, { ok: true });
    }
    if (!c && req.method === "PUT") {
      if (p.user_id !== user.id) return sendJson(res, 403, { error: "forbidden" });
      const body = await readBody(req);
      const t = body && text(body.body, BODY);
      if (!t) return sendJson(res, 400, { error: "body" });
      await db()`update forum_posts set body = ${t}, edited_at = now() where id = ${p.id}`;
      return sendJson(res, 200, { ok: true });
    }
    if (c === "melden" && req.method === "POST") {
      if (p.user_id === user.id) return sendJson(res, 400, { error: "own" });
      const body = await readBody(req);
      const reason = body ? text(body.reason, REASON) : "";
      await db()`insert into forum_reports (post_id, user_id, reason) values (${p.id}, ${user.id}, ${reason || null}) on conflict do nothing`;
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: "Not found" });
  }

  // ---------------------------------------------------------------- topics of a variant
  if (a && !b && VARIANTS.has(a)) {
    if (req.method === "GET") {
      const sql = db();
      const p = url.searchParams;
      const scope = [...new Set([a, ...(p.get("mit") ?? "").split(",").filter((id) => VARIANTS.has(id))])].slice(0, MAX_SCOPE);
      const terms = (p.get("q") ?? "").trim().slice(0, 100).split(/\s+/).filter((w) => w.length >= 2).slice(0, MAX_TERMS);
      const category = oneOf(FORUM_CATEGORIES, p.get("kategorie"));
      const status = oneOf(FORUM_STATUS, p.get("status")) ?? "alle";
      const sort = oneOf(FORUM_SORTS, p.get("sortierung")) ?? "aktiv";
      const offset = Math.max(0, Math.floor(Number(p.get("offset"))) || 0);
      const cars = status === "besitzer" && (await hasUserCars());

      const visiblePosts = sql`from forum_posts p where p.topic_id = t.id and p.hidden_at is null`;
      // every search word in the title or in one of the topic's posts
      const matches = terms.reduce((all, w) => sql`${all} and (t.title ilike ${like(w)} or exists (select 1 ${visiblePosts} and p.body ilike ${like(w)}))`, sql``);
      const withStatus =
        status === "offen" ? sql`and t.kind = 'frage' and t.solved_post_id is null`
        : status === "geklaert" ? sql`and t.solved_post_id is not null`
        : status === "unbeantwortet" ? sql`and (select count(*) ${visiblePosts}) <= 1`
        : status === "besitzer" ? (cars ? sql`and exists (select 1 from user_cars c where c.user_id = t.user_id and c.variant_id = t.variant_id and c.status = 'approved')` : sql`and false`)
        : status === "meine" ? sql`and (t.user_id = ${user.id} or exists (select 1 ${visiblePosts} and p.user_id = ${user.id}))`
        : sql``;
      // what the search and the status filter leave, before the category narrows it: the numbers on the category buttons
      const filtered = sql`from forum_topics t where t.variant_id in ${sql(scope)} and t.hidden_at is null ${matches} ${withStatus}`;
      const order =
        sort === "neu" ? sql`x.created_at desc`
        : sort === "antworten" ? sql`x.posts desc, x.last_post_at desc`
        : sql`x.last_post_at desc`;

      type Row = {
        id: string; variant_id: string; user_id: string; username: string; title: string; category: string; kind: string; solved: boolean;
        created_at: Date; last_post_at: Date; posts: number; first: string | null; last_username: string | null; hit: string | null; total: number;
      };
      const [topics, counts, owners] = await Promise.all([
        sql<Row[]>`
          select x.*, (count(*) over ())::int as total from (
            select t.id, t.variant_id, t.user_id, t.username, t.title, t.category, t.kind, t.solved_post_id is not null as solved, t.created_at, t.last_post_at,
                   (select count(*)::int ${visiblePosts}) as posts,
                   (select left(p.body, ${EXCERPT + 1}) ${visiblePosts} order by p.created_at, p.id limit 1) as first,
                   (select p.username ${visiblePosts} order by p.created_at desc, p.id desc limit 1) as last_username,
                   ${terms.length ? sql`(select p.body ${visiblePosts} and p.body ilike any(${terms.map(like)}::text[]) order by p.created_at, p.id limit 1)` : sql`null::text`} as hit
            ${filtered} ${category ? sql`and t.category = ${category}` : sql``}
          ) x order by ${order}, x.id limit ${PAGE + 1} offset ${offset}`,
        sql<{ category: string; n: number }[]>`select t.category, count(*)::int as n ${filtered} group by t.category`,
        verifiedOwners(scope),
      ]);
      return sendJson(res, 200, {
        topics: topics.slice(0, PAGE).map((x) => ({
          id: x.id, variant: x.variant_id, title: x.title, category: x.category, kind: x.kind, solved: x.solved,
          username: name(x.username), owner: owners.has(ownerKey(x.variant_id, x.user_id)), mine: x.user_id === user.id,
          createdAt: x.created_at, lastPostAt: x.last_post_at, lastUsername: name(x.last_username), posts: x.posts,
          // while searching: the passage that was found, not the beginning of the topic
          excerpt: x.hit ? excerptAround(x.hit, terms) : excerptStart(x.first),
        })),
        hasMore: topics.length > PAGE,
        total: topics[0]?.total ?? 0,
        counts: Object.fromEntries(counts.map((c) => [c.category, c.n])),
        admin,
      });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const title = body && text(body.title, TITLE);
      const first = body && text(body.body, BODY);
      if (!title || !first) return sendJson(res, 400, { error: !title ? "title" : "body" });
      const category = oneOf(FORUM_CATEGORIES, body.category ?? "allgemein");
      const kind = oneOf(FORUM_KINDS, body.kind ?? "diskussion");
      if (!category || !kind) return sendJson(res, 400, { error: !category ? "category" : "kind" });
      const lim = await tooMany(user.id);
      if (lim.posts || lim.topics) return sendJson(res, 429, { error: "too_many" });
      const id = randomUUID();
      await db().begin(async (tx) => {
        await tx`insert into forum_topics (id, variant_id, user_id, username, title, category, kind) values (${id}, ${a}, ${user.id}, ${user.username}, ${title}, ${category}, ${kind})`;
        await tx`insert into forum_posts (id, topic_id, user_id, username, body) values (${randomUUID()}, ${id}, ${user.id}, ${user.username}, ${first})`;
      });
      return sendJson(res, 201, { id });
    }
  }
  return sendJson(res, 404, { error: "Not found" });
}
