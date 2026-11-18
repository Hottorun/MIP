import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { TLSSocket } from "node:tls";
import demoAccount from "./demo-account.json" with { type: "json" };
import { readText } from "./body.ts";
import { db } from "./db.ts";
import { sendLegalPage } from "./legalPages.ts";

/**
 * Accounts with username and password. Without a valid session the server hands out nothing but the sign-in page
 * (/anmelden) and /api/auth/*: the app, its data and the other APIs stay closed.
 *
 * Storage: Postgres (db/migrations/002_accounts.sql) – a scrypt hash + salt per user (never the password) and only the
 * SHA-256 of each session token. Sessions last a year and are renewed on every visit, so a user stays signed in until
 * they sign out.
 */

const COOKIE = "mip_sid";
const OLD_COOKIE = "motrkt_sid"; // name before the rename to MIP; still accepted and swapped for the new one
const SESSION_DAYS = 365;
const USERNAME = /^[A-Za-z0-9._-]{3,30}$/;
const PW_MIN = 8;
const PW_MAX = 200;

type User = { id: string; username: string; salt: string; hash: string };

// Shared demo account (server/demo-account.json, password in README). The repository is public, so it is on in
// development only; the production server enables it with MIP_DEMO_ACCOUNT=1. It is never written to the database.
let demo: User | null = null;
let demoAdmin = false;
/** `admin: true` only from the Vite dev server (vite.config.ts): the demo password is public, so it never reviews in production. */
export function enableDemoAccount(opts: { admin?: boolean } = {}) {
  demo = demoAccount as User;
  demoAdmin = opts.admin === true;
}

/**
 * Reviewers of the users' car reports (server/userCars.ts): the usernames in MIP_ADMINS, comma-separated. The demo
 * account is a reviewer only where enableDemoAccount({ admin: true }) said so (npm run dev), never because MIP_ADMINS
 * or NODE_ENV say so.
 */
/** The shared demo account (its state is not stored per user, see server/userState.ts). */
export const isDemo = (user: { id: string }) => Boolean(demo && demo.id === user.id);

export function isAdmin(user: { id: string; username: string }) {
  if (demo && demo.id === user.id) return demoAdmin;
  const names = (process.env.MIP_ADMINS ?? "").split(",").map((n) => n.trim().toLowerCase()).filter(Boolean);
  return names.includes(user.username.toLowerCase());
}

/** Premium runs while premium_until lies in the future (server/userCars.ts sets it); reviewers always have it. */
export const premiumActive = (premiumUntil: Date | string | null | undefined, admin = false, now = Date.now()) =>
  admin || (premiumUntil != null && new Date(premiumUntil).getTime() > now);

/** Whether the account has premium right now: what the paid features on the server ask (the Co-Pilot, server/api.ts). */
export async function isPremium(user: { id: string; username: string }): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (isDemo(user)) return false; // never in the database
  const [p] = await db()<{ premium_until: Date | null }[]>`select premium_until from users where id = ${user.id}`;
  return premiumActive(p?.premium_until);
}

