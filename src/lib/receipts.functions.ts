import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * AI receipt parsing via Lovable AI Gateway (Gemini vision).
 * The user-scoped Supabase client creates a short-lived signed URL for the
 * uploaded receipt; the vision model reads the image directly from that URL
 * and returns a strict JSON structure we persist on `receipts`.
 */

const ParseSchema = z.object({ storage_path: z.string().min(1) });

const ParsedJsonSchema = z.object({
  merchant: z.string().default("Receipt"),
  currency: z.string().default("UGX"),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        price: z.number().nonnegative(),
        quantity: z.number().positive().default(1),
      }),
    )
    .default([]),
  subtotal: z.number().nonnegative().optional().nullable(),
  tax: z.number().nonnegative().optional().nullable(),
  total: z.number().nonnegative().default(0),
});

export const parseReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ParseSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const apiKey = process.env.GROQ_API_KEY || process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    // Signed URL the vision model can fetch directly
    const { data: signed, error: signErr } = await supabase.storage
      .from("receipts")
      .createSignedUrl(data.storage_path, 60 * 10);
    if (signErr || !signed?.signedUrl) {
      throw new Error(signErr?.message ?? "Could not load receipt image");
    }

    const systemPrompt =
      "You are a receipt OCR engine. Read the receipt photo and return ONLY a JSON object matching this schema (no prose, no markdown):\n" +
      "{\n" +
      '  "merchant": string,\n' +
      '  "currency": ISO-4217 string (use "UGX" if unclear),\n' +
      '  "items": [ { "name": string, "price": number, "quantity": number } ],\n' +
      '  "subtotal": number,\n' +
      '  "tax": number,\n' +
      '  "total": number\n' +
      "}\n" +
      "Rules:\n" +
      "- Extract EVERY line item exactly as printed, including modifiers.\n" +
      '- "price" is the UNIT price (per single item), not the line total.\n' +
      "- If quantity isn't printed, use 1.\n" +
      "- Numbers must be plain numbers, no currency symbols or thousands separators.\n" +
      "- If a value is missing on the receipt, use 0.";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract this receipt." },
              { type: "image_url", image_url: { url: signed.signedUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const body = await aiRes.text();
      if (aiRes.status === 429) throw new Error("AI is busy — please try again in a moment");
      if (aiRes.status === 402) throw new Error("AI credits exhausted — add credits in workspace billing");
      throw new Error(`AI gateway error (${aiRes.status}): ${body.slice(0, 200)}`);
    }

    const json = (await aiRes.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    let parsed: z.infer<typeof ParsedJsonSchema>;
    try {
      // Strip any fenced wrapping just in case
      const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      parsed = ParsedJsonSchema.parse(JSON.parse(cleaned));
    } catch (e) {
      throw new Error("Could not understand the receipt — try a clearer photo");
    }

    // Reconcile total if missing
    if (!parsed.total || parsed.total === 0) {
      const sum = parsed.items.reduce((a, it) => a + it.price * (it.quantity ?? 1), 0);
      parsed.total = Math.round((sum + (parsed.tax ?? 0)) * 100) / 100;
    }

    const { data: receipt, error } = await supabase
      .from("receipts")
      .insert({
        user_id: userId,
        storage_path: data.storage_path,
        merchant: parsed.merchant,
        subtotal: parsed.subtotal ?? null,
        tax: parsed.tax ?? null,
        total: parsed.total,
        parsed_data: parsed as any,
      })
      .select("id")
      .single();

    if (error || !receipt) throw new Error(error?.message ?? "Failed to save receipt");

    return { receipt_id: receipt.id, ...parsed };
  });
