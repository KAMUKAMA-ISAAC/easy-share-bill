import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from '@supabase/supabase-js';

/**
 * Public guest access via secure tokens.
 * Uses RPC functions (SECURITY DEFINER) instead of service role.
 * No login required for guests.
 */

const TokenSchema = z.object({ token: z.string().min(8).max(200) });

/** Get Supabase client for server use (uses process.env) */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  if (!url || !key) {
    console.error('[Share] ❌ Missing Supabase environment variables');
    console.error('[Share] SUPABASE_URL:', !!url);
    console.error('[Share] SUPABASE_PUBLISHABLE_KEY:', !!key);
    throw new Error('Supabase configuration missing');
  }
  
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/** Resolve a 6-character share code to the canonical share token. */
const CodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, "Code must be 6 characters"),
});

export const resolveShareCode = createServerFn({ method: "POST" })
  .validator((input: unknown) => CodeSchema.parse(input))
  .handler(async ({ data }) => {
    const supabase = getSupabaseClient();
    
    const { data: link, error } = await supabase
      .rpc('resolve_share_code', { p_code: data.code });
    
    if (error) {
      console.error('[Share] ❌ RPC error:', error);
      throw new Error(error.message);
    }
    if (!link) throw new Error("No receipt matches that code");
    return { token: link as string };
  });

export const getSharedExpense = createServerFn({ method: "GET" })
  .validator((input: unknown) => TokenSchema.parse(input))
  .handler(async ({ data }) => {
    const supabase = getSupabaseClient();
    
    const { data: result, error } = await supabase
      .rpc('get_shared_expense_by_token', { p_token: data.token });
    
    if (error) {
      console.error('[Share] ❌ RPC error:', error);
      throw new Error('Link not found or expired');
    }
    
    if (!result) {
      throw new Error('Link not found or expired');
    }
    
    return result;
  });

const MarkPaidSchema = z.object({
  token: z.string().min(8),
  split_id: z.string().uuid(),
  guest_name: z.string().min(1).max(80).optional(),
});

export const guestMarkSplitPaid = createServerFn({ method: "POST" })
  .validator((input: unknown) => MarkPaidSchema.parse(input))
  .handler(async ({ data }) => {
    const supabase = getSupabaseClient();
    
    const { data: result, error } = await supabase
      .rpc('mark_split_paid_guest', {
        p_token: data.token,
        p_split_id: data.split_id,
        p_guest_name: data.guest_name || null
      });
    
    if (error) {
      console.error('[Share] ❌ RPC error:', error);
      throw new Error(error.message);
    }
    
    return result;
  });

const ClaimSchema = z.object({
  token: z.string().min(8),
  item_ids: z.array(z.string().uuid()).min(1),
  guest_name: z.string().min(1).max(80),
});

export const guestClaimItems = createServerFn({ method: "POST" })
  .validator((input: unknown) => ClaimSchema.parse(input))
  .handler(async ({ data }) => {
    const supabase = getSupabaseClient();
    
    const { data: result, error } = await supabase
      .rpc('claim_items_guest', {
        p_token: data.token,
        p_item_ids: data.item_ids,
        p_guest_name: data.guest_name
      });
    
    if (error) {
      console.error('[Share] ❌ RPC error:', error);
      throw new Error(error.message);
    }
    
    return result;
  });

const PayClaimsSchema = z.object({
  token: z.string().min(8),
  claim_ids: z.array(z.string().uuid()).min(1),
  method: z.enum(["mtn_momo", "airtel_money", "bank_transfer"]),
  reference: z.string().max(120).optional(),
});

export const guestPayClaims = createServerFn({ method: "POST" })
  .validator((input: unknown) => PayClaimsSchema.parse(input))
  .handler(async ({ data }) => {
    const supabase = getSupabaseClient();
    
    const { data: result, error } = await supabase
      .rpc('pay_claims_guest', {
        p_token: data.token,
        p_claim_ids: data.claim_ids,
        p_method: data.method,
        p_reference: data.reference || null
      });
    
    if (error) {
      console.error('[Share] ❌ RPC error:', error);
      throw new Error(error.message);
    }
    
    return result;
  });