async function userByName(username: string): Promise<User | null> {
  if (demo && demo.username.toLowerCase() === username.toLowerCase()) return demo;
  const [u] = await db()<User[]>`select id, username, salt, hash from users where lower(username) = lower(${username})`;
  return u ?? null;
}
async function userById(id: string): Promise<User | null> {
  if (demo && demo.id === id) return demo;
  const [u] = await db()<User[]>`select id, username, salt, hash from users where id = ${id}`;
  return u ?? null;
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function hashPassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFC"), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

// ------------------------------------------------------------------------------------------------ sessions
function readCookie(req: IncomingMessage, name: string) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

const isHttps = (req: IncomingMessage) => req.socket instanceof TLSSocket || req.headers["x-forwarded-proto"] === "https";

function setCookie(req: IncomingMessage, res: ServerResponse, value: string, maxAge: number) {
  const attrs = `; Path=/; HttpOnly; SameSite=Lax${isHttps(req) ? "; Secure" : ""}`;
  const cookies = [`${COOKIE}=${encodeURIComponent(value)}${attrs}; Max-Age=${maxAge}`];
  if (readCookie(req, OLD_COOKIE)) cookies.push(`${OLD_COOKIE}=${attrs}; Max-Age=0`);
  res.setHeader("Set-Cookie", cookies);
}

const sessionToken = (req: IncomingMessage) => readCookie(req, COOKIE) ?? readCookie(req, OLD_COOKIE);

async function startSession(req: IncomingMessage, res: ServerResponse, userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db()`delete from sessions where expires_at < now()`;
  await db()`insert into sessions (token_hash, user_id, expires_at) values (${sha(token)}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  setCookie(req, res, token, SESSION_DAYS * 86_400);
}

/** Pushes a used session (and its cookie) out to a full year again; at most once a day per session. */
async function renewSession(req: IncomingMessage, res: ServerResponse) {
  const token = sessionToken(req);
  if (!token) return;
  // the old cookie name is always swapped for the new one
  const due = readCookie(req, COOKIE) ? db()`expires_at < now() + make_interval(days => ${SESSION_DAYS - 1})` : db()`true`;
  const renewed = await db()`
    update sessions set expires_at = now() + make_interval(days => ${SESSION_DAYS})
    where token_hash = ${sha(token)} and expires_at > now() and ${due}`;
  if (renewed.count) setCookie(req, res, token, SESSION_DAYS * 86_400);
}

export async function currentUser(req: IncomingMessage): Promise<{ id: string; username: string } | null> {
  const token = sessionToken(req);
  if (!token) return null;
  const [s] = await db()<{ user_id: string }[]>`select user_id from sessions where token_hash = ${sha(token)} and expires_at > now()`;
  const u = s ? await userById(s.user_id) : null;
  return u ? { id: u.id, username: u.username } : null;
}

// ------------------------------------------------------------------------------------------------ brute-force brake
// In the database, not in memory: on Vercel many function instances answer requests side by side.
const MAX_FAILS = 8;
// A name alone is blocked only after many more failures from any address: a global block at 8 would let anyone lock
// a user (or a reviewer) out at will; this still caps password spraying from many addresses at 50 tries a quarter hour.
const MAX_FAILS_NAME = 50;
// The counters are kept under a hash of the key, so the table holds no readable names or IP addresses.
const failKey = (key: string) => sha("auth-failure:" + key);
async function blocked(key: string, max = MAX_FAILS) {
  const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from auth_failures where key = ${failKey(key)} and at > now() - interval '15 minutes'`;
  return n >= max;
}
async function fail(key: string) {
  await db()`delete from auth_failures where at < now() - interval '1 day'`;
  await db()`insert into auth_failures (key) values (${failKey(key)})`;
}
const clearFailures = (key: string) => db()`delete from auth_failures where key = ${failKey(key)}`;
/**
 * Client address: behind Vercel's proxy from the header Vercel sets (not spoofable there); behind one's own reverse
 * proxy (nginx, Caddy) only with MIP_TRUST_PROXY=1 from X-Forwarded-For, else the socket, so that one address cannot
 * trip the brake for everyone.
 */
function clientIp(req: IncomingMessage) {
  const fwd = process.env.VERCEL
    ? req.headers["x-vercel-forwarded-for"] ?? req.headers["x-forwarded-for"]
    : process.env.MIP_TRUST_PROXY === "1"
      ? req.headers["x-forwarded-for"]
      : undefined;
  return (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0].trim() || req.socket.remoteAddress || "?";
}

// ------------------------------------------------------------------------------------------------ API
function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!(req.headers["content-type"] ?? "").includes("application/json")) throw new Error("json");
  const v = JSON.parse((await readText(req, 10_000)) || "{}");
  return v && typeof v === "object" ? v : {};
}

/** POSTs must come from this site (another site cannot sign people in or out). */
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  return !origin || origin.replace(/^https?:\/\//, "") === req.headers.host;
}

