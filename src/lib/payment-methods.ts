import { supabase } from "@/integrations/supabase/client";
import { encryptString, maskNumber, type EncryptedBlob } from "./payment-vault";

export type PaymentMethodKind = "mtn_momo" | "airtel_money" | "bank";

export type PaymentMethod = {
  id: string;
  user_id: string;
  kind: PaymentMethodKind;
  label: string;
  display_hint: string;
  account_name: string | null;
  bank_name: string | null;
  encrypted_payload: string;
  iv: string;
  salt: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export async function listMethods(userId: string): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PaymentMethod[];
}

export type NewMethodInput = {
  kind: PaymentMethodKind;
  label: string;
  full_number: string;         // phone for momo, account no for bank
  account_name?: string;
  bank_name?: string;
  is_default?: boolean;
};

export async function createMethod(userId: string, password: string, input: NewMethodInput): Promise<PaymentMethod> {
  const cleanNumber = input.full_number.replace(/\s/g, "");
  const blob: EncryptedBlob = await encryptString(cleanNumber, password);

  // If this should be default, clear other defaults of same kind first
  if (input.is_default) {
    await supabase
      .from("payment_methods")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("kind", input.kind);
  }

  const row = {
    user_id: userId,
    kind: input.kind,
    label: input.label.trim(),
    display_hint: maskNumber(cleanNumber),
    account_name: input.account_name?.trim() || null,
    bank_name: input.bank_name?.trim() || null,
    encrypted_payload: blob.ciphertext,
    iv: blob.iv,
    salt: blob.salt,
    is_default: !!input.is_default,
  };
  const { data, error } = await supabase.from("payment_methods").insert(row).select("*").single();
  if (error) throw error;
  return data as PaymentMethod;
}

export async function deleteMethod(id: string): Promise<void> {
  const { error } = await supabase.from("payment_methods").delete().eq("id", id);
  if (error) throw error;
}

export async function setDefault(id: string, userId: string, kind: PaymentMethodKind): Promise<void> {
  await supabase
    .from("payment_methods")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("kind", kind);
  const { error } = await supabase
    .from("payment_methods")
    .update({ is_default: true })
    .eq("id", id);
  if (error) throw error;
}

export function kindLabel(kind: PaymentMethodKind): string {
  return {
    mtn_momo: "MTN Mobile Money",
    airtel_money: "Airtel Money",
    bank: "Bank account",
  }[kind];
}
