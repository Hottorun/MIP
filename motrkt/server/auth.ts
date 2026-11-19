import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { TLSSocket } from "node:tls";
import demoAccount from "./demo-account.json" with { type: "json" };
import { readText } from "./body.ts";
import { db } from "./db.ts";
import { sendLegalPage } from "./legalPages.ts";
import { accountMail, sendMail } from "./mail.ts";

/**
 * Accounts with username and password. Without a session a visitor is a guest: the app and the lite market data are
 * open (like the lite version of an account), the full data stays premium (mayRead), and every API that keeps
 * something per account (state, portfolio, forum writing, Co-Pilot, uploads) checks for an account itself.
 *
 * Storage: Postgres (db/migrations/002_accounts.sql) – a scrypt hash + salt per user (never the password) and only the
 * SHA-256 of each session token. Every account has an email address (db/migrations/013_email.sql), used only to confirm
 * it and to reset the password (server/mail.ts); accounts from before it are asked for one once (src/components/EmailGate.tsx). Sessions last a year and are renewed on every visit, so a user stays signed in until
 * they sign out.
 */

const COOKIE = "mip_sid";
const OLD_COOKIE = "motrkt_sid"; // name before the rename to MIP; still accepted and swapped for the new one
const SESSION_DAYS = 365;
const USERNAME = /^[A-Za-z0-9._-]{3,30}$/;
const PW_MIN = 8;
const PW_MAX = 200;
const EMAIL_MAX = 254;
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const VERIFY_HOURS = 48;
const RESET_HOURS = 1;

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

/** Premium runs while premium_until lies in the future (an approved contract or a payment sets it, server/premium.ts); reviewers always have it. */
export const premiumActive = (premiumUntil: Date | string | null | undefined, admin = false, now = Date.now()) =>
  admin || (premiumUntil != null && new Date(premiumUntil).getTime() > now);

/** Whether the account has premium right now: what the paid features on the server ask (the Co-Pilot, server/api.ts). */
export async function isPremium(user: { id: string; username: string }): Promise<boolean> {
  if (isAdmin(user) || isDemo(user)) return true; // the demo account shows the whole product (and is not in the database)
  const [p] = await db()<{ premium_until: Date | null }[]>`select premium_until from users where id = ${user.id}`;
  return premiumActive(p?.premium_until);
}

/**
 * The full market model and the auction archive (vite.config.ts writes them to /data/, hashed in production). An
 * account without premium gets the lite copies instead (scripts/data/lite.ts: "market-model.lite…", "sales.lite…"),
 * so what the lite version does not show never reaches its browser.
 */
export const PREMIUM_DATA = /^\/data\/(market-model|sales)(-[0-9a-f]{6,})?\.(json|csv)$/;

/** Whether this request may read `path`: everything but the premium data files is open to any signed-in account. */
export async function mayRead(req: IncomingMessage, path: string): Promise<boolean> {
  if (!PREMIUM_DATA.test(path)) return true;
  const user = await currentUser(req);
  return Boolean(user && (await isPremium(user)));
}

