import { createContext, useContext, type ReactNode } from "react";
import { ArrowRight, Crown, Lock as LockIcon } from "lucide-react";
import { usePlan, type LockReason } from "../../lib/plan";
import { cn } from "../../lib/format";
import { t } from "../../i18n";

/**
 * The locks of the lite version (src/lib/plan.tsx). A locked block keeps its heading and shows its content softly
 * blurred, cut short and dissolving into the page, under one small pill: the user sees that the data exists, not the
 * data itself. A click anywhere on the block opens the upgrade dialog.
 */

type LockInfo = { reason: LockReason; height?: number };

const LockContext = createContext<LockInfo | null>(null);
/** Set inside <Lock> for a lite user: <Section> (components/ui.tsx) then blurs its body. */
export const useLock = () => useContext(LockContext);

/** Everything inside is premium: for a lite user each <Section> in it keeps its heading and locks its body. */
export function Lock({ children, ...info }: LockInfo & { children: ReactNode }) {
  const { premium } = usePlan();
  if (premium) return <>{children}</>;
  return <LockContext.Provider value={info}>{children}</LockContext.Provider>;
}

/** A premium block without a <Section> around it (figure tiles, a paragraph): blurred for a lite user. */
export function Locked({ children, className, ...info }: LockInfo & { children: ReactNode; className?: string }) {
  const { premium } = usePlan();
  if (premium) return <>{children}</>;
  return (
    <LockedBody {...info} className={className}>
      {children}
    </LockedBody>
  );
}

export function LockedBody({ children, reason, height = 280, className }: LockInfo & { children: ReactNode; className?: string }) {
  const { openUpgrade } = usePlan();
  return (
    <div className={cn("lock group/lock relative min-h-[96px]", className)}>
      {/* the content is real, so the preview looks like the page it stands for; it takes no focus, clicks or screen reader */}
      <div className="lock-clip" style={{ maxHeight: height }} inert aria-hidden>
        <div className="lock-blur">
          <LockContext.Provider value={null}>{children}</LockContext.Provider>
        </div>
      </div>
      <button type="button" onClick={() => openUpgrade(reason)} className="absolute inset-0 grid cursor-pointer place-items-center p-4">
        <span className="lock-pill">
          <LockIcon className="size-3.5 shrink-0 text-gold-2" strokeWidth={1.8} aria-hidden />
          {t("Mit Premium freischalten", "Unlock with premium")}
          <ArrowRight className="size-3.5 shrink-0 text-muted transition-transform group-hover/lock:translate-x-0.5" aria-hidden />
        </span>
      </button>
    </div>
  );
}

/** The small "Premium" mark next to a locked heading or menu entry. */
export function PremiumTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold-soft px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.12em] text-gold-2 uppercase", className)}>
      <Crown className="size-3" strokeWidth={1.8} aria-hidden />
      Premium
    </span>
  );
}

/** One figure in a line of text or a table cell that a lite user does not get: a blurred stand-in, not the number. */
export function LockedValue({ reason, sample = "+0,0 %", label, className }: { reason: LockReason; sample?: string; label?: string; className?: string }) {
  const { openUpgrade } = usePlan();
  const title = label ?? t("Mit Premium sichtbar", "Visible with premium");
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openUpgrade(reason);
      }}
      title={title}
      aria-label={title}
      className={cn("inline-flex items-center gap-1 align-baseline text-muted hover:text-gold", className)}
    >
      <span className="text-ink/75 blur-[4.5px] select-none" aria-hidden>
        {sample}
      </span>
      <LockIcon className="size-3 shrink-0" strokeWidth={2} aria-hidden />
    </button>
  );
}
