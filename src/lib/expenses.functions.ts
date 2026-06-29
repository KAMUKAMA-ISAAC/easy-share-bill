import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SplitSchema = z.object({
  member_id: z.string().uuid(),
  amount: z.number().positive(),
  percentage: z.number().nullable().optional(),
});

const ItemSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive().default(1),
  assigned_member_ids: z.array(z.string().uuid()).default([]),
});

const CreateExpenseSchema = z.object({
  group_id: z.string().uuid().nullable(),
  description: z.string().min(1).max(200),
  category: z.string().max(50).default("general"),
  amount: z.number().positive(),
  currency: z.string().length(3).default("UGX"),
  expense_date: z.string(),
  split_mode: z.enum(["equal", "percentage", "custom", "itemized"]),
  claim_mode: z.enum(["free", "first_come", "preassigned"]).default("free"),
  payout_destination: z.enum(["direct", "wallet"]).default("direct"),
  paid_by_member_id: z.string().uuid(),
  splits: z.array(SplitSchema).min(1),
  items: z.array(ItemSchema).optional(),
  receipt_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateExpenseSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const splitSum = data.splits.reduce((a, s) => a + s.amount, 0);
    if (Math.abs(splitSum - data.amount) > 0.01) {
      throw new Error(
        `Split sum (${splitSum.toFixed(2)}) does not match total (${data.amount.toFixed(2)})`,
      );
    }

    const { data: expense, error } = await supabase
      .from("expenses")
      .insert({
        group_id: data.group_id,
        paid_by_user_id: userId,
        paid_by_member_id: data.paid_by_member_id,
        description: data.description,
        category: data.category,
        amount: data.amount,
        currency: data.currency,
        expense_date: data.expense_date,
        split_mode: data.split_mode,
        claim_mode: data.claim_mode,
        payout_destination: data.payout_destination,
        receipt_id: data.receipt_id ?? null,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();

    if (error || !expense) throw new Error(error?.message ?? "Failed to create expense");

    if (data.items?.length) {
      const { error: itemErr } = await supabase.from("expense_items").insert(
        data.items.map((it, i) => ({
          expense_id: expense.id,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          assigned_member_ids: it.assigned_member_ids,
          sort_order: i,
        })),
      );
      if (itemErr) throw new Error(itemErr.message);
    }

    const { error: splitErr } = await supabase.from("splits").insert(
      data.splits.map((s) => ({
        expense_id: expense.id,
        member_id: s.member_id,
        amount: s.amount,
        percentage: s.percentage ?? null,
        paid: s.member_id === data.paid_by_member_id,
      })),
    );
    if (splitErr) throw new Error(splitErr.message);

    return { id: expense.id };
  });

const CreateLinkSchema = z.object({
  resource_type: z.enum(["expense", "group"]),
  resource_id: z.string().uuid(),
});

// 6-char uppercase, no ambiguous chars (no 0/O/1/I).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function randomShareCode(): string {
  let out = "";
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

async function generateUniqueShareCode(supabase: any): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const code = randomShareCode();
    // Only collide with codes that are still active.
    const { data } = await supabase
      .from("shared_links")
      .select("id, expires_at")
      .eq("share_code", code)
      .maybeSingle();
    if (!data) return code;
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      // Free up the expired code by clearing it so we can reuse the slot.
      await supabase.from("shared_links").update({ share_code: null }).eq("id", data.id);
      return code;
    }
  }
  throw new Error("Could not generate a unique share code, try again");
}

export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateLinkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Invalidate any existing active codes for this resource — each share
    // generates a fresh code per spec.
    await supabase
      .from("shared_links")
      .update({ share_code: null, expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("resource_type", data.resource_type)
      .eq("resource_id", data.resource_id)
      .eq("created_by", userId);

    const token =
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const share_code = await generateUniqueShareCode(supabase);
    const expires_at = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const { data: link, error } = await supabase
      .from("shared_links")
      .insert({
        token,
        share_code,
        resource_type: data.resource_type,
        resource_id: data.resource_id,
        created_by: userId,
        expires_at,
      })
      .select("token, share_code, expires_at")
      .single();
    if (error || !link) throw new Error(error?.message ?? "Failed to create link");
    return {
      token: link.token,
      share_code: link.share_code as string,
      expires_at: link.expires_at as string,
    };
  });

const ArchiveSchema = z.object({ expense_id: z.string().uuid() });

export const archiveExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ArchiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("expenses")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.expense_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ArchiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("expenses")
      .update({ archived_at: null })
      .eq("id", data.expense_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  category: z.string().max(50).default("general"),
  color: z.string().max(20).default("#7C5CFF"),
  members: z
    .array(z.object({ display_name: z.string().min(1).max(80), email: z.string().email().optional().or(z.literal("")) }))
    .default([]),
});

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateGroupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: group, error } = await supabase
      .from("groups")
      .insert({
        name: data.name,
        description: data.description ?? null,
        category: data.category,
        color: data.color,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !group) throw new Error(error?.message ?? "Failed to create group");

    if (data.members.length) {
      const { error: mErr } = await supabase.from("group_members").insert(
        data.members.map((m) => ({
          group_id: group.id,
          display_name: m.display_name,
          email: m.email || null,
        })),
      );
      if (mErr) throw new Error(mErr.message);
    }
    return { id: group.id };
  });

const AddMemberSchema = z.object({
  group_id: z.string().uuid(),
  display_name: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")),
});

export const addGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddMemberSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: member, error } = await supabase
      .from("group_members")
      .insert({
        group_id: data.group_id,
        display_name: data.display_name,
        email: data.email || null,
      })
      .select("id, display_name")
      .single();
    if (error || !member) throw new Error(error?.message ?? "Failed to add member");
    return member;
  });

const DeleteGroupSchema = z.object({ group_id: z.string().uuid() });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteGroupSchema.parse(input))
  .handler(async ({ data, context }) => {
    // RLS already enforces creator-only delete
    const { error } = await context.supabase.from("groups").delete().eq("id", data.group_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