async function userByName(username: string): Promise<User | null> {
  if (demo && demo.username.toLowerCase() === username.toLowerCase()) return demo;
  const [u] = await db()<User[]>`select id, username, salt, hash from users where lower(username) = lower(${username})`;
  return u ?? null;
}
/** Sign-in and "forgot password" take the username or the email address. */
async function userByLogin(login: string): Promise<User | null> {
  if (!login.includes("@")) return userByName(login);
  const [u] = await db()<User[]>`select id, username, salt, hash from users where lower(email) = lower(${login})`;
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

// ------------------------------------------------------------------------------------------------ email links
const normEmail = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const validEmail = (e: string) => e.length <= EMAIL_MAX && EMAIL.test(e);
const mailLang = (v: unknown): "de" | "en" => (v === "en" ? "en" : "de");

/**
 * Links in mails point at MIP_PUBLIC_URL (https://carbay.app), never at the Host header of the request: a forged Host
 * would otherwise send a password-reset link to someone else's site. Locally the dev server's own address.
 */
export function publicUrl(req: IncomingMessage) {
  const set = process.env.MIP_PUBLIC_URL?.replace(/\/+$/, "");
  if (set) return set;
  if (process.env.VERCEL || process.env.NODE_ENV === "production") return "https://carbay.app";
  return `http://${req.headers.host ?? "localhost:5173"}`;
}

async function emailTaken(email: string, exceptUserId: string) {
  const [u] = await db()<{ id: string }[]>`select id from users where lower(email) = lower(${email}) and id <> ${exceptUserId}`;
  return Boolean(u);
}

/** A fresh link of this kind for the user; earlier links of the same kind stop working. */
async function issueToken(userId: string, kind: "verify" | "reset", email: string, hours: number) {
  const token = randomBytes(32).toString("base64url");
  await db()`delete from email_tokens where expires_at < now()`;
  await db()`delete from email_tokens where user_id = ${userId} and kind = ${kind}`;
  await db()`insert into email_tokens (token_hash, user_id, kind, email, expires_at) values (${sha(token)}, ${userId}, ${kind}, ${email}, now() + make_interval(hours => ${hours}))`;
  return token;
}

async function sendVerifyMail(req: IncomingMessage, user: { id: string; username: string }, email: string, lang: "de" | "en") {
  const token = await issueToken(user.id, "verify", email, VERIFY_HOURS);
  const link = `${publicUrl(req)}/api/auth/verify?token=${token}`;
  const de = lang === "de";
  await sendMail(
    accountMail({
      to: email,
      subject: de ? "Bitte bestätigen Sie Ihre E-Mail-Adresse" : "Please confirm your email address",
      hello: de ? `Guten Tag, ${user.username},` : `Hello ${user.username},`,
      body: de
        ? "bitte bestätigen Sie, dass diese E-Mail-Adresse zu Ihrem Carbay-Konto gehört. Wir nutzen sie nur für Ihr Konto, etwa um ein vergessenes Passwort zurückzusetzen."
        : "please confirm that this email address belongs to your Carbay account. We use it for your account only, for instance to reset a forgotten password.",
      button: de ? "Adresse bestätigen" : "Confirm address",
      link,
      after: de
        ? `Der Link gilt ${VERIFY_HOURS} Stunden. Haben Sie kein Konto bei Carbay angelegt, können Sie diese E-Mail ignorieren.`
        : `The link is valid for ${VERIFY_HOURS} hours. If you did not create a Carbay account, you can ignore this email.`,
    }),
  );
}

async function sendResetMail(req: IncomingMessage, user: { id: string; username: string }, email: string, lang: "de" | "en") {
  const token = await issueToken(user.id, "reset", email, RESET_HOURS);
  // the token travels after #: it never reaches the server's logs, the page reads it in the browser
  const link = `${publicUrl(req)}/passwort-neu#${token}`;
  const de = lang === "de";
  await sendMail(
    accountMail({
      to: email,
      subject: de ? "Neues Passwort für Carbay" : "New password for Carbay",
      hello: de ? `Guten Tag, ${user.username},` : `Hello ${user.username},`,
      body: de
        ? "für Ihr Carbay-Konto wurde ein neues Passwort angefordert. Über den Button legen Sie es fest; danach sind alle anderen Geräte abgemeldet."
        : "a new password was requested for your Carbay account. Use the button to set it; all other devices are signed out afterwards.",
      button: de ? "Neues Passwort festlegen" : "Set a new password",
      link,
      after: de
        ? "Der Link gilt eine Stunde und nur einmal. Haben Sie nichts angefordert, ignorieren Sie diese E-Mail; Ihr Passwort bleibt dann unverändert."
        : "The link is valid for one hour and once only. If you did not request it, ignore this email; your password stays unchanged.",
    }),
  );
}

/** Mail failures are logged, not shown: the account works without the mail, and the link can be sent again. */
const tryMail = (p: Promise<void>) => p.catch((e) => console.error("mail", (e as Error).message));

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
    const [p] = isDemo(u)
      ? []
      : await db()<{ premium_until: Date | null; email: string | null; email_verified_at: Date | null; pending: string | null }[]>`
          select premium_until, email, email_verified_at,
                 (select t.email from email_tokens t where t.user_id = users.id and t.kind = 'verify' and t.expires_at > now()
                    and lower(t.email) <> lower(coalesce(users.email, '')) limit 1) as pending
          from users where id = ${u.id}`;
    const admin = isAdmin(u);
    return sendJson(res, 200, {
      username: u.username, admin, demo: isDemo(u), premiumUntil: p?.premium_until ?? null, premium: isDemo(u) || premiumActive(p?.premium_until, admin),
      email: p?.email ?? null, emailVerified: Boolean(p?.email_verified_at), pendingEmail: p?.pending ?? null,
    });
  }
  if (path === "/api/auth/export" && req.method === "GET") return exportAccount(req, res);
  if (path === "/api/auth/verify" && req.method === "GET") return verifyEmail(res, url);
  if (req.method !== "POST" || !sameOrigin(req)) return sendJson(res, 404, { error: "Not found" });

  if (path === "/api/auth/password") return changePassword(req, res);
  if (path === "/api/auth/delete") return deleteAccount(req, res);
  if (path === "/api/auth/email") return setEmail(req, res);
  if (path === "/api/auth/resend") return resendVerify(req, res);

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
    const email = normEmail(body.email);
    if (!validEmail(email)) return sendJson(res, 400, { error: "email_invalid" });
    if (await userByName(username)) return sendJson(res, 409, { error: "username_taken" });
    if (await emailTaken(email, "")) return sendJson(res, 409, { error: "email_taken" });
    const salt = randomBytes(16).toString("hex");
    const hash = (await hashPassword(password, salt)).toString("hex");
    const user: User = { id: randomUUID(), username, salt, hash };
    // the unique indexes on lower(username) and lower(email) settle two sign-ups racing for the same name or address
    const added = await db()`insert into users (id, username, salt, hash, email) values (${user.id}, ${username}, ${salt}, ${hash}, ${email}) on conflict do nothing`;
    if (!added.count) return sendJson(res, 409, { error: (await emailTaken(email, "")) ? "email_taken" : "username_taken" });
    await fail("reg:" + ip); // counts sign-ups too: at most a few new accounts per address and quarter hour
    await startSession(req, res, user.id);
    await tryMail(sendVerifyMail(req, user, email, mailLang(body.lang)));
    return sendJson(res, 201, { username });
  }

  if (path === "/api/auth/login") {
    const nameKey = "login:" + username.toLowerCase();
    const key = nameKey + "@" + ip; // this name from this address
    if ((await blocked(key)) || (await blocked("ip:" + ip)) || (await blocked(nameKey, MAX_FAILS_NAME))) return sendJson(res, 429, { error: "too_many" });
    const user = await userByLogin(username);
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

  // "Forgot password": the answer is always the same, so it does not reveal which names or addresses have an account.
  if (path === "/api/auth/forgot") {
    const login = typeof body.login === "string" ? body.login.trim() : "";
    if ((await blocked("forgot:" + ip, 5)) || (login && (await blocked("forgot:" + login.toLowerCase(), 3)))) return sendJson(res, 429, { error: "too_many" });
    await fail("forgot:" + ip);
    if (login) {
      await fail("forgot:" + login.toLowerCase());
      const user = await userByLogin(login);
      const [row] = user ? await db()<{ email: string | null }[]>`select email from users where id = ${user.id}` : [];
      if (user && row?.email) await tryMail(sendResetMail(req, user, row.email, mailLang(body.lang)));
    }
    return sendJson(res, 200, { ok: true });
  }

  if (path === "/api/auth/reset") {
    if (await blocked("reset:" + ip)) return sendJson(res, 429, { error: "too_many" });
    const token = typeof body.token === "string" ? body.token : "";
    const [t] = token
      ? await db()<{ user_id: string; email: string }[]>`select user_id, email from email_tokens where token_hash = ${sha(token)} and kind = 'reset' and expires_at > now()`
      : [];
    const user = t ? await userById(t.user_id) : null;
    if (!t || !user || isDemo(user)) {
      await fail("reset:" + ip);
      return sendJson(res, 400, { error: "link_invalid" });
    }
    if (password.length < PW_MIN || password.length > PW_MAX) return sendJson(res, 400, { error: "password_length" });
    if (password.toLowerCase() === user.username.toLowerCase()) return sendJson(res, 400, { error: "password_is_username" });
    const salt = randomBytes(16).toString("hex");
    const hash = (await hashPassword(password, salt)).toString("hex");
    await db().begin(async (tx) => {
      await tx`update users set salt = ${salt}, hash = ${hash} where id = ${user.id}`;
      // the link reached this inbox, so the address is confirmed as well
      await tx`update users set email_verified_at = coalesce(email_verified_at, now()) where id = ${user.id} and lower(email) = lower(${t.email})`;
      await tx`delete from email_tokens where user_id = ${user.id} and kind = 'reset'`;
      await tx`delete from sessions where user_id = ${user.id}`; // every device is signed out
    });
    await clearFailures("login:" + user.username.toLowerCase());
    await startSession(req, res, user.id);
    return sendJson(res, 200, { username: user.username });
  }
  return sendJson(res, 404, { error: "Not found" });
}