export async function handleAuth(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname;
  if (path === "/api/auth/me" && req.method === "GET") {
    const u = await currentUser(req);
    if (!u) return sendJson(res, 401, { error: "not signed in" });
    // the demo account is not in the database
    const [p] = isDemo(u) ? [] : await db()<{ premium_until: Date | null }[]>`select premium_until from users where id = ${u.id}`;
    const admin = isAdmin(u);
    return sendJson(res, 200, { username: u.username, admin, demo: isDemo(u), premiumUntil: p?.premium_until ?? null, premium: premiumActive(p?.premium_until, admin) });
  }
  if (path === "/api/auth/export" && req.method === "GET") return exportAccount(req, res);
  if (req.method !== "POST" || !sameOrigin(req)) return sendJson(res, 404, { error: "Not found" });

  if (path === "/api/auth/password") return changePassword(req, res);
  if (path === "/api/auth/delete") return deleteAccount(req, res);

  if (path === "/api/auth/logout") {
    const token = sessionToken(req);
    if (token) await db()`delete from sessions where token_hash = ${sha(token)}`;
    setCookie(req, res, "", 0);
    return sendJson(res, 200, { ok: true });
  }

  let body: Record<string, unknown>;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "bad request" });
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const ip = clientIp(req);

  if (path === "/api/auth/register") {
    if (await blocked("reg:" + ip)) return sendJson(res, 429, { error: "too_many" });
    if (!USERNAME.test(username)) return sendJson(res, 400, { error: "username_invalid" });
    if (password.length < PW_MIN || password.length > PW_MAX) return sendJson(res, 400, { error: "password_length" });
    if (password.toLowerCase() === username.toLowerCase()) return sendJson(res, 400, { error: "password_is_username" });
    if (await userByName(username)) return sendJson(res, 409, { error: "username_taken" });
    const salt = randomBytes(16).toString("hex");
    const hash = (await hashPassword(password, salt)).toString("hex");
    const user: User = { id: randomUUID(), username, salt, hash };
    // the unique index on lower(username) settles two sign-ups racing for the same name
    const added = await db()`insert into users (id, username, salt, hash) values (${user.id}, ${username}, ${salt}, ${hash}) on conflict do nothing`;
    if (!added.count) return sendJson(res, 409, { error: "username_taken" });
    await fail("reg:" + ip); // counts sign-ups too: at most a few new accounts per address and quarter hour
    await startSession(req, res, user.id);
    return sendJson(res, 201, { username });
  }

  if (path === "/api/auth/login") {
    const nameKey = "login:" + username.toLowerCase();
    const key = nameKey + "@" + ip; // this name from this address
    if ((await blocked(key)) || (await blocked("ip:" + ip)) || (await blocked(nameKey, MAX_FAILS_NAME))) return sendJson(res, 429, { error: "too_many" });
    const user = await userByName(username);
    // hash even for unknown names, so the answer time does not reveal which names exist
    const salt = user?.salt ?? "0000000000000000";
    const got = await hashPassword(password.slice(0, PW_MAX), salt);
    if (!user || !timingSafeEqual(got, Buffer.from(user.hash, "hex"))) {
      await fail(key);
      await fail(nameKey);
      await fail("ip:" + ip);
      return sendJson(res, 401, { error: "wrong_credentials" });
    }
    await clearFailures(key);
    await startSession(req, res, user.id);
    return sendJson(res, 200, { username: user.username });
  }
  return sendJson(res, 404, { error: "Not found" });
}

// ------------------------------------------------------------------------------------------------ account
// Password change, data export and deletion (/konto). The demo account has none of these: it is shared.

async function changePassword(req: IncomingMessage, res: ServerResponse) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "not signed in" });
  if (isDemo(user)) return sendJson(res, 403, { error: "demo" });
  let body: Record<string, unknown>;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "bad request" });
  }
  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.next === "string" ? body.next : "";
  if (next.length < PW_MIN || next.length > PW_MAX) return sendJson(res, 400, { error: "password_length" });
  if (next.toLowerCase() === user.username.toLowerCase()) return sendJson(res, 400, { error: "password_is_username" });
  const full = await userById(user.id);
  if (!full) return sendJson(res, 401, { error: "not signed in" });
  const got = await hashPassword(current.slice(0, PW_MAX), full.salt);
  if (!timingSafeEqual(got, Buffer.from(full.hash, "hex"))) return sendJson(res, 400, { error: "wrong_password" });
  const salt = randomBytes(16).toString("hex");
  const hash = (await hashPassword(next, salt)).toString("hex");
  const token = sessionToken(req);
  await db().begin(async (tx) => {
    await tx`update users set salt = ${salt}, hash = ${hash} where id = ${user.id}`;
    // every other browser is signed out; this one keeps its session
    await tx`delete from sessions where user_id = ${user.id} and token_hash <> ${sha(token ?? "")}`;
  });
  return sendJson(res, 200, { ok: true });
}

