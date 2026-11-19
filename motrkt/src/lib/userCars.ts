import { useEffect, useState } from "react";
import { t } from "../i18n";

/** Client side of "Mein Fahrzeug melden" (server/userCars.ts). */

export type CarStatus = "awaiting_contract" | "pending" | "approved" | "rejected" | "expired";

/** What a report rests on: a purchase contract (car bought or sold) or an appraisal of a car the user owns. */
export type Kind = "kaufvertrag" | "gutachten";
export type ValueBasis = "marktwert" | "wiederbeschaffungswert" | "wiederherstellungswert";

export type UserCar = {
  id: string;
  status: CarStatus;
  created_at: string;
  kind: Kind;
  /** Appraisals only: who wrote it and what the value stands for. `price` is then the appraised value, `sale_date` its date. */
  appraiser: string | null;
  value_basis: ValueBasis | null;
  /** When the document was uploaded; it is deleted DOCUMENT_HOURS later at the latest. */
  contract_at: string | null;
  role: "kauf" | "verkauf" | null;
  variant_id: string;
  title: string;
  build_year: number;
  vin: string;
  km: number;
  price: string;
  currency: string;
  sale_date: string;
  country: string;
  counterparty: "privat" | "haendler" | "auktion" | null;
  body: string | null;
  gearbox: string | null;
  steering: string | null;
  color_ext: string | null;
  color_int: string | null;
  condition: string | null;
  matching_numbers: boolean | null;
  accident_free: boolean | null;
  notes: string | null;
  contract_name: string | null;
  contract_type: string | null;
  contract_size: number | null;
  contract_deleted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  /** The user allowed the AI pre-check by Anthropic for this report. */
  ai_consent: boolean;
};

export type AiCheck = {
  error?: string;
  is_vehicle_purchase_contract?: boolean;
  is_vehicle_appraisal?: boolean;
  legible?: boolean;
  extracted?: Record<string, string | number | boolean | null>;
  mismatches?: { field: string; entered: string; contract: string; comment: string }[];
  concerns?: string[];
  verdict?: "passt" | "abweichungen" | "unklar" | "kein_vertrag" | "kein_gutachten";
  summary?: string;
};

export type ReviewCar = UserCar & { ai_check: AiCheck | null; ai_checked_at: string | null; reviewer: string | null; username: string | null };

export type Me = {
  username: string;
  admin: boolean;
  demo: boolean;
  premiumUntil: string | null;
  /** the account's address (null: an account from before email was required, src/components/EmailGate.tsx) */
  email: string | null;
  emailVerified: boolean;
  /** a new address waiting for its confirmation link */
  pendingEmail: string | null;
};

/** The signed-in user (name, reviewer or not, premium until), from /api/auth/me. */
export function useMe(): Me | null {
  return useMeReload()[0];
}

/** useMe plus a function that asks the server again (after the email address changed). */
export function useMeReload(): [Me | null, () => void] {
  const [me, setMe] = useState<Me | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (j) =>
          live &&
          j &&
          setMe({
            username: j.username,
            admin: Boolean(j.admin),
            demo: Boolean(j.demo),
            premiumUntil: j.premiumUntil ?? null,
            email: j.email ?? null,
            emailVerified: Boolean(j.emailVerified),
            pendingEmail: j.pendingEmail ?? null,
          }),
      )
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [n]);
  return [me, () => setN((x) => x + 1)];
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { credentials: "same-origin", ...init });
  const j = r.headers.get("content-type")?.includes("json") ? await r.json() : {};
  if (!r.ok) throw Object.assign(new Error(j.error ?? String(r.status)), { status: r.status, body: j });
  return j as T;
}

/** An uploaded document is deleted this long after the upload at the latest (RETENTION.documentHours, server/userCars.ts). */
export const DOCUMENT_HOURS = 24;

export const KIND_LABEL = (k: Kind) => (k === "gutachten" ? t("Wertgutachten", "Appraisal") : t("Kaufvertrag", "Purchase contract"));
export const VALUE_BASIS_LABEL = (b: string | null) =>
  b === "wiederbeschaffungswert" ? t("Wiederbeschaffungswert", "Replacement value") : b === "wiederherstellungswert" ? t("Wiederherstellungswert", "Rebuild value") : t("Marktwert", "Market value");

export const STATUS_LABEL = (s: CarStatus, kind: Kind = "kaufvertrag") =>
  ({
    awaiting_contract: kind === "gutachten" ? t("Gutachten fehlt", "Appraisal missing") : t("Kaufvertrag fehlt", "Contract missing"),
    pending: t("Wird geprüft", "Under review"),
    approved: kind === "gutachten" ? t("Geprüft", "Verified") : t("Geprüft und übernommen", "Verified and included"),
    rejected: t("Abgelehnt", "Rejected"),
    expired: t("Dokument gelöscht", "Document deleted"),
  })[s] ?? s;

export const STATUS_TONE = (s: CarStatus): "up" | "down" | "gold" | "neutral" | "warn" =>
  s === "approved" ? "up" : s === "rejected" ? "down" : s === "pending" ? "gold" : "warn";

export const COUNTERPARTY = (c: string | null) =>
  c === "haendler" ? t("Händler", "Dealer") : c === "auktion" ? t("Auktionshaus", "Auction house") : t("Privat", "Private");

export const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
export const MAX_BYTES = 4 * 1024 * 1024;

/** Uploads the document (contract or appraisal); photos above the limit are scaled down in the browser first. */
export async function uploadContract(id: string, file: File) {
  let body: Blob = file;
  let type = file.type;
  if (file.size > MAX_BYTES && type.startsWith("image/")) {
    body = await shrinkImage(file);
    type = "image/jpeg";
  }
  if (body.size > MAX_BYTES) throw Object.assign(new Error("size"), { status: 413 });
  return api<{ ok: true }>(`/api/fahrzeuge/${id}/vertrag`, {
    method: "PUT",
    headers: { "Content-Type": type, "X-File-Name": encodeURIComponent(file.name) },
    body,
  });
}

async function shrinkImage(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), "image/jpeg", 0.85));
}
