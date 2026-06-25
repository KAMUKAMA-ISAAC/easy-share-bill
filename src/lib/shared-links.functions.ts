import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public guest access via secure tokens. Uses the admin client because we
 * validate the token ourselves and return only sanitized fields.
 */

const TokenSchema = z.object({ token: z.string().min(8).max(200) });

async function loadLink(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: link } = await supabaseAdmin
    .from("shared_links")
    .select("resource_type, resource_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!link) throw new Error("Link not found or expired");
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    throw new Error("This link has expired");
  }
  return { link, supabaseAdmin };
}

async function loadPayerPaymentInfo(supabaseAdmin: any, expensePayerUserId: string | null) {
  if (!expensePayerUserId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(
      "display_name, momo_provider, momo_number, momo_name, bank_name, bank_account_number, bank_account_name",
    )
    .eq("id", expensePayerUserId)
    .maybeSingle();
  return data ?? null;
}

export const getSharedExpense = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => TokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { link, supabaseAdmin } = await loadLink(data.token);

    if (link.resource_type === "expense") {
      const { data: expense } = await supabaseAdmin
        .from("expenses")
        .select(
          "id, description, amount, currency, expense_date, split_mode, claim_mode, category, notes, group_id, paid_by_member_id, paid_by_user_id",
        )
        .eq("id", link.resource_id)
        .maybeSingle();
      if (!expense) throw new Error("Expense not found");

      const { data: splits } = await supabaseAdmin
        .from("splits")
        .select("id, member_id, amount, paid, paid_at")
        .eq("expense_id", expense.id);

      const memberIds = (splits ?? []).map((s) => s.member_id);
      const { data: members } = await supabaseAdmin
        .from("group_members")
        .select("id, display_name")
        .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);

      const { data: items } = await supabaseAdmin
        .from("expense_items")
        .select("id, name, price, quantity, locked, assigned_member_ids, sort_order")
        .eq("expense_id", expense.id)
        .order("sort_order", { ascending: true });

      const { data: claims } = await supabaseAdmin
        .from("item_claims")
        .select("id, item_id, guest_name, quantity, amount, paid, paid_at, payment_method")
        .eq("expense_id", expense.id);

      const payer = members?.find((m) => m.id === expense.paid_by_member_id);
      const payerPayment = await loadPayerPaymentInfo(supabaseAdmin, expense.paid_by_user_id);

      return {
        type: "expense" as const,
        expense,
        splits: splits ?? [],
        members: members ?? [],
        items: items ?? [],
        claims: claims ?? [],
        payer_name: payer?.display_name ?? "Someone",
        payer_payment: payerPayment,
      };
    }

    // group
    const { data: group } = await supabaseAdmin
      .from("groups")
      .select("id, name, description, color")
      .eq("id", link.resource_id)
      .maybeSingle();
    if (!group) throw new Error("Group not found");

    const { data: expenses } = await supabaseAdmin
      .from("expenses")
      .select("id, description, amount, currency, expense_date, paid_by_member_id")
      .eq("group_id", group.id)
      .order("expense_date", { ascending: false });

    const { data: members } = await supabaseAdmin
      .from("group_members")
      .select("id, display_name")
      .eq("group_id", group.id);

    return {
      type: "group" as const,
      group,
      expenses: expenses ?? [],
      members: members ?? [],
    };
  });

const MarkPaidSchema = z.object({
  token: z.string().min(8),
  split_id: z.string().uuid(),
  guest_name: z.string().min(1).max(80).optional(),
});

export const guestMarkSplitPaid = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => MarkPaidSchema.parse(input))
  .handler(async ({ data }) => {
    const { link, supabaseAdmin } = await loadLink(data.token);
    const { data: split } = await supabaseAdmin
      .from("splits")
      .select("id, amount, expense_id, paid")
      .eq("id", data.split_id)
      .maybeSingle();
    if (!split) throw new Error("Split not found");

    if (link.resource_type === "expense" && split.expense_id !== link.resource_id) {
      throw new Error("Split does not belong to this link");
    }
    if (link.resource_type === "group") {
      const { data: exp } = await supabaseAdmin
        .from("expenses")
        .select("group_id")
        .eq("id", split.expense_id)
        .maybeSingle();
      if (!exp || exp.group_id !== link.resource_id) {
        throw new Error("Split does not belong to this group");
      }
    }

    if (split.paid) return { ok: true, alreadyPaid: true };
    const now = new Date().toISOString();
    await supabaseAdmin.from("splits").update({ paid: true, paid_at: now }).eq("id", split.id);
    await supabaseAdmin.from("payments").insert({
      split_id: split.id,
      amount: split.amount,
      method: "guest_link",
      marked_by_token: data.token,
    });
    return { ok: true, alreadyPaid: false };
  });