// ------------------------------------------------------------------------------------------------ email address
/**
 * Sets or changes the account's address. The first address (accounts from before email was required) is stored at
 * once, unconfirmed; a change needs the password and takes effect only when the new address is confirmed.
 */
async function setEmail(req: IncomingMessage, res: ServerResponse) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "not signed in" });
  if (isDemo(user)) return sendJson(res, 403, { error: "demo" });
  let body: Record<string, unknown>;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "bad request" });
  }
  const email = normEmail(body.email);
  if (!validEmail(email)) return sendJson(res, 400, { error: "email_invalid" });
  if (await blocked("mail:" + user.id, 5)) return sendJson(res, 429, { error: "too_many" });
  const [row] = await db()<{ email: string | null }[]>`select email from users where id = ${user.id}`;
  if (row?.email) {
    const full = await userById(user.id);
    const password = typeof body.password === "string" ? body.password : "";
    const got = await hashPassword(password.slice(0, PW_MAX), full!.salt);
    if (!timingSafeEqual(got, Buffer.from(full!.hash, "hex"))) return sendJson(res, 400, { error: "wrong_password" });
  }
  if (await emailTaken(email, user.id)) return sendJson(res, 409, { error: "email_taken" });
  if (!row?.email) {
    const set = await db()`update users set email = ${email}, email_verified_at = null where id = ${user.id} and email is null`.catch(() => null);
    if (!set) return sendJson(res, 409, { error: "email_taken" });
  }
  await fail("mail:" + user.id);
  if (row?.email && row.email.toLowerCase() === email.toLowerCase()) {
    await db()`delete from email_tokens where user_id = ${user.id} and kind = 'verify'`; // back to the current address: drop a pending change
    return sendJson(res, 200, { ok: true });
  }
  try {
    await sendVerifyMail(req, user, email, mailLang(body.lang));
  } catch (e) {
    console.error("mail", (e as Error).message);
    return sendJson(res, row?.email ? 502 : 200, row?.email ? { error: "mail_failed" } : { ok: true, mail: false });
  }
  return sendJson(res, 200, { ok: true });
}

/** Sends the confirmation link again: for a pending change, else for the unconfirmed current address. */
async function resendVerify(req: IncomingMessage, res: ServerResponse) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "not signed in" });
  if (isDemo(user)) return sendJson(res, 403, { error: "demo" });
  let body: Record<string, unknown> = {};
  try {
    body = await readBody(req);
  } catch {
    /* language only */
  }
  if (await blocked("mail:" + user.id, 5)) return sendJson(res, 429, { error: "too_many" });
  const [row] = await db()<{ email: string | null; verified: boolean; pending: string | null }[]>`
    select email, email_verified_at is not null as verified,
           (select t.email from email_tokens t where t.user_id = users.id and t.kind = 'verify' and t.expires_at > now()
              and lower(t.email) <> lower(coalesce(users.email, '')) limit 1) as pending
    from users where id = ${user.id}`;
  const to = row?.pending ?? (row?.email && !row.verified ? row.email : null);
  if (!to) return sendJson(res, 400, { error: "nothing_to_confirm" });
  await fail("mail:" + user.id);
  try {
    await sendVerifyMail(req, user, to, mailLang(body.lang));
  } catch (e) {
    console.error("mail", (e as Error).message);
    return sendJson(res, 502, { error: "mail_failed" });
  }
  return sendJson(res, 200, { ok: true });
}

