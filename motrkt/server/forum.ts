import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import variantIds from "../scripts/market/variant_ids.json" with { type: "json" };
import { readText } from "./body.ts";
import { currentUser, isAdmin } from "./auth.ts";
import { db } from "./db.ts";

/**
 * Forum per variant (db/migrations/005_forum.sql), shown at the bottom of each model page. Signed-in users read and
 * write; a user whose own car of this variant was approved with its contract or appraisal (user_cars) is marked as a
 * verified owner. Authors remove their own posts, reviewers (MIP_ADMINS) hide posts and topics; rows stay in the
 * database (hidden_at), nothing is deleted.
 *
 *   GET  /api/forum/neueste?limit=20              latest topics across all variants (forum overview, search)
 *   GET  /api/forum/meldungen                     reviewers: reported posts
 *   GET  /api/forum/:variant?offset=0             topics, newest activity first, PAGE at a time (hasMore)
 *   POST /api/forum/:variant                      { title, body } -> new topic with its first post
 *   GET  /api/forum/thema/:id                     the topic and its posts
 *   POST /api/forum/thema/:id                     { body } -> reply
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

/** Users with an approved car of this variant (purchase contract or appraisal checked). */
async function verifiedOwners(variant: string): Promise<Set<string>> {
  const [{ ok }] = await db()<{ ok: boolean }[]>`select to_regclass('user_cars') is not null as ok`;
  if (!ok) return new Set();
  const rows = await db()<{ user_id: string }[]>`select distinct user_id from user_cars where variant_id = ${variant} and status = 'approved'`;
  return new Set(rows.map((r) => r.user_id));
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
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "not signed in" });
  if (req.method !== "GET" && !sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
  const admin = isAdmin(user);
  const [, , , a, b, c] = url.pathname.split("/"); // "", "api", "forum", a, b, c

  // ---------------------------------------------------------------- latest topics everywhere
  if (a === "neueste" && !b && req.method === "GET") {
    const limit = Math.max(1, Math.min(200, Math.floor(Number(url.searchParams.get("limit"))) || 20));
    const topics = await db()<{ id: string; variant_id: string; username: string; title: string; created_at: Date; last_post_at: Date; posts: number; first: string | null }[]>`
      select t.id, t.variant_id, t.username, t.title, t.created_at, t.last_post_at,
             (select count(*)::int from forum_posts p where p.topic_id = t.id and p.hidden_at is null) as posts,
             (select left(p.body, 220) from forum_posts p where p.topic_id = t.id and p.hidden_at is null order by p.created_at limit 1) as first
      from forum_topics t where t.hidden_at is null order by t.last_post_at desc limit ${limit}`;
    return sendJson(res, 200, {
      topics: topics.map((x) => ({ id: x.id, variant: x.variant_id, title: x.title, username: x.username, createdAt: x.created_at, lastPostAt: x.last_post_at, posts: x.posts, excerpt: x.first })),
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
    const [topic] = await db()<{ id: string; variant_id: string; user_id: string; username: string; title: string; created_at: Date; hidden_at: Date | null }[]>`
      select id, variant_id, user_id, username, title, created_at, hidden_at from forum_topics where id = ${b}`;
    if (!topic || (topic.hidden_at && !admin)) return sendJson(res, 404, { error: "Not found" });
    if (c === "ausblenden" && req.method === "POST") {
      if (!admin) return sendJson(res, 403, { error: "forbidden" });
      await db()`update forum_topics set hidden_at = now(), hidden_by = ${user.username} where id = ${topic.id} and hidden_at is null`;
      return sendJson(res, 200, { ok: true });
    }
    if (c) return sendJson(res, 404, { error: "Not found" });
    if (req.method === "GET") {
      const owners = await verifiedOwners(topic.variant_id);
      const posts = await db()<{ id: string; user_id: string; username: string; body: string; created_at: Date; edited_at: Date | null; hidden_at: Date | null; reports: number; reported: boolean }[]>`
        select p.id, p.user_id, p.username, p.body, p.created_at, p.edited_at, p.hidden_at,
               (select count(*)::int from forum_reports r where r.post_id = p.id) as reports,
               exists(select 1 from forum_reports r where r.post_id = p.id and r.user_id = ${user.id}) as reported
        from forum_posts p where p.topic_id = ${topic.id} order by p.created_at`;
      return sendJson(res, 200, {
        topic: { id: topic.id, variant: topic.variant_id, title: topic.title, username: topic.username, createdAt: topic.created_at, hidden: Boolean(topic.hidden_at) },
        posts: posts.map((p) => ({
          id: p.id,
          username: p.username,
          owner: owners.has(p.user_id),
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
      const owners = await verifiedOwners(a);
      const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset"))) || 0);
      const topics = await db()<{ id: string; user_id: string; username: string; title: string; created_at: Date; last_post_at: Date; posts: number; first: string | null }[]>`
        select t.id, t.user_id, t.username, t.title, t.created_at, t.last_post_at,
               (select count(*)::int from forum_posts p where p.topic_id = t.id and p.hidden_at is null) as posts,
               (select left(p.body, 220) from forum_posts p where p.topic_id = t.id and p.hidden_at is null order by p.created_at limit 1) as first
        from forum_topics t where t.variant_id = ${a} and t.hidden_at is null order by t.last_post_at desc limit ${PAGE + 1} offset ${offset}`;
      return sendJson(res, 200, {
        topics: topics.slice(0, PAGE).map((x) => ({
          id: x.id, title: x.title, username: x.username, owner: owners.has(x.user_id), createdAt: x.created_at, lastPostAt: x.last_post_at,
          posts: x.posts, excerpt: x.first,
        })),
        hasMore: topics.length > PAGE,
        admin,
      });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const title = body && text(body.title, TITLE);
      const first = body && text(body.body, BODY);
      if (!title || !first) return sendJson(res, 400, { error: !title ? "title" : "body" });
      const lim = await tooMany(user.id);
      if (lim.posts || lim.topics) return sendJson(res, 429, { error: "too_many" });
      const id = randomUUID();
      await db().begin(async (tx) => {
        await tx`insert into forum_topics (id, variant_id, user_id, username, title) values (${id}, ${a}, ${user.id}, ${user.username}, ${title})`;
        await tx`insert into forum_posts (id, topic_id, user_id, username, body) values (${randomUUID()}, ${id}, ${user.id}, ${user.username}, ${first})`;
      });
      return sendJson(res, 201, { id });
    }
  }
  return sendJson(res, 404, { error: "Not found" });
}
