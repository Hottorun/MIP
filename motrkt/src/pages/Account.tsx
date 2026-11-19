import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Download, KeyRound, Mail, Trash2 } from "lucide-react";
import { api, useMeReload, type Me } from "../lib/userCars";
import { useStore } from "../state/store";
import { Card, useConfirm } from "../components/ui";
import { cn, date } from "../lib/format";
import { getLang, t } from "../i18n";
import { usePlan } from "../lib/plan";
import { Crown } from "lucide-react";

const ERR: Record<string, () => string> = {
  wrong_password: () => t("Das aktuelle Passwort stimmt nicht.", "The current password is not correct."),
  password_length: () => t("Das neue Passwort braucht 8 bis 200 Zeichen.", "The new password needs 8 to 200 characters."),
  password_is_username: () => t("Das Passwort darf nicht der Benutzername sein.", "The password must not be the username."),
  demo: () => t("Das Demo-Konto wird geteilt und kann nicht geändert werden.", "The demo account is shared and cannot be changed."),
  email_invalid: () => t("Bitte eine gültige E-Mail-Adresse eingeben.", "Please enter a valid email address."),
  email_taken: () => t("Diese E-Mail-Adresse gehört schon zu einem anderen Konto.", "This email address already belongs to another account."),
  too_many: () => t("Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.", "Too many attempts. Please try again in 15 minutes."),
  mail_failed: () => t("Die E-Mail konnte nicht verschickt werden. Bitte später noch einmal versuchen.", "The email could not be sent. Please try again later."),
};
const errText = (e: unknown) => (ERR[(e as Error).message] ?? (() => t("Das hat nicht geklappt. Bitte später noch einmal versuchen.", "That did not work. Please try again later.")))();