/** Everything stored about the account as one JSON file (data portability); the contract files are not included. */
async function exportAccount(req: IncomingMessage, res: ServerResponse) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "not signed in" });
  if (isDemo(user)) return sendJson(res, 403, { error: "demo" });
  const sql = db();
  const [account] = await sql`select username, created_at, premium_until from users where id = ${user.id}`;
  const [state] = await sql`select state, updated_at from user_state where user_id = ${user.id}`;
  const cars = await sql`select id, status, created_at, kind, appraiser, value_basis, contract_at, role, variant_id, title, build_year, vin, km, price, currency, sale_date, country, counterparty,
                                body, gearbox, steering, color_ext, color_int, condition, matching_numbers, accident_free, notes, contract_name,
                                contract_type, contract_size, contract_deleted_at, reviewed_at, review_note, consent_at, consent_version,
                                ai_consent, ai_check, ai_checked_at
                         from user_cars where user_id = ${user.id} order by created_at`;
  const reports = await sql`select post_id, reason, created_at from forum_reports where user_id = ${user.id} order by created_at`;
  const topics = await sql`select id, variant_id, title, created_at, hidden_at from forum_topics where user_id = ${user.id} order by created_at`;
  const posts = await sql`select id, topic_id, body, created_at, edited_at, hidden_at from forum_posts where user_id = ${user.id} order by created_at`;
  const sessions = await sql`select expires_at from sessions where user_id = ${user.id}`;
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="carbay-${user.username.replace(/[^\w.-]/g, "_")}-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ exported_at: new Date().toISOString(), account, state: state ?? null, cars, forum: { topics, posts, reports }, sessions }, null, 2));
}

/**
 * Deletes the account: sessions, stored state, request counters, reports of forum posts and every car report that is
 * not approved, with its contract. Approved cars are part of the market model and stay, detached from the account (no
 * user id, chassis number, notes or AI check); so do forum posts, without the author's name.
 */
async function deleteAccount(req: IncomingMessage, res: ServerResponse) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "not signed in" });
  if (isDemo(user)) return sendJson(res, 403, { error: "demo" });
  let body: Record<string, unknown>;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "bad request" });
  }
  const password = typeof body.password === "string" ? body.password : "";
  const full = await userById(user.id);
  if (!full) return sendJson(res, 401, { error: "not signed in" });
  const got = await hashPassword(password.slice(0, PW_MAX), full.salt);
  if (!timingSafeEqual(got, Buffer.from(full.hash, "hex"))) return sendJson(res, 400, { error: "wrong_password" });
  const gone = "deleted:" + sha(user.id).slice(0, 16); // stable, not traceable to the name
  await db().begin(async (tx) => {
    await tx`delete from sessions where user_id = ${user.id}`;
    await tx`delete from user_state where user_id = ${user.id}`;
    await tx`delete from user_cars where user_id = ${user.id} and status <> 'approved'`;
    await tx`update user_cars set user_id = ${gone}, vin = '', notes = null, appraiser = null, contract = null, contract_name = null, ai_check = null,
             contract_deleted_at = coalesce(contract_deleted_at, now()) where user_id = ${user.id}`;
    await tx`delete from forum_reports where user_id = ${user.id}`;
    await tx`delete from rate_events where key like ${"%:" + user.id}`;
    await tx`update forum_topics set user_id = ${gone}, username = '[gelöscht]' where user_id = ${user.id}`;
    await tx`update forum_posts set user_id = ${gone}, username = '[gelöscht]' where user_id = ${user.id}`;
    await tx`delete from users where id = ${user.id}`;
  });
  setCookie(req, res, "", 0);
  return sendJson(res, 200, { ok: true });
}