/** The link from the confirmation mail: stores the address as confirmed and opens the account page. */
async function verifyEmail(res: ServerResponse, url: URL) {
  const token = url.searchParams.get("token") ?? "";
  const [t] = token
    ? await db()<{ user_id: string; email: string }[]>`select user_id, email from email_tokens where token_hash = ${sha(token)} and kind = 'verify' and expires_at > now()`
    : [];
  let ok = false;
  if (t) {
    ok = await db()
      .begin(async (tx) => {
        await tx`update users set email = ${t.email}, email_verified_at = now() where id = ${t.user_id}`;
        await tx`delete from email_tokens where user_id = ${t.user_id} and kind = 'verify'`;
        return true;
      })
      .catch(() => false); // the address was taken by another account in the meantime
  }
  return redirect(res, "/konto?email=" + (ok ? "bestaetigt" : "ungueltig"));
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
  const [account] = await sql`select username, email, email_verified_at, created_at, premium_until from users where id = ${user.id}`;
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
  // without the table (migration 014 not applied yet) nobody has paid
  const [{ has }] = await sql<{ has: boolean }[]>`select to_regclass('premium_payments') is not null as has`;
  const payments = has ? await sql`select id, paid_at, months, amount, currency, refunded_at from premium_payments where user_id = ${user.id} order by paid_at` : [];
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="carbay-${user.username.replace(/[^\w.-]/g, "_")}-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ exported_at: new Date().toISOString(), account, state: state ?? null, cars, payments, forum: { topics, posts, reports }, sessions }, null, 2));
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
    await tx`delete from email_tokens where user_id = ${user.id}`;
    await tx`delete from user_state where user_id = ${user.id}`;
    await tx`delete from user_cars where user_id = ${user.id} and status <> 'approved'`;
    await tx`update user_cars set user_id = ${gone}, vin = '', notes = null, appraiser = null, contract = null, contract_name = null, ai_check = null,
             contract_deleted_at = coalesce(contract_deleted_at, now()) where user_id = ${user.id}`;
    await tx`delete from forum_reports where user_id = ${user.id}`;
    await tx`delete from rate_events where key like ${"%:" + user.id}`;
    await tx`update forum_topics set user_id = ${gone}, username = '[gelöscht]' where user_id = ${user.id}`;
    await tx`update forum_posts set user_id = ${gone}, username = '[gelöscht]' where user_id = ${user.id}`;
    // payments stay as bookkeeping, without the account (the receipt itself is with Stripe); skipped while the
    // table does not exist yet (migration 014)
    const [{ has }] = await tx<{ has: boolean }[]>`select to_regclass('premium_payments') is not null as has`;
    if (has) await tx`update premium_payments set user_id = ${gone} where user_id = ${user.id}`;
    await tx`delete from users where id = ${user.id}`;
  });
  setCookie(req, res, "", 0);
  return sendJson(res, 200, { ok: true });
}

// ------------------------------------------------------------------------------------------------ gate
const OPEN = new Set(["/anmelden", "/favicon.svg", "/favicon-32.png", "/apple-touch-icon.png", "/brand/carbay-wordmark.svg", "/brand/carbay-wordmark-light.svg"]);
// the typefaces are served from this site (public/fonts), not from Google; the sign-in page needs them too
const isOpen = (path: string) => OPEN.has(path) || /^\/fonts\/[\w.-]+\.(woff2|txt)$/.test(path);