/** The signed-in account: email address, password, data export and deletion (server/auth.ts). */
export default function Account() {
  const [me, reloadMe] = useMeReload();
  const { portfolio, watchlist, alerts } = useStore();
  const demo = me?.username.toLowerCase() === "demo";
  const plan = usePlan();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="text-[11px] tracking-[0.18em] text-gold uppercase">{t("Konto", "Account")}</div>
        <h1 className="mt-1 font-serif text-3xl">{me?.username ?? "…"}</h1>
        <p className="mt-2 text-[14px] text-muted">
          {t(
            `${portfolio.length} Fahrzeuge im Portfolio, ${watchlist.length} beobachtet, ${alerts.length} Preisalarme.`,
            `${portfolio.length} cars in the portfolio, ${watchlist.length} watched, ${alerts.length} price alerts.`,
          )}
        </p>
      </div>

      <Card title={t("Ihr Zugang", "Your plan")}>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-serif text-[20px]">
              {plan.premium && <Crown className="size-4 text-gold" strokeWidth={1.7} aria-hidden />}
              {plan.premium ? "Premium" : "Lite"}
            </div>
            <p className="mt-1 text-[14px] text-muted">
              {plan.premium
                ? me?.premiumUntil && Date.parse(me.premiumUntil) > Date.now()
                  ? t(`Aktiv bis ${date(Date.parse(me.premiumUntil))}. Jeder weitere geprüfte Beleg verlängert um ${plan.months} Monate.`, `Active until ${date(Date.parse(me.premiumUntil))}. Every further verified document adds ${plan.months} months.`)
                  : demo
                    ? t("Das Demo-Konto zeigt Carbay mit allen Premium-Funktionen.", "The demo account shows Carbay with every premium feature.")
                    : t("Als Prüfer haben Sie Premium dauerhaft.", "As a reviewer you have premium permanently.")
                : t(
                    "Marktwerte, Angebote, Portfolio, Forum und der Auktionskalender. Premium öffnet Wertverläufe, Verkäufe, das Auktionsarchiv, Insights und den Co-Pilot.",
                    "Market values, listings, portfolio, forum and the auction calendar. Premium opens value histories, sales, the auction archive, Insights and the Co-Pilot.",
                  )}
            </p>
          </div>
          {!plan.premium && (
            <button className="premium-cta sm:w-auto" onClick={() => plan.openUpgrade("general")}>
              {t("Premium freischalten", "Unlock premium")}
            </button>
          )}
        </div>
        {me?.admin && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 border-t border-line pt-4 text-[14px]">
            <input type="checkbox" className="mt-1 accent-[var(--color-gold)]" checked={plan.preview} onChange={(e) => plan.setPreview(e.target.checked)} />
            <span>
              {t("Lite-Ansicht testen", "Preview the lite version")}
              <span className="block text-[13px] text-muted">
                {t("Zeigt die App wie für ein Konto ohne Premium, nur in diesem Browser-Tab.", "Shows the app as an account without premium sees it, in this browser tab only.")}
              </span>
            </span>
          </label>
        )}
      </Card>

      {demo && (
        <p className="rounded-[3px] border border-line bg-panel-2 px-4 py-3 text-[14px] text-muted">
          {t("Das Demo-Konto wird geteilt: Passwort, Export und Löschung sind hier nicht möglich.", "The demo account is shared: password, export and deletion are not available here.")}
        </p>
      )}

      <EmailCard me={me} disabled={demo} reload={reloadMe} />

      <PasswordCard disabled={demo} />

      <Card title={t("Meine Daten", "My data")} sub={t("Alles, was zu diesem Konto gespeichert ist, als JSON-Datei.", "Everything stored for this account, as a JSON file.")}>
        <p className="text-[14px] text-muted">
          {t(
            "Kontodaten, Watchlist, Portfolio, Preisalarme, gemerkte Inserate, gemeldete Fahrzeuge mit Einwilligung und KI-Ergebnis (ohne hochgeladene Dokumente), Forumsbeiträge und Ihre Meldungen von Beiträgen. Einzelne Fahrzeugmeldungen löschen Sie im Portfolio.",
            "Account details, watchlist, portfolio, price alerts, saved listings, reported cars with consent and AI result (without uploaded documents), forum posts and your reports of posts. Single car reports can be deleted in the portfolio.",
          )}
        </p>
        <a href="/api/auth/export" download className={cn("btn mt-4", demo && "pointer-events-none opacity-50")}>
          <Download className="size-4" /> {t("Daten herunterladen", "Download my data")}
        </a>
      </Card>

      <DeleteCard disabled={demo} />

      <p className="text-[13px] text-faint">
        <Link to="/datenschutz" className="link">
          {t("Datenschutz", "Privacy")}
        </Link>
        {" · "}
        <Link to="/impressum" className="link">
          Impressum
        </Link>
      </p>
    </div>
  );
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** The account's email address: shown with its state, changed with the password, confirmed by the link in the mail. */
function EmailCard({ me, disabled, reload }: { me: Me | null; disabled: boolean; reload: () => void }) {
  const { toast } = useStore();
  const [params, setParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // back from the link in the confirmation mail (/api/auth/verify)
  const back = params.get("email");
  const shown = useRef(false); // once, also under React's double effects in development
  useEffect(() => {
    if (!back || shown.current) return;
    shown.current = true;
    if (back === "bestaetigt") toast(t("E-Mail-Adresse bestätigt.", "Email address confirmed."));
    else toast(t("Der Bestätigungslink ist abgelaufen oder wurde schon benutzt.", "The confirmation link has expired or was already used."), "error");
    params.delete("email");
    setParams(params, { replace: true });
  }, [back, params, setParams, toast]);

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api("/api/auth/email", json({ email: email.trim(), password, lang: getLang() }));
      setEmail("");
      setPassword("");
      toast(t("Bestätigungslink verschickt. Die neue Adresse gilt, sobald Sie ihn öffnen.", "Confirmation link sent. The new address takes effect once you open it."));
      reload();
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    setErr("");
    try {
      await api("/api/auth/resend", json({ lang: getLang() }));
      toast(t("Bestätigungslink erneut verschickt.", "Confirmation link sent again."));
    } catch (x) {
      setErr(errText(x));
    }
  };
  return (
    <Card title={t("E-Mail-Adresse", "Email address")} sub={t("Nur für Ihr Konto, etwa zum Zurücksetzen des Passworts; nie für Werbung.", "For your account only, e.g. to reset the password; never for advertising.")}>
      {!disabled && (
        <div className="mb-5 text-[14px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{me?.email ?? "–"}</span>
            {me?.email &&
              (me.emailVerified ? (
                <span className="inline-flex items-center gap-1 text-[13px] text-up">
                  <CheckCircle2 className="size-3.5" aria-hidden /> {t("bestätigt", "confirmed")}
                </span>
              ) : (
                <span className="text-[13px] text-warn">{t("noch nicht bestätigt", "not confirmed yet")}</span>
              ))}
          </div>
          {me?.pendingEmail && (
            <p className="mt-1 text-[13px] text-muted">
              {t(`Wechsel zu ${me.pendingEmail}: wartet auf die Bestätigung.`, `Change to ${me.pendingEmail}: waiting for confirmation.`)}
            </p>
          )}
          {(me?.pendingEmail || (me?.email && !me.emailVerified)) && (
            <button type="button" className="link mt-1 text-[13px]" onClick={resend}>
              {t("Bestätigungslink erneut senden", "Send the confirmation link again")}
            </button>
          )}
        </div>
      )}
      <form onSubmit={change} className="grid max-w-md gap-3">
        <div>
          <label className="label" htmlFor="email-next">{t("Neue E-Mail-Adresse", "New email address")}</label>
          <input id="email-next" className="input" type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required disabled={disabled} />
        </div>
        <div>
          <label className="label" htmlFor="email-pw">{t("Passwort zur Bestätigung", "Password to confirm")}</label>
          <input id="email-pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={disabled} />
        </div>
        {err && <p className="text-[13px] text-down">{err}</p>}
        <div>
          <button className="btn" type="submit" disabled={busy || disabled || !email.trim() || !password}>
            <Mail className="size-4" /> {t("Adresse ändern", "Change address")}
          </button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard({ disabled }: { disabled: boolean }) {
  const { toast } = useStore();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (next !== repeat) return setErr(t("Die Wiederholung stimmt nicht überein.", "The repeated password does not match."));
    setBusy(true);
    try {
      await api("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
      setCurrent("");
      setNext("");
      setRepeat("");
      toast(t("Passwort geändert. Andere Browser sind abgemeldet.", "Password changed. Other browsers are signed out."));
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t("Passwort ändern", "Change password")}>
      <form onSubmit={submit} className="grid max-w-md gap-3">
        <div>
          <label className="label" htmlFor="pw-current">{t("Aktuelles Passwort", "Current password")}</label>
          <input id="pw-current" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required disabled={disabled} />
        </div>
        <div>
          <label className="label" htmlFor="pw-next">{t("Neues Passwort (mindestens 8 Zeichen)", "New password (at least 8 characters)")}</label>
          <input id="pw-next" className="input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required disabled={disabled} />
        </div>
        <div>
          <label className="label" htmlFor="pw-repeat">{t("Neues Passwort wiederholen", "Repeat new password")}</label>
          <input id="pw-repeat" className="input" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required disabled={disabled} />
        </div>
        {err && <p className="text-[13px] text-down">{err}</p>}
        <div>
          <button className="btn btn-gold" type="submit" disabled={busy || disabled}>
            <KeyRound className="size-4" /> {t("Passwort ändern", "Change password")}
          </button>
        </div>
      </form>
    </Card>
  );
}

function DeleteCard({ disabled }: { disabled: boolean }) {
  const { confirm, dialog } = useConfirm();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const remove = async () => {
    setErr("");
    const ok = await confirm(
      t(
        "Konto, Sitzungen, Watchlist, Portfolio, Alarme und alle nicht freigegebenen Fahrzeugmeldungen samt Dokumenten werden gelöscht. Freigegebene Fahrzeuge (ohne Fahrgestellnummer und Notizen) und Forumsbeiträge bleiben ohne Bezug zum Konto erhalten; Forumsbeiträge lassen sich vorher im Forum löschen. Das lässt sich nicht rückgängig machen.",
        "Account, sessions, watchlist, portfolio, alerts and all car reports that are not approved, with their documents, will be deleted. Approved cars (without chassis number and notes) and forum posts remain, detached from the account; forum posts can be deleted in the forum first. This cannot be undone.",
      ),
      { title: t("Konto endgültig löschen?", "Delete the account for good?"), confirmLabel: t("Endgültig löschen", "Delete for good") },
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api("/api/auth/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      try {
        for (const k of Object.keys(localStorage)) if (k !== "mip-lang" && k !== "mip-theme") localStorage.removeItem(k);
        sessionStorage.clear();
      } catch {
        /* storage blocked */
      }
      window.location.replace("/anmelden");
    } catch (x) {
      setErr(errText(x));
      setBusy(false);
    }
  };
  return (
    <Card title={t("Konto löschen", "Delete account")} sub={t("Zur Bestätigung das Passwort eingeben.", "Enter your password to confirm.")}>
      {dialog}
      <div className="flex max-w-md flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="pw-delete">{t("Passwort", "Password")}</label>
          <input id="pw-delete" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={disabled} />
        </div>
        <button className="btn text-down hover:border-down" onClick={remove} disabled={busy || disabled || !password}>
          <Trash2 className="size-4" /> {t("Konto löschen", "Delete account")}
        </button>
      </div>
      {err && <p className="mt-2 text-[13px] text-down">{err}</p>}
    </Card>
  );
}
