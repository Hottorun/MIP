import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { api, useMe } from "../lib/userCars";
import { signOut } from "../lib/session";
import { useStore } from "../state/store";
import { getLang, t } from "../i18n";

/**
 * Every account needs an email address (server/auth.ts). Accounts from before it was required are asked for one here,
 * once, before they go on; the shared demo account is not asked. There is no way around the dialog but signing out.
 */
export function EmailGate() {
  const me = useMe();
  const { toast } = useStore();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => setOpen(Boolean(me && !me.demo && !me.email)), [me]);
  if (!open) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api("/api/auth/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), lang: getLang() }) });
      setOpen(false);
      toast(t("Danke! Bitte bestätigen Sie die Adresse über den Link in der E-Mail.", "Thank you! Please confirm the address with the link in the email."));
    } catch (x) {
      const code = (x as Error).message;
      setErr(
        code === "email_invalid"
          ? t("Bitte eine gültige E-Mail-Adresse eingeben.", "Please enter a valid email address.")
          : code === "email_taken"
            ? t("Diese E-Mail-Adresse gehört schon zu einem anderen Konto.", "This email address already belongs to another account.")
            : t("Das hat nicht geklappt. Bitte später noch einmal versuchen.", "That did not work. Please try again later."),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-[12vh] backdrop-blur-[2px]">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-gate-title"
        onSubmit={submit}
        className="animate-fade-in w-full max-w-md rounded-box border border-line border-t-2 border-t-gold bg-panel px-6 py-6 shadow-[0_24px_60px_-20px_rgba(20,20,20,0.3)]"
      >
        <div className="flex items-center gap-2 text-[11px] tracking-[0.18em] text-gold uppercase">
          <Mail className="size-3.5" aria-hidden /> {t("Neu bei Carbay", "New at Carbay")}
        </div>
        <h2 id="email-gate-title" className="mt-2 font-display text-2xl">
          {t("Bitte ergänzen Sie Ihre E-Mail-Adresse", "Please add your email address")}
        </h2>
        <p className="mt-2 text-[14px] text-muted">
          {t(
            "Jedes Konto hat jetzt eine E-Mail-Adresse. Wir nutzen sie nur für Ihr Konto, etwa um ein vergessenes Passwort zurückzusetzen, nicht für Werbung.",
            "Every account now has an email address. We use it for your account only, for instance to reset a forgotten password, never for advertising.",
          )}
        </p>
        <label className="label mt-5" htmlFor="email-gate">
          {t("E-Mail-Adresse", "Email address")}
        </label>
        <input id="email-gate" className="input" type="email" autoComplete="email" autoFocus required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        {err && <p className="mt-2 text-[13px] text-down">{err}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="link text-[13px] text-muted" onClick={() => void signOut()}>
            {t("Abmelden", "Sign out")}
          </button>
          <button className="btn btn-gold" type="submit" disabled={busy || !email.trim()}>
            {t("Speichern", "Save")}
          </button>
        </div>
        <p className="mt-4 text-[12.5px] text-faint">
          {t("Details in der ", "Details in the ")}
          <a href="/datenschutz" target="_blank" rel="noopener" className="link">
            {t("Datenschutzerklärung", "privacy notice")}
          </a>
          .
        </p>
      </form>
    </div>
  );
}