// ------------------------------------------------------------------------------------------------ gate
const OPEN = new Set(["/anmelden", "/favicon.svg", "/favicon-32.png", "/apple-touch-icon.png", "/brand/carbay-wordmark.svg"]);
// the typefaces are served from this site (public/fonts), not from Google; the sign-in page needs them too
const isOpen = (path: string) => OPEN.has(path) || /^\/fonts\/[\w.-]+\.(woff2|txt)$/.test(path);

/** Handles the request if it must not reach the app (sign-in page, auth API, or no session). Returns true then. */
export async function authGate(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/auth/")) {
    await handleAuth(req, res, url);
    return true;
  }
  if (url.pathname === "/anmelden") {
    if (await currentUser(req)) return redirect(res, safeNext(url.searchParams.get("next")));
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", LOGIN_CSP);
    res.end(LOGIN_PAGE);
    return true;
  }
  if (isOpen(url.pathname)) return false;
  // Impressum and privacy notice must be reachable without an account; signed in, the app renders the same texts
  if ((url.pathname === "/impressum" || url.pathname === "/datenschutz") && !(await currentUser(req))) {
    sendLegalPage(res, url.pathname.slice(1) as "impressum" | "datenschutz", url.searchParams.get("lang"));
    return true;
  }
  if (await currentUser(req)) {
    if (req.method === "GET" && (req.headers.accept ?? "").includes("text/html")) await renewSession(req, res);
    return false;
  }
  if (req.method === "GET" && (req.headers.accept ?? "").includes("text/html")) {
    return redirect(res, "/anmelden" + (url.pathname !== "/" ? "?next=" + encodeURIComponent(url.pathname + url.search) : ""));
  }
  sendJson(res, 401, { error: "not signed in" });
  return true;
}

function redirect(res: ServerResponse, to: string) {
  res.statusCode = 302;
  res.setHeader("Location", to);
  res.setHeader("Cache-Control", "no-store");
  res.end();
  return true;
}
/**
 * Only paths on this site ("/markt/…"), never "//other.site", "https://…" or "/\t/other.site" (browsers drop tabs and
 * newlines before parsing, so that one would also leave the site): the URL parser must keep the origin, and no
 * whitespace, control characters or backslashes get through.
 */
