import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, KeyRound, Trash2 } from "lucide-react";
import { api, useMe } from "../lib/userCars";
import { useStore } from "../state/store";
import { Card, useConfirm } from "../components/ui";
import { cn, date } from "../lib/format";
import { t } from "../i18n";

const ERR: Record<string, () => string> = {
  wrong_password: () => t("Das aktuelle Passwort stimmt nicht.", "The current password is not correct."),
  password_length: () => t("Das neue Passwort braucht 8 bis 200 Zeichen.", "The new password needs 8 to 200 characters."),
  password_is_username: () => t("Das Passwort darf nicht der Benutzername sein.", "The password must not be the username."),
  demo: () => t("Das Demo-Konto wird geteilt und kann nicht geändert werden.", "The demo account is shared and cannot be changed."),
};
const errText = (e: unknown) => (ERR[(e as Error).message] ?? (() => t("Das hat nicht geklappt. Bitte später noch einmal versuchen.", "That did not work. Please try again later.")))();

/** The signed-in account: password, data export and deletion (server/auth.ts). */
export default function Account() {
  const me = useMe();
  const { portfolio, watchlist, alerts } = useStore();
  const demo = me?.username.toLowerCase() === "demo";
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="text-[11px] tracking-[0.18em] text-gold uppercase">{t("Konto", "Account")}</div>
        <h1 className="mt-1 font-serif text-3xl">{me?.username ?? "…"}</h1>
        <p className="mt-2 text-[14px] text-muted">
          {t(
            `${portfolio.length} Fahrzeuge im Portfolio, ${watchlist.length} beobachtet, ${alerts.length} Preisalarme.`,
            `${portfolio.length} cars in the portfolio, ${watchlist.length} watched, ${alerts.length} price alerts.`,
          )}{" "}
          {me?.premiumUntil
            ? t(`Premium bis ${date(Date.parse(me.premiumUntil))}.`, `Premium until ${date(Date.parse(me.premiumUntil))}.`)
            : t("Kein Premium.", "No premium.")}
        </p>
      </div>

      {demo && (
        <p className="rounded-[3px] border border-line bg-panel-2 px-4 py-3 text-[14px] text-muted">
          {t("Das Demo-Konto wird geteilt: Passwort, Export und Löschung sind hier nicht möglich.", "The demo account is shared: password, export and deletion are not available here.")}
        </p>
      )}

      <PasswordCard disabled={demo} />

      <Card title={t("Meine Daten", "My data")} sub={t("Alles, was zu diesem Konto gespeichert ist, als JSON-Datei.", "Everything stored for this account, as a JSON file.")}>
        <p className="text-[14px] text-muted">
          {t(
            "Kontodaten, Watchlist, Portfolio, Preisalarme, gemerkte Inserate, gemeldete Fahrzeuge mit Einwilligung und KI-Ergebnis (ohne Vertragsdateien), Forumsbeiträge und Ihre Meldungen von Beiträgen. Einzelne Fahrzeugmeldungen löschen Sie im Portfolio.",
            "Account details, watchlist, portfolio, price alerts, saved listings, reported cars with consent and AI result (without contract files), forum posts and your reports of posts. Single car reports can be deleted in the portfolio.",
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
        "Konto, Sitzungen, Watchlist, Portfolio, Alarme und alle nicht freigegebenen Fahrzeugmeldungen samt Verträgen werden gelöscht. Freigegebene Fahrzeuge (ohne Fahrgestellnummer und Notizen) und Forumsbeiträge bleiben ohne Bezug zum Konto erhalten; wer das nicht möchte, löscht sie vorher im Portfolio bzw. im Forum. Das lässt sich nicht rückgängig machen.",
        "Account, sessions, watchlist, portfolio, alerts and all car reports that are not approved, with their contracts, will be deleted. Approved cars (without chassis number and notes) and forum posts remain, detached from the account; to avoid that, delete them in the portfolio or the forum first. This cannot be undone.",
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
