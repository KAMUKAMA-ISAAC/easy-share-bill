// =============================================================================
// Splitit · Payment Vault Crypto
// Client-side AES-GCM encryption with PBKDF2-derived key from user's vault password.
// The password is NEVER sent to the server. We only store ciphertext + IV + salt.
// =============================================================================
import { supabase } from "@/integrations/supabase/client";

const VAULT_OK_PLAINTEXT = "splitit-vault-ok-v1";
const PBKDF2_ITERATIONS = 250_000;
const SESSION_KEY = "splitit:vault:session";

// ------------------- base64 helpers -------------------
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

// ------------------- key derivation -------------------
async function deriveKey(password: string, saltB64: string): Promise<CryptoKey> {
  const salt = b64ToBuf(saltB64);
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ------------------- core encrypt/decrypt -------------------
export type EncryptedBlob = { ciphertext: string; iv: string; salt: string };

export async function encryptString(plaintext: string, password: string, saltB64?: string): Promise<EncryptedBlob> {
  const salt = saltB64 ?? bufToB64(randomBytes(16).buffer);
  const key = await deriveKey(password, salt);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return { ciphertext: bufToB64(ct), iv: bufToB64(iv.buffer), salt };
}

export async function decryptString(blob: EncryptedBlob, password: string): Promise<string> {
  const key = await deriveKey(password, blob.salt);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBuf(blob.iv) },
    key,
    b64ToBuf(blob.ciphertext),
  );
  return new TextDecoder().decode(pt);
}

// ------------------- vault lifecycle -------------------
export type VaultStatus =
  | { state: "uninitialized" }
  | { state: "locked"; check: EncryptedBlob }
  | { state: "unlocked"; password: string };

export async function getVaultStatus(userId: string): Promise<VaultStatus> {
  // Try in-memory session first
  const sess = sessionGet();
  if (sess) return { state: "unlocked", password: sess };

  const { data, error } = await supabase
    .from("profiles")
    .select("vault_check, vault_check_iv, vault_check_salt")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // If columns don't exist yet (migration not run), treat as uninitialized.
    if (/column|does not exist|schema/i.test(error.message)) {
      return { state: "uninitialized" };
    }
    throw error;
  }
  if (!data?.vault_check || !data.vault_check_iv || !data.vault_check_salt) {
    return { state: "uninitialized" };
  }
  return {
    state: "locked",
    check: { ciphertext: data.vault_check, iv: data.vault_check_iv, salt: data.vault_check_salt },
  };
}

/** First-time setup: store an encrypted "ok" check token. */
export async function initVault(userId: string, password: string): Promise<void> {
  const blob = await encryptString(VAULT_OK_PLAINTEXT, password);
  const { error } = await supabase
    .from("profiles")
    .update({ vault_check: blob.ciphertext, vault_check_iv: blob.iv, vault_check_salt: blob.salt })
    .eq("id", userId);
  if (error) throw error;
  sessionSet(password);
}

/** Unlock: verify the password by decrypting the check token. */
export async function unlockVault(check: EncryptedBlob, password: string): Promise<boolean> {
  try {
    const v = await decryptString(check, password);
    if (v !== VAULT_OK_PLAINTEXT) return false;
    sessionSet(password);
    return true;
  } catch {
    return false;
  }
}

export function lockVault() {
  sessionClear();
}

export function getSessionPassword(): string | null {
  return sessionGet();
}

// Session stored only in sessionStorage (cleared on tab close)
function sessionGet(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SESSION_KEY);
}
function sessionSet(pw: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, pw);
}
function sessionClear() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
}

// ------------------- helpers for masking -------------------
export function maskNumber(n: string): string {
  const clean = n.replace(/\s/g, "");
  if (clean.length <= 4) return "\u2022\u2022\u2022\u2022 " + clean;
  return "\u2022\u2022\u2022\u2022 " + clean.slice(-4);
}
