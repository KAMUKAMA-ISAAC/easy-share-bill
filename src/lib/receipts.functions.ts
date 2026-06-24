import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * AI Receipt Parsing — MOCK implementation.
 *
 * Returns a plausible parsed receipt structure. In production this would
 * call Lovable AI Gateway with the uploaded image (vision model). The
 * frontend lets the user correct any field before saving.
 */

const ParseSchema = z.object({
  storage_path: z.string().min(1),
});

const MOCK_RECEIPTS = [
  {
    merchant: "Blue Bottle Coffee",
    items: [
      { name: "Cappuccino", price: 5.5, quantity: 2 },
      { name: "Almond Croissant", price: 4.75, quantity: 1 },
      { name: "Avocado Toast", price: 12.0, quantity: 1 },
    ],
    subtotal: 27.75,
    tax: 2.42,
    total: 30.17,
  },
  {
    merchant: "Whole Foods Market",
    items: [
      { name: "Organic Bananas", price: 3.49, quantity: 1 },
      { name: "Greek Yogurt", price: 6.99, quantity: 2 },
      { name: "Sourdough Bread", price: 5.5, quantity: 1 },
      { name: "Sparkling Water 12pk", price: 8.99, quantity: 1 },
    ],
    subtotal: 31.96,
    tax: 2.4,
    total: 34.36,
  },
  {
    merchant: "Sushi Time",
    items: [
      { name: "Dragon Roll", price: 18.0, quantity: 1 },
      { name: "Spicy Tuna Roll", price: 14.0, quantity: 1 },
      { name: "Miso Soup", price: 4.0, quantity: 2 },
      { name: "Edamame", price: 6.5, quantity: 1 },
    ],
    subtotal: 46.5,
    tax: 4.18,
    total: 50.68,
  },
];

export const parseReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ParseSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Simulate AI processing latency
    await new Promise((r) => setTimeout(r, 1200));

    // Pseudo-random pick based on path hash so same file -> same result
    let h = 0;
    for (const ch of data.storage_path) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const parsed = MOCK_RECEIPTS[Math.abs(h) % MOCK_RECEIPTS.length];

    const { data: receipt, error } = await supabase
      .from("receipts")
      .insert({
        user_id: userId,
        storage_path: data.storage_path,
        merchant: parsed.merchant,
        subtotal: parsed.subtotal,
        tax: parsed.tax,
        total: parsed.total,
        parsed_data: parsed as any,
      })
      .select("id")
      .single();

    if (error || !receipt) throw new Error(error?.message ?? "Failed to save receipt");

    return { receipt_id: receipt.id, ...parsed };
  });
