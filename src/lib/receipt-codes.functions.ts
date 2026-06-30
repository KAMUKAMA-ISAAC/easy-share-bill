import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public receipt lookup by 6-character share code.
 * Uses the new SECURITY DEFINER RPC `share_get_by_code` — works with anon key,
 * no service role required.
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
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: result, error } = await supabase.rpc("share_get_by_code", {
      p_code: data.code,
    });
    if (error) {
      // Treat "not found" / "expired" as null so the UI can render gracefully
      if (/not found|expired|invalid/i.test(error.message)) return null;
      throw new Error(error.message);
    }
    if (!result || (result as any).type !== "expense") return null;
    const r = result as any;
    return {
      id: r.expense.id,
      description: r.expense.description,
      total: Number(r.expense.amount),
      currency: r.expense.currency,
      expense_date: r.expense.expense_date,
      merchant: r.expense.category,
      items: r.items ?? [],
      token: r.token,
    };
  });