/** Handles the request if it must not reach the app (sign-in page, auth API, legal pages for guests). Returns true then. */
export async function authGate(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/auth/")) {
    await handleAuth(req, res, url);
    return true;
  }
  if (url.pathname === "/anmelden" || url.pathname === "/passwort-neu") {
    // /passwort-neu (the link from the reset mail) opens even with a session: the new password is set either way
    if (url.pathname === "/anmelden" && (await currentUser(req))) return redirect(res, safeNext(url.searchParams.get("next")));
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
  if (req.method === "GET" && (req.headers.accept ?? "").includes("text/html") && (await currentUser(req))) await renewSession(req, res);
  // guests go on to the app as well: the lite data is open, the APIs answer 401 where an account is needed
  return false;
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
// Standalone page (no app bundle), so it stays small and its script can be pinned by hash. Guests reach the app from
// here without an account ("Ohne Konto ansehen").
/**
 * Porsche press photo (Porsche AG): Carrera GT in front of the Porsche plant in Leipzig, from the Carrera GT gallery
 * (src/data/real/launch.json). The press database renders it at 3840 px for wide screens, 1920 px for phones.
 */
const LOGIN_PHOTO_BASE = "https://porschepictures.flowcenter.de/pmdb/thumbnail.cgi?id=308076&crop=0&public=1&cs=885d64d0f5789296";
const LOGIN_PHOTO = LOGIN_PHOTO_BASE + "&w=3840&h=2560";
const LOGIN_PHOTO_SMALL = LOGIN_PHOTO_BASE + "&w=1920&h=1280";
const LOGIN_PAGE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml" />
<link rel="icon" href="/favicon-32.png?v=3" type="image/png" sizes="32x32" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3" />
<link rel="preload" href="/fonts/instrument-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
<meta name="theme-color" content="#10272b" />
<title>Anmelden – Carbay</title>
<style>
  @font-face { font-family:"Instrument Sans"; font-style:normal; font-weight:400 700; font-display:swap; src:url(/fonts/instrument-sans-latin-ext-wght-normal.woff2) format("woff2");
    unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
  @font-face { font-family:"Instrument Sans"; font-style:normal; font-weight:400 700; font-display:swap; src:url(/fonts/instrument-sans-latin-wght-normal.woff2) format("woff2");
    unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
  @font-face { font-family:"Source Serif 4"; font-style:italic; font-weight:200 900; font-display:swap; src:url(/fonts/source-serif-4-latin-opsz-italic.woff2) format("woff2");
    unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
  /* the app's colours (src/index.css). Wide screens: the photo across the whole page (Porsche tower above, Carrera GT
     below), the claim on the left over a petrol veil, the form card on the right. Narrow screens: photo head, form below. */
  :root { --bg:#f6f4ef; --panel:#fcfbf8; --field:#ffffff; --line:#e0dbd2; --line2:#c6bfb3; --ink:#1f1d1a; --muted:#5e5952; --faint:#8b847a;
          --accent:#16363c; --accent2:#0e2529; --on-accent:#f6f4ef; --night:16 39 43; --gold:#d3ad66; --gold-line:#c9a35e; --on-night:#f3efe6; --down:#a33a2b; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --bg:#121412; --panel:#161816; --field:#212422; --line:#2f3330; --line2:#4a4f4b; --ink:#eeeae1; --muted:#b4ada1; --faint:#8d877d;
          --accent:#729da4; --accent2:#9dbcc0; --on-accent:#121412; --night:23 36 39; --gold-line:rgb(211 173 102 / .45); --down:#ee8a7a; }
  }
  :root[data-theme="dark"] { --bg:#121412; --panel:#161816; --field:#212422; --line:#2f3330; --line2:#4a4f4b; --ink:#eeeae1; --muted:#b4ada1; --faint:#8d877d;
          --accent:#729da4; --accent2:#9dbcc0; --on-accent:#121412; --night:23 36 39; --gold-line:rgb(211 173 102 / .45); --down:#ee8a7a; }
  * { box-sizing: border-box; }
  [hidden] { display:none !important; }
  html, body { height:100%; }
  body { margin:0; background:#10272b; color:var(--ink); font:15px/1.5 "Instrument Sans","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
  /* The photo is its own layer, fixed to the window: however tall the card gets (sign in or create account), the photo
     keeps its size and crop. */
  .photo { position:fixed; inset:0; background:#10272b url(${LOGIN_PHOTO}) 50% 100% / cover no-repeat; }
  .photo::after { content:""; position:absolute; inset:0;
                  background:linear-gradient(90deg, rgb(var(--night) / .9) 0%, rgb(var(--night) / .62) 30%, rgb(var(--night) / .08) 58%, transparent 100%),
                             linear-gradient(0deg, rgb(var(--night) / .55) 0%, transparent 22%); }
  .stage { position:relative; min-height:100%; display:grid; grid-template-columns:minmax(0,1fr) 400px; gap:48px; align-items:start;
           padding:clamp(28px,5vh,56px) clamp(28px,4.5vw,72px) 72px; }
  .intro { color:var(--on-night); max-width:520px; }
  .logo { margin:0 0 30px; line-height:0; }
  .logo img { height:64px; width:auto; }
  .rule { width:56px; height:1px; background:var(--gold); margin:0 0 22px; }
  .claim { margin:0 0 12px; font:400 50px/1.06 "Source Serif 4","Iowan Old Style",Georgia,serif; letter-spacing:-.01em; color:#fbf8f1; text-shadow:0 1px 18px rgb(0 0 0 / .25); }
  .tag { margin:0 0 26px; font:italic 18px/1.45 "Source Serif 4","Iowan Old Style",Georgia,serif; color:rgb(243 239 230 / .8); }
  .facts { list-style:none; margin:0; padding:0; display:grid; gap:9px; font-size:14px; color:rgb(243 239 230 / .88); }
  .facts li { display:flex; align-items:center; gap:10px; }
  .facts li::before { content:""; width:16px; height:1px; background:var(--gold); flex:none; }
  .guest { display:inline-flex; align-items:center; gap:10px; margin-top:32px; padding:11px 20px; border:1px solid var(--gold); border-radius:4px; color:#fbf8f1; text-decoration:none; font-size:14px; font-weight:500; letter-spacing:.02em; transition:background .15s; }
  .guest:hover { background:rgb(201 163 94 / .2); }
  .credit { position:fixed; margin:0; right:20px; bottom:14px; font-size:11px; letter-spacing:.04em; color:rgb(243 239 230 / .55); }
  .card { display:flex; flex-direction:column; background:var(--panel); color:var(--ink); border-top:2px solid var(--gold-line); box-shadow:0 30px 80px -24px rgb(0 0 0 / .6); }
  .form { flex:1; display:flex; flex-direction:column; padding:30px 30px 22px; }
  #form { flex:1; display:flex; flex-direction:column; }
  .form h2 { margin:0 0 4px; font:400 28px/1.15 "Source Serif 4","Iowan Old Style",Georgia,serif; letter-spacing:-.01em; }
  .form .sub { margin:0 0 22px; font-size:13.5px; color:var(--muted); }
  .tabs { display:flex; gap:6px; padding:4px; margin:0 0 22px; background:var(--bg); border:1px solid var(--line); border-radius:999px; }
  .tabs button { flex:1; background:none; border:0; border-radius:999px; padding:7px 0; font:inherit; font-size:14px; font-weight:500; color:var(--muted); cursor:pointer; transition:background .15s,color .15s; }
  .tabs button[aria-selected="true"] { background:var(--accent); color:var(--on-accent); }
  label { display:block; font-size:11.5px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin:0 0 6px; }
  input { width:100%; font:inherit; font-size:16px; color:var(--ink); background:var(--field); border:1px solid var(--line2); padding:11px 12px; margin:0 0 4px; border-radius:4px; }
  input:focus { outline:2px solid var(--accent); outline-offset:-1px; border-color:transparent; }
  .hint { font-size:12.5px; color:var(--faint); margin:0 0 16px; min-height:1em; }
  .submit { width:100%; margin-top:6px; padding:13px; background:var(--accent); color:var(--on-accent); border:0; border-radius:4px; font:inherit; font-size:14px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; transition:background .15s; }
  .submit:hover { background:var(--accent2); }
  .submit:disabled { opacity:.6; cursor:default; }
  .err { color:var(--down); font-size:14px; margin:12px 0 0; min-height:1.2em; }
  .note { font-size:12.5px; line-height:1.45; color:var(--muted); margin:auto 0 0; padding-top:14px; } .note a, .note button { color:inherit; }
  .note button, .linkbtn { background:none; border:0; padding:0; font:inherit; text-decoration:underline; text-underline-offset:2px; cursor:pointer; }
  .pwrow { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
  .pwrow .linkbtn { flex:none; font-size:12.5px; color:var(--accent); margin:0 0 16px; }
  .ok { color:var(--accent); font-size:14px; margin:12px 0 0; }
  .foot { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:12px 30px; border-top:1px solid var(--line); font-size:12px; color:var(--faint); }
  .lang button { background:none; border:0; font:inherit; letter-spacing:.08em; color:var(--faint); cursor:pointer; padding:2px 4px; }
  .lang button[aria-pressed="true"] { color:var(--ink); font-weight:600; }
  .legal a { color:var(--faint); text-decoration:none; margin-left:14px; } .legal a:hover { color:var(--ink); }
  @media (max-width: 900px) {
    body { background:var(--bg); }
    .photo { display:none; }
    .stage { display:block; padding:0; background:var(--bg); }
    .intro { max-width:none; padding:0 22px 52px; background:rgb(var(--night)); }
    .intro::before { content:""; display:block; margin:0 -22px 22px; aspect-ratio:16 / 9;
                     background:linear-gradient(0deg, rgb(var(--night)) 0%, transparent 35%), linear-gradient(180deg, rgb(var(--night) / .75) 0%, transparent 32%), url(${LOGIN_PHOTO_SMALL}) 50% 50% / cover no-repeat; }
    .logo { position:absolute; top:18px; left:22px; margin:0; } .logo img { height:40px; }
    .rule, .facts { display:none; }
    .claim { font-size:30px; text-shadow:none; } .tag { font-size:15.5px; margin:0; }
    .guest { margin-top:20px; padding:9px 16px; font-size:13.5px; }
    .credit { position:absolute; top:calc(56.25vw - 22px); bottom:auto; right:12px; }
    .card { margin:-30px 14px 28px; }
    .form { padding:24px 22px 20px; } .foot { padding:12px 22px; }
  }
</style>
</head>
<body>
<div class="photo" aria-hidden="true"></div>
<main class="stage">
  <section class="intro">
    <h1 class="logo"><img src="/brand/carbay-wordmark-light.svg?v=2" alt="Carbay" width="133" height="64" /></h1>
    <div class="rule"></div>
    <p class="claim" data-de="Was Ihre Leidenschaft heute wert ist." data-en="What your passion is worth today."></p>
    <p class="tag" data-de="Marktintelligenz für Sportwagen" data-en="Market intelligence for sports cars"></p>
    <ul class="facts">
      <li data-de="Marktwerte aus echten Verkäufen" data-en="Market values from real sales"></li>
      <li data-de="Täglich aktualisiert" data-en="Updated daily"></li>
      <li data-de="Marktdaten seit 2015" data-en="Market data since 2015"></li>
    </ul>
    <a class="guest" id="guest" href="/"><span data-de="Ohne Konto ansehen" data-en="Look around without an account"></span><span aria-hidden="true">→</span></a>
  </section>
  <section class="card">
    <div class="form">
      <h2 id="title"></h2>
      <p class="sub" id="sub"></p>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" id="tab-login" aria-selected="true" data-de="Anmelden" data-en="Sign in"></button>
        <button type="button" role="tab" id="tab-register" aria-selected="false" data-de="Konto anlegen" data-en="Create account"></button>
      </div>
      <form id="form" novalidate>
        <div id="row-user">
          <label for="username" id="ulabel"></label>
          <input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="254" />
          <p class="hint" id="uhint"></p>
        </div>
        <div id="row-email" hidden>
          <label for="email" data-de="E-Mail-Adresse" data-en="Email address"></label>
          <input id="email" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" />
          <p class="hint" data-de="Nur für Ihr Konto, nie für Werbung." data-en="For your account only, never for advertising."></p>
        </div>
        <div id="row-pw">
          <label for="password" id="plabel"></label>
          <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="200" />
          <div class="pwrow"><p class="hint" id="phint"></p><button type="button" class="linkbtn" id="to-forgot" data-de="Passwort vergessen?" data-en="Forgot password?"></button></div>
        </div>
        <div id="repeat-wrap" hidden>
          <label for="password2" data-de="Passwort wiederholen" data-en="Repeat password"></label>
          <input id="password2" type="password" autocomplete="new-password" maxlength="200" />
          <p class="hint"></p>
        </div>
        <button class="submit" id="submit" type="submit"></button>
        <p class="err" id="err" role="alert"></p>
        <p class="ok" id="ok" role="status" hidden></p>
        <p class="note" id="note-login"><span data-de="Neu bei Carbay? " data-en="New to Carbay? "></span><button type="button" id="to-register" data-de="Konto anlegen" data-en="Create an account"></button></p>
        <p class="note" id="note" hidden><span data-de="Ihre E-Mail-Adresse nutzen wir nur für Ihr Konto, nicht für Werbung. Details in der " data-en="We use your email address for your account only, never for advertising. Details in the "></span><a href="/datenschutz" data-de="Datenschutzerklärung" data-en="privacy notice"></a>.</p>
        <p class="note" id="note-back" hidden><button type="button" id="to-login" data-de="Zurück zur Anmeldung" data-en="Back to sign in"></button></p>
      </form>
    </div>
    <div class="foot">
      <span class="lang"><button type="button" data-lang="de">DE</button> | <button type="button" data-lang="en">EN</button></span>
      <span class="legal"><a href="/impressum">Impressum</a><a href="/datenschutz" data-de="Datenschutz" data-en="Privacy"></a></span>
    </div>
  </section>
  <p class="credit" data-de="Foto: Porsche AG" data-en="Photo: Porsche AG"></p>
</main>
<script>
(function () {
  try { var th = localStorage.getItem("mip-theme"); if (th === "light" || th === "dark") document.documentElement.setAttribute("data-theme", th); } catch (e) {}
  var lang = "de";
  try { lang = (localStorage.getItem("mip-lang") || localStorage.getItem("motrkt-lang")) === "en" ? "en" : "de"; } catch (e) {}
  // /passwort-neu#<token> is the link from the reset mail; the token is taken out of the address at once
  var query = new URLSearchParams(location.search);
  // /anmelden?neu opens on "create account" (the app's buttons for guests link there)
  var mode = location.pathname === "/passwort-neu" ? "reset" : query.has("neu") ? "register" : "login";
  var resetToken = mode === "reset" ? location.hash.slice(1) : "";
  if (mode === "reset") { try { history.replaceState(null, "", location.pathname); } catch (e) {} }
  var T = {
    de: { login: "Anmelden", register: "Konto anlegen", forgot: "Link senden", reset: "Passwort speichern",
          title_login: "Willkommen zurück", sub_login: "Melden Sie sich mit Benutzername oder E-Mail an.",
          title_register: "Konto anlegen", sub_register: "In einer Minute startklar.",
          title_forgot: "Passwort vergessen", sub_forgot: "Wir schicken Ihnen einen Link für ein neues Passwort.",
          title_reset: "Neues Passwort", sub_reset: "Legen Sie ein neues Passwort für Ihr Konto fest.",
          ulabel: "Benutzername", ulabel_login: "Benutzername oder E-Mail", plabel: "Passwort", plabel_reset: "Neues Passwort",
          uhint: "3–30 Zeichen: Buchstaben, Ziffern, . - _", phint: "Mindestens 8 Zeichen",
          sent: "Gehört zu dieser Angabe ein Konto, ist ein Link an die hinterlegte E-Mail-Adresse unterwegs. Er gilt eine Stunde.",
          wrong_credentials: "Benutzername oder Passwort stimmt nicht.", username_taken: "Dieser Benutzername ist schon vergeben.",
          username_invalid: "Benutzername: 3–30 Zeichen, nur Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich.",
          email_invalid: "Bitte eine gültige E-Mail-Adresse eingeben.", email_taken: "Diese E-Mail-Adresse gehört schon zu einem Konto.",
          password_length: "Das Passwort braucht mindestens 8 Zeichen.", password_is_username: "Das Passwort darf nicht der Benutzername sein.",
          link_invalid: "Der Link ist abgelaufen oder wurde schon benutzt. Fordern Sie einfach einen neuen an.",
          mismatch: "Die Passwörter stimmen nicht überein.", too_many: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.",
          empty: "Bitte alle Felder ausfüllen.", network: "Keine Verbindung zum Server.", failed: "Das hat nicht geklappt. Bitte erneut versuchen." },
    en: { login: "Sign in", register: "Create account", forgot: "Send link", reset: "Save password",
          title_login: "Welcome back", sub_login: "Sign in with your username or email.",
          title_register: "Create an account", sub_register: "Ready in a minute.",
          title_forgot: "Forgot password", sub_forgot: "We will send you a link to set a new password.",
          title_reset: "New password", sub_reset: "Set a new password for your account.",
          ulabel: "Username", ulabel_login: "Username or email", plabel: "Password", plabel_reset: "New password",
          uhint: "3–30 characters: letters, digits, . - _", phint: "At least 8 characters",
          sent: "If an account belongs to this entry, a link is on its way to its email address. It is valid for one hour.",
          wrong_credentials: "Username or password is wrong.", username_taken: "This username is already taken.",
          username_invalid: "Username: 3–30 characters, only letters, digits, dot, hyphen, underscore.",
          email_invalid: "Please enter a valid email address.", email_taken: "This email address already belongs to an account.",
          password_length: "The password needs at least 8 characters.", password_is_username: "The password must not be the username.",
          link_invalid: "The link has expired or was already used. Simply request a new one.",
          mismatch: "The passwords do not match.", too_many: "Too many attempts. Please try again in 15 minutes.",
          empty: "Please fill in all fields.", network: "No connection to the server.", failed: "That did not work. Please try again." }
  };
  var $ = function (id) { return document.getElementById(id); };
  function render() {
    var L = T[lang];
    document.documentElement.lang = lang;
    document.title = (lang === "de" ? "Anmelden" : "Sign in") + " – Carbay";
    document.querySelectorAll("[data-de]").forEach(function (el) { el.textContent = el.getAttribute("data-" + lang); });
    document.querySelectorAll("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang)); });
    var reg = mode === "register", login = mode === "login", forgot = mode === "forgot", reset = mode === "reset";
    document.querySelector(".tabs").hidden = !(login || reg);
    $("tab-login").setAttribute("aria-selected", String(login));
    $("tab-register").setAttribute("aria-selected", String(reg));
    $("row-user").hidden = reset;
    $("row-email").hidden = !reg;
    $("row-pw").hidden = forgot;
    $("repeat-wrap").hidden = !(reg || reset);
    $("to-forgot").hidden = !login;
    $("note-login").hidden = !login;
    $("note").hidden = !reg;
    $("note-back").hidden = !(forgot || reset);
    $("ulabel").textContent = reg ? L.ulabel : L.ulabel_login;
    $("plabel").textContent = reset ? L.plabel_reset : L.plabel;
    $("username").maxLength = reg ? 30 : 254;
    $("password").autocomplete = reg || reset ? "new-password" : "current-password";
    $("uhint").textContent = reg ? L.uhint : "";
    $("phint").textContent = reg || reset ? L.phint : "";
    $("submit").textContent = L[mode];
    $("title").textContent = L["title_" + mode];
    $("sub").textContent = L["sub_" + mode];
    $("err").textContent = "";
    $("ok").hidden = true;
  }
  // The card keeps the height of the tallest mode (create account), so switching tabs moves nothing.
  var card = document.querySelector(".card");
  function lock() {
    var keep = mode, keepErr = $("err").textContent, keepOk = $("ok").hidden;
    card.style.minHeight = "";
    mode = "register"; render();
    var h = card.offsetHeight;
    mode = keep; render();
    $("err").textContent = keepErr;
    $("ok").hidden = keepOk;
    card.style.minHeight = h + "px";
  }
  var lastW = 0;
  window.addEventListener("resize", function () { if (window.innerWidth !== lastW) { lastW = window.innerWidth; lock(); } });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(lock);
  function go(m) { mode = m; render(); (m === "reset" ? $("password") : $("username")).focus(); }
  $("tab-login").onclick = $("to-login").onclick = function () { go("login"); };
  $("tab-register").onclick = $("to-register").onclick = function () { go("register"); };
  $("to-forgot").onclick = function () { go("forgot"); };
  document.querySelectorAll("[data-lang]").forEach(function (b) {
    b.onclick = function () { lang = b.getAttribute("data-lang"); try { localStorage.setItem("mip-lang", lang); } catch (e) {} render(); lock(); };
  });
  function post(path, body, done) {
    $("submit").disabled = true;
    $("err").textContent = "";
    fetch("/api/auth/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        $("submit").disabled = false;
        if (x.ok) return done();
        $("err").textContent = T[lang][x.j.error] || (mode === "login" ? T[lang].wrong_credentials : T[lang].failed);
      })
      .catch(function () { $("err").textContent = T[lang].network; $("submit").disabled = false; });
  }
  function target(to) {
    var next = to || query.get("next") || "/";
    return /^\\/(?![\\/\\\\])/.test(next) && !/[\\s\\\\]/.test(next) ? next : "/";
  }
  function enter(to) { location.replace(target(to)); }
  // back to the page the guest came from, without an account (the account pages would only send them here again)
  $("guest").href = /^\\/(konto|pruefung)([\\/?#]|$)/.test(target()) ? "/" : target();
  $("form").onsubmit = function (e) {
    e.preventDefault();
    var u = $("username").value.trim(), p = $("password").value, p2 = $("password2").value, em = $("email").value.trim();
    if (mode === "forgot") {
      if (!u) { $("err").textContent = T[lang].empty; return; }
      return post("forgot", { login: u, lang: lang }, function () { $("ok").textContent = T[lang].sent; $("ok").hidden = false; });
    }
    if (mode === "reset") {
      if (!p) { $("err").textContent = T[lang].empty; return; }
      if (p !== p2) { $("err").textContent = T[lang].mismatch; return; }
      if (!resetToken) { $("err").textContent = T[lang].link_invalid; return; }
      return post("reset", { token: resetToken, password: p }, function () { enter("/"); });
    }
    if (!u || !p || (mode === "register" && !em)) { $("err").textContent = T[lang].empty; return; }
    if (mode === "register" && em.indexOf("@") < 1) { $("err").textContent = T[lang].email_invalid; return; }
    if (mode === "register" && p !== p2) { $("err").textContent = T[lang].mismatch; return; }
    post(mode, mode === "register" ? { username: u, email: em, password: p, lang: lang } : { username: u, password: p }, function () { enter(); });
  };
  render();
  lastW = window.innerWidth;
  lock();
  (mode === "reset" ? $("password") : $("username")).focus();
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
  "img-src 'self' https://porschepictures.flowcenter.de",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
