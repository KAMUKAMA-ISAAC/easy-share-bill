import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * In-app wallet. Balance is the running sum of wallet_transactions.
 * Credits come from receipt payments where payout_destination='wallet'.
 * Withdrawals are recorded as 'withdrawal_pending' (no real disbursement).
 */

export const getWalletSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Ensure a wallet row exists
    await supabase.from("wallets").upsert(
      { user_id: userId, balance: 0, currency: "UGX" },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance, currency, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: tx } = await supabase
      .from("wallet_transactions")
      .select("id, amount, kind, description, reference, status, created_at, expense_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    return {
      balance: Number(wallet?.balance ?? 0),
      currency: wallet?.currency ?? "UGX",
      transactions: tx ?? [],
    };
  });

const WithdrawSchema = z.object({
  amount: z.number().positive(),
  destination: z.enum(["mtn_momo", "airtel_money", "bank_transfer"]),
  reference: z.string().min(3).max(120),
});

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => WithdrawSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    const balance = Number(wallet?.balance ?? 0);
    if (balance < data.amount) {
      throw new Error(`Insufficient balance. You have ${balance.toFixed(0)} UGX`);
    }

    // Debit the wallet
    const { error: updErr } = await supabase
      .from("wallets")
      .update({ balance: balance - data.amount, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (updErr) throw new Error(updErr.message);

    const { error: txErr } = await supabase.from("wallet_transactions").insert({
      user_id: userId,
      amount: -Math.abs(data.amount),
      kind: "withdrawal_pending",
      description: `Withdrawal to ${data.destination.replace("_", " ")}`,
      reference: data.reference,
      status: "pending",
    });
    if (txErr) throw new Error(txErr.message);

    return { ok: true, new_balance: balance - data.amount };
  });
