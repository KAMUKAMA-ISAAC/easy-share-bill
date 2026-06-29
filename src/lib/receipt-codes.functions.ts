import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public receipt lookup by 6-character share code.
 * No login required. Uses admin client and returns sanitized fields only.
 * Codes expire 5 minutes after creation — expired codes return null.
 */

const CodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, "Code must be 6 characters"),
});

export const getExpenseByCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CodeSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: link, error: linkErr } = await supabaseAdmin
      .from("shared_links")
      .select("token, resource_type, resource_id, expires_at")
      .eq("share_code", data.code)
      .eq("resource_type", "expense")
      .maybeSingle();

    if (linkErr) throw new Error(linkErr.message);
    if (!link) return null;
    if (link.expires_at && new Date(link.expires_at) < new Date()) return null;

    const { data: expense } = await supabaseAdmin
      .from("expenses")
      .select(
        "id, description, amount, currency, expense_date, category, archived_at",
      )
      .eq("id", link.resource_id)
      .maybeSingle();

    if (!expense || expense.archived_at) return null;

    const { data: items } = await supabaseAdmin
      .from("expense_items")
      .select("id, name, price, quantity")
      .eq("expense_id", expense.id)
      .order("sort_order", { ascending: true });

    return {
      id: expense.id,
      description: expense.description,
      total: Number(expense.amount),
      currency: expense.currency,
      expense_date: expense.expense_date,
      merchant: expense.category,
      items: items ?? [],
      token: link.token,
    };
  });