const ClaimSchema = z.object({
  token: z.string().min(8),
  item_ids: z.array(z.string().uuid()).min(1),
  guest_name: z.string().min(1).max(80),
});

/** A guest claims one or more items from the shared receipt. */
export const guestClaimItems = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ClaimSchema.parse(input))
  .handler(async ({ data }) => {
    const { link, supabaseAdmin } = await loadLink(data.token);
    if (link.resource_type !== "expense") throw new Error("Claims only work on expense links");

    const { data: expense } = await supabaseAdmin
      .from("expenses")
      .select("id, claim_mode")
      .eq("id", link.resource_id)
      .maybeSingle();
    if (!expense) throw new Error("Expense not found");
    if (expense.claim_mode === "preassigned") {
      throw new Error("This bill was pre-assigned by the organiser");
    }

    const { data: items } = await supabaseAdmin
      .from("expense_items")
      .select("id, name, price, quantity, locked")
      .eq("expense_id", expense.id)
      .in("id", data.item_ids);

    if (!items || items.length !== data.item_ids.length) {
      throw new Error("Some items are no longer available");
    }

    if (expense.claim_mode === "first_come") {
      // Reject if anyone has already claimed any of these items
      const { data: existing } = await supabaseAdmin
        .from("item_claims")
        .select("item_id")
        .in("item_id", data.item_ids);
      if (existing && existing.length > 0) {
        throw new Error("Someone already grabbed one of those items — refresh and pick again");
      }
    }

    const rows = items.map((it) => ({
      item_id: it.id,
      expense_id: expense.id,
      guest_name: data.guest_name.trim(),
      quantity: it.quantity ?? 1,
      amount: Number(it.price) * (it.quantity ?? 1),
    }));

    const { data: inserted, error } = await supabaseAdmin
      .from("item_claims")
      .insert(rows)
      .select("id, item_id, amount");
    if (error) throw new Error(error.message);

    if (expense.claim_mode === "first_come") {
      await supabaseAdmin
        .from("expense_items")
        .update({ locked: true })
        .in("id", data.item_ids);
    }

    return {
      claim_ids: inserted?.map((r) => r.id) ?? [],
      total: rows.reduce((a, r) => a + r.amount, 0),
    };
  });

const PayClaimsSchema = z.object({
  token: z.string().min(8),
  claim_ids: z.array(z.string().uuid()).min(1),
  method: z.enum(["mtn_momo", "airtel_money", "bank_transfer"]),
  reference: z.string().max(120).optional(),
});

/**
 * Mock payment — flips claims to paid and records a payments row.
 * No real money moves.
 */
export const guestPayClaims = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PayClaimsSchema.parse(input))
  .handler(async ({ data }) => {
    const { link, supabaseAdmin } = await loadLink(data.token);
    if (link.resource_type !== "expense") throw new Error("Pay only works on expense links");

    const { data: claims } = await supabaseAdmin
      .from("item_claims")
      .select("id, amount, paid, expense_id")
      .in("id", data.claim_ids);
    if (!claims || claims.length === 0) throw new Error("Claims not found");
    if (claims.some((c) => c.expense_id !== link.resource_id)) {
      throw new Error("Claim does not belong to this link");
    }

    const unpaid = claims.filter((c) => !c.paid);
    if (unpaid.length === 0) return { ok: true, total: 0 };

    // Simulate a tiny processing delay
    await new Promise((r) => setTimeout(r, 900));

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("item_claims")
      .update({ paid: true, paid_at: now, payment_method: data.method })
      .in(
        "id",
        unpaid.map((c) => c.id),
      );

    const total = unpaid.reduce((a, c) => a + Number(c.amount), 0);
    return { ok: true, total };
  });
