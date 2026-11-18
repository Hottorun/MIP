import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { readText } from "./body.ts";
import { currentUser, isDemo } from "./auth.ts";
import { db } from "./db.ts";

/**
 * The user's app state (db/migrations/007_user_state.sql): watchlist, portfolio, alerts, saved listings, read
 * notifications and the last opened variant as one JSON document, last write wins.
 *
 *   GET /api/zustand   -> { state: {...} | null, sync: boolean, owner }   (sync false: shared demo account, browser only)
 *                         owner: a tag for the account (not its name), so the browser can tell whose copy it holds
 *   PUT /api/zustand   <- the document (JSON, at most 200 kB)      -> { ok: true }
 */

const MAX_BYTES = 200_000;
const LISTS = ["watchlist", "alerts", "portfolio", "savedListings", "readNotifications"] as const;
const MAX_ITEMS = 2000;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  return !origin || origin.replace(/^https?:\/\//, "") === req.headers.host;
}

/** Only the known keys, each list capped; anything else is dropped. Null when the shape is not a state document. */
export function cleanState(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of LISTS) {
    const v = r[k];
    if (v === undefined) continue;
    if (!Array.isArray(v)) return null;
    out[k] = v.slice(0, MAX_ITEMS);
  }
  if (typeof r.lastVariantId === "string") out.lastVariantId = r.lastVariantId.slice(0, 100);
  return out;
}

export async function handleUserState(req: IncomingMessage, res: ServerResponse) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "not signed in" });
  const owner = createHash("sha256").update("state-owner:" + user.id).digest("hex").slice(0, 16);
  if (isDemo(user)) return sendJson(res, req.method === "GET" ? 200 : 403, { state: null, sync: false, owner });

  if (req.method === "GET") {
    const [row] = await db()<{ state: unknown }[]>`select state from user_state where user_id = ${user.id}`;
    return sendJson(res, 200, { state: row?.state ?? null, sync: true, owner });
  }
  if (req.method === "PUT") {
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
    let state: Record<string, unknown> | null;
    try {
      state = cleanState(JSON.parse((await readText(req, MAX_BYTES)) || "null"));
    } catch (err) {
      return sendJson(res, (err as Error).message === "size" ? 413 : 400, { error: "bad request" });
    }
    if (!state) return sendJson(res, 400, { error: "bad request" });
    await db()`insert into user_state (user_id, state, updated_at) values (${user.id}, ${db().json(state as never)}, now())
               on conflict (user_id) do update set state = excluded.state, updated_at = now()`;
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: "Not found" });
}
