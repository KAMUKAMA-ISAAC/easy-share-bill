import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public guest access via secure tokens — uses admin client because we
 * validate the token ourselves and return only sanitized fields.
 */

const TokenSchema = z.object({ token: z.string().min(8).max(200) });

export const getSharedExpense = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => TokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: link } = await supabaseAdmin
      .from("shared_links")
      .select("resource_type, resource_id, expires_at")
      .eq("token", data.token)
      .maybeSingle();

    if (!link) throw new Error("Link not found or expired");
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      throw new Error("This link has expired");
    }

    if (link.resource_type === "expense") {
      const { data: expense } = await supabaseAdmin
        .from("expenses")
        .select(
          "id, description, amount, currency, expense_date, split_mode, category, notes, group_id, paid_by_member_id",
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
        .select("name, price, quantity")
        .eq("expense_id", expense.id);

      const payer = members?.find((m) => m.id === expense.paid_by_member_id);

      return {
        type: "expense" as const,
        expense,
        splits: splits ?? [],
        members: members ?? [],
        items: items ?? [],
        payer_name: payer?.display_name ?? "Someone",
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: link } = await supabaseAdmin
      .from("shared_links")
      .select("resource_type, resource_id, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!link) throw new Error("Invalid link");
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      throw new Error("Link expired");
    }

    // Verify the split belongs to the linked expense (or a group's expense)
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
