/**
 * Account emails (sign-up code, confirm a changed address, reset the password) through Resend's API (data processing
 * agreement, see DATENSCHUTZ.md). Configuration: RESEND_API_KEY, MAIL_FROM (an address on a domain verified at
 * Resend), MAIL_FROM_NAME (default "Cartag"). Without a key the mail is not sent: in development it is printed to the
 * console so codes and links can be tried, in production sendMail throws.
 */

export type Mail = { to: string; subject: string; text: string; html: string };

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

/** Sends one mail; throws when it was not accepted. */
export async function sendMail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") throw new Error("mail not configured (RESEND_API_KEY, MAIL_FROM)");
    console.log(`\n[mail – not sent, no RESEND_API_KEY] to ${mail.to}: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  // the display name in quotes, so a comma or similar in MAIL_FROM_NAME cannot break the address
  const name = (process.env.MAIL_FROM_NAME || "Cartag").replace(/["\\\r\n]/g, "");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ from: `"${name}" <${from}>`, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain account mail: greeting, one paragraph, one button, a closing line. Text and HTML say the same. */
export function accountMail(o: { to: string; subject: string; hello: string; body: string; button: string; link: string; after: string }): Mail {
  const text = `${o.hello}\n\n${o.body}\n\n${o.link}\n\n${o.after}\n\nCartag`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<div style="font-family:Georgia,serif;font-style:italic;font-size:26px;color:#16363c;margin-bottom:24px">Cartag</div>
<div style="background:#fcfbf8;border-top:2px solid #c9a35e;padding:28px 26px">
<p style="margin:0 0 14px;font-size:15px">${esc(o.hello)}</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.5">${esc(o.body)}</p>
<p style="margin:0 0 22px"><a href="${esc(o.link)}" style="display:inline-block;background:#16363c;color:#f6f4ef;text-decoration:none;padding:12px 22px;border-radius:4px;font-size:14px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">${esc(o.button)}</a></p>
<p style="margin:0 0 6px;font-size:12.5px;color:#5e5952;word-break:break-all">${esc(o.link)}</p>
<p style="margin:18px 0 0;font-size:13px;color:#5e5952;line-height:1.5">${esc(o.after)}</p>
</div></div></body></html>`;
  return { to: o.to, subject: o.subject, text, html };
}

/** A mail with a one-time code instead of a button (the sign-up): greeting, one paragraph, the code large, a closing line. */
export function codeMail(o: { to: string; subject: string; hello: string; body: string; code: string; after: string }): Mail {
  const text = `${o.hello}\n\n${o.body}\n\n${o.code}\n\n${o.after}\n\nCartag`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<div style="font-family:Georgia,serif;font-style:italic;font-size:26px;color:#16363c;margin-bottom:24px">Cartag</div>
<div style="background:#fcfbf8;border-top:2px solid #c9a35e;padding:28px 26px">
<p style="margin:0 0 14px;font-size:15px">${esc(o.hello)}</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.5">${esc(o.body)}</p>
<p style="margin:0 0 22px;font-family:Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:.3em;color:#16363c">${esc(o.code)}</p>
<p style="margin:18px 0 0;font-size:13px;color:#5e5952;line-height:1.5">${esc(o.after)}</p>
</div></div></body></html>`;
  return { to: o.to, subject: o.subject, text, html };
}
