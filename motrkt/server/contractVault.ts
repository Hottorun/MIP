import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Purchase contracts are encrypted before they reach the database (AES-256-GCM), with a key that lives only in the
 * server's environment (MIP_CONTRACT_KEY), never in the database. A copy of the database (backup, dump, a leaked
 * connection string) therefore holds no readable contract. The report's id is bound into the ciphertext, so a stored
 * file cannot be moved to another report.
 *
 *   MIP_CONTRACT_KEY   32 random bytes as base64 or hex:  openssl rand -base64 32
 *
 * Stored layout: "MIPENC1\0" | 12 bytes nonce | 16 bytes tag | ciphertext. Files stored before the key existed carry
 * no such header and are returned as they are. Contracts live only until the review decision, so changing the key
 * needs no re-encryption: users with an open report upload again.
 */

const MAGIC = Buffer.from("MIPENC1\0", "latin1");

let cached: { raw: string; key: Buffer } | null = null;

/** The key from MIP_CONTRACT_KEY, null when none is set. Throws when it is set but not 32 bytes. */
export function contractKey(): Buffer | null {
  const raw = (process.env.MIP_CONTRACT_KEY ?? "").trim();
  if (!raw) return null;
  if (cached?.raw === raw) return cached.key;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("MIP_CONTRACT_KEY muss 32 Byte lang sein (openssl rand -base64 32).");
  cached = { raw, key };
  return key;
}

/**
 * Whether contracts may be stored at all: with a key always; without one only off Vercel (local development), where
 * the file is then stored unencrypted. The public site promises encrypted storage, so production refuses instead.
 */
export function canStoreContracts() {
  try {
    return Boolean(contractKey()) || !process.env.VERCEL;
  } catch {
    return false;
  }
}

export const isSealed = (stored: Buffer) => stored.subarray(0, MAGIC.length).equals(MAGIC);

/** Encrypts a contract for the report `id`. Without a key (development only) the file is returned unchanged. */
export function seal(file: Buffer, id: string): Buffer {
  const key = contractKey();
  if (!key) return file;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(id, "utf8"));
  const body = Buffer.concat([cipher.update(file), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), body]);
}

/** The contract as uploaded. Throws when the key is missing or wrong, or the file belongs to another report. */
export function unseal(stored: Buffer, id: string): Buffer {
  if (!isSealed(stored)) return stored;
  const key = contractKey();
  if (!key) throw new Error("MIP_CONTRACT_KEY fehlt: der Vertrag ist verschlüsselt gespeichert.");
  const nonce = stored.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = stored.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(id, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(stored.subarray(MAGIC.length + 28)), decipher.final()]);
}