export function safeNext(n: string | null) {
  if (!n || !n.startsWith("/") || /[\s\\\u0000-\u001f]/.test(n)) return "/";
  try {
    const u = new URL(n, "https://mip.invalid");
    return u.origin === "https://mip.invalid" ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}

// ------------------------------------------------------------------------------------------------ sign-in page
// Standalone page (no app bundle): the app and its data load only after sign-in.
const LOGIN_PAGE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml" />
<link rel="icon" href="/favicon-32.png?v=3" type="image/png" sizes="32x32" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3" />
<link rel="preload" href="/fonts/jost-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
<meta name="theme-color" content="#efe7d7" />
<title>Anmelden – Carbay</title>
<style>
  @font-face { font-family:"Jost"; font-style:normal; font-weight:300 600; font-display:swap; src:url(/fonts/jost-latin-ext-wght-normal.woff2) format("woff2");
    unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
  @font-face { font-family:"Jost"; font-style:normal; font-weight:300 600; font-display:swap; src:url(/fonts/jost-latin-wght-normal.woff2) format("woff2");
    unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
  :root { --bg:#efe7d7; --panel:#f7f2e8; --line:#dccfb8; --line2:#c6b699; --ink:#3a2a1d; --muted:#78624d; --faint:#a38f77; --gold:#8b6232; --down:#9a3b2c; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px 16px;
         background:var(--bg); color:var(--ink); font:15px/1.5 "Jost","Futura","Century Gothic",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
  main { width:100%; max-width:380px; }
  .logo { text-align:center; margin:0 0 10px; line-height:0; }
  .logo img { height:64px; width:auto; }
  .tag { text-align:center; color:var(--muted); font-size:13.5px; margin:0 0 28px; }
  .card { background:var(--panel); border:1px solid var(--line); padding:26px 24px 22px; }
  .tabs { display:flex; border-bottom:1px solid var(--line); margin:-4px 0 20px; }
  .tabs button { flex:1; background:none; border:0; border-bottom:1.5px solid transparent; margin-bottom:-1px; padding:8px 0 10px;
                 font:inherit; font-size:14px; letter-spacing:.06em; color:var(--faint); cursor:pointer; }
  .tabs button[aria-selected="true"] { color:var(--ink); border-color:var(--ink); }
  label { display:block; font-size:12.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin:0 0 6px; }
  input { width:100%; font:inherit; font-size:16px; color:var(--ink); background:#fbf8f2; border:1px solid var(--line2); padding:10px 12px; margin:0 0 4px; border-radius:0; }
  input:focus { outline:1.5px solid var(--ink); outline-offset:0; }
  .hint { font-size:12.5px; color:var(--faint); margin:0 0 16px; min-height:1em; }
  .submit { width:100%; margin-top:6px; padding:12px; background:var(--ink); color:var(--bg); border:0; font:inherit; font-size:14px; letter-spacing:.1em; text-transform:uppercase; cursor:pointer; }
  .submit:hover { background:var(--gold); }
  .submit:disabled { opacity:.6; cursor:default; }
  .err { color:var(--down); font-size:14px; margin:12px 0 0; min-height:1.2em; }
  .lang { text-align:center; margin-top:18px; font-size:12.5px; letter-spacing:.08em; }
  .lang button { background:none; border:0; font:inherit; color:var(--faint); cursor:pointer; padding:2px 4px; }
  .lang button[aria-pressed="true"] { color:var(--ink); }
  .legal { text-align:center; margin-top:14px; font-size:12px; } .legal a { color:var(--faint); text-decoration:none; margin:0 6px; } .legal a:hover { color:var(--ink); }
  .note { font-size:12.5px; line-height:1.45; color:var(--muted); margin:14px 0 0; } .note a { color:inherit; }
</style>
</head>
<body>
<main>
  <h1 class="logo"><img src="/brand/carbay-wordmark.svg" alt="Carbay" width="134" height="64" /></h1>
  <p class="tag" data-de="Marktintelligenz für Sportwagen" data-en="Market intelligence for sports cars"></p>
  <div class="card">
    <div class="tabs" role="tablist">
      <button type="button" role="tab" id="tab-login" aria-selected="true" data-de="Anmelden" data-en="Sign in"></button>
      <button type="button" role="tab" id="tab-register" aria-selected="false" data-de="Konto anlegen" data-en="Create account"></button>
    </div>
    <form id="form" novalidate>
      <label for="username" data-de="Benutzername" data-en="Username"></label>
      <input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="30" />
      <p class="hint" id="uhint"></p>
      <label for="password" data-de="Passwort" data-en="Password"></label>
      <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="200" />
      <p class="hint" id="phint"></p>
      <div id="repeat-wrap" hidden>
        <label for="password2" data-de="Passwort wiederholen" data-en="Repeat password"></label>
        <input id="password2" type="password" autocomplete="new-password" maxlength="200" />
        <p class="hint"></p>
      </div>
      <button class="submit" id="submit" type="submit"></button>
      <p class="err" id="err" role="alert"></p>
      <p class="note" id="note" hidden><span data-de="Für das Konto speichern wir nur Benutzernamen und einen Hash des Passworts, keine E-Mail-Adresse. Details in der " data-en="For the account we store only the username and a hash of the password, no email address. Details in the "></span><a href="/datenschutz" data-de="Datenschutzerklärung" data-en="privacy notice"></a>.</p>
    </form>
  </div>
  <div class="lang"><button type="button" data-lang="de">DE</button> | <button type="button" data-lang="en">EN</button></div>
  <p class="legal"><a href="/impressum">Impressum</a><a href="/datenschutz" data-de="Datenschutz" data-en="Privacy"></a></p>
</main>
<script>
(function () {
  var lang = "de";
  try { lang = (localStorage.getItem("mip-lang") || localStorage.getItem("motrkt-lang")) === "en" ? "en" : "de"; } catch (e) {}
  var mode = "login";
  var T = {
    de: { login: "Anmelden", register: "Konto anlegen", uhint: "3–30 Zeichen: Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich", phint: "Mindestens 8 Zeichen",
          wrong_credentials: "Benutzername oder Passwort stimmt nicht.", username_taken: "Dieser Benutzername ist schon vergeben.",
          username_invalid: "Benutzername: 3–30 Zeichen, nur Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich.",
          password_length: "Das Passwort braucht mindestens 8 Zeichen.", password_is_username: "Das Passwort darf nicht der Benutzername sein.",
          mismatch: "Die Passwörter stimmen nicht überein.", too_many: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.",
          empty: "Bitte Benutzername und Passwort eingeben.", network: "Keine Verbindung zum Server." },
    en: { login: "Sign in", register: "Create account", uhint: "3–30 characters: letters, digits, dot, hyphen, underscore", phint: "At least 8 characters",
          wrong_credentials: "Username or password is wrong.", username_taken: "This username is already taken.",
          username_invalid: "Username: 3–30 characters, only letters, digits, dot, hyphen, underscore.",
          password_length: "The password needs at least 8 characters.", password_is_username: "The password must not be the username.",
          mismatch: "The passwords do not match.", too_many: "Too many attempts. Please try again in 15 minutes.",
          empty: "Please enter username and password.", network: "No connection to the server." }
  };
  var $ = function (id) { return document.getElementById(id); };
  function render() {
    document.documentElement.lang = lang;
    document.title = (lang === "de" ? "Anmelden" : "Sign in") + " – Carbay";
    document.querySelectorAll("[data-de]").forEach(function (el) { el.textContent = el.getAttribute("data-" + lang); });
    document.querySelectorAll("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang)); });
    var reg = mode === "register";
    $("tab-login").setAttribute("aria-selected", String(!reg));
    $("tab-register").setAttribute("aria-selected", String(reg));
    $("repeat-wrap").hidden = !reg;
    $("note").hidden = !reg;
    $("password").autocomplete = reg ? "new-password" : "current-password";
    $("uhint").textContent = reg ? T[lang].uhint : "";
    $("phint").textContent = reg ? T[lang].phint : "";
    $("submit").textContent = T[lang][mode];
    $("err").textContent = "";
  }
  $("tab-login").onclick = function () { mode = "login"; render(); };
  $("tab-register").onclick = function () { mode = "register"; render(); };
  document.querySelectorAll("[data-lang]").forEach(function (b) {
    b.onclick = function () { lang = b.getAttribute("data-lang"); try { localStorage.setItem("mip-lang", lang); } catch (e) {} render(); };
  });
  $("form").onsubmit = function (e) {
    e.preventDefault();
    var u = $("username").value.trim(), p = $("password").value;
    if (!u || !p) { $("err").textContent = T[lang].empty; return; }
    if (mode === "register" && p !== $("password2").value) { $("err").textContent = T[lang].mismatch; return; }
    $("submit").disabled = true;
    fetch("/api/auth/" + mode, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ username: u, password: p }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok) {
          var next = new URLSearchParams(location.search).get("next") || "/";
          location.replace(/^\\/(?![\\/\\\\])/.test(next) && !/[\\s\\\\]/.test(next) ? next : "/");
        } else {
          $("err").textContent = T[lang][x.j.error] || T[lang].wrong_credentials;
          $("submit").disabled = false;
        }
      })
      .catch(function () { $("err").textContent = T[lang].network; $("submit").disabled = false; });
  };
  render();
  $("username").focus();
  // Demo link (QR code): /anmelden#demo=<password> signs in as the shared demo account. The part after # never
  // reaches the server or its logs, and it is taken out of the address before signing in.
  var demo = /^#demo=(.+)$/.exec(location.hash);
  if (demo) {
    try {
      history.replaceState(null, "", location.pathname + location.search);
      $("username").value = "demo";
      $("password").value = decodeURIComponent(demo[1]);
      $("form").onsubmit({ preventDefault: function () {} });
    } catch (e) {}
  }
})();
</script>
</body>
</html>`;

// The page's one inline script is allowed by its hash; nothing else may run, load or frame it.
const LOGIN_SCRIPT_HASH = createHash("sha256").update(LOGIN_PAGE.match(/<script>([\s\S]*?)<\/script>/)![1]).digest("base64");
const LOGIN_CSP = [
  "default-src 'none'",
  `script-src 'sha256-${LOGIN_SCRIPT_HASH}'`,
  "style-src 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
