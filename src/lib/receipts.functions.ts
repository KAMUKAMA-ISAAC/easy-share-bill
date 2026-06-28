import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    // Get API key
    const apiKey = process.env.GROQ_API_KEY || process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      console.error('[Scanner] ❌ No API key found');
      throw new Error("AI gateway not configured - missing API key");
    }

    const isGroq = apiKey.startsWith('gsk_');
    console.log(`[Scanner] Using API: ${isGroq ? 'Groq' : 'Lovable'}`);

    // Signed URL for the receipt image
    const { data: signed, error: signErr } = await supabase.storage
      .from("receipts")
      .createSignedUrl(data.storage_path, 60 * 10);
      
    if (signErr || !signed?.signedUrl) {
      console.error('[Scanner] ❌ Signed URL error:', signErr);
      throw new Error(signErr?.message ?? "Could not load receipt image");
    }
    console.log('[Scanner] ✅ Signed URL created');

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

    let aiRes: Response;

    if (isGroq) {
      console.log('[Scanner] 🔄 Using Groq API with llama-3.2-90b-vision-preview...');
      
      const imageResponse = await fetch(signed.signedUrl);
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString('base64');
      const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
      
      const groqBody = {
        model: "llama-3.2-90b-vision-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract this receipt." },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      };

      console.log('[Scanner] 📤 Sending to Groq API...');
      
      aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(groqBody),
      });

    } else {
      console.log('[Scanner] 🔄 Using Lovable AI Gateway...');
      
      const lovableBody = {
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
      };

      console.log('[Scanner] 📤 Sending to Lovable AI Gateway...');
      
      aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(lovableBody),
      });
    }

    if (!aiRes.ok) {
      const body = await aiRes.text();
      console.error(`[Scanner] ❌ API error (${aiRes.status}):`, body);
      
      if (aiRes.status === 429) {
        throw new Error("AI is busy — please try again in a moment");
      }
      if (aiRes.status === 401) {
        throw new Error("Invalid API key — please check your configuration");
      }
      if (aiRes.status === 402) {
        throw new Error("AI credits exhausted — check your account");
      }
      
      throw new Error(`AI gateway error (${aiRes.status}): ${body.slice(0, 200)}`);
    }

    console.log('[Scanner] ✅ API response received');

    const json = (await aiRes.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    console.log('[Scanner] Raw response:', raw.slice(0, 200) + '...');

    let parsed: z.infer<typeof ParsedJsonSchema>;
    try {
      const cleaned = raw.trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim();
      parsed = ParsedJsonSchema.parse(JSON.parse(cleaned));
      console.log('[Scanner] ✅ Parsed successfully:', parsed);
    } catch (e) {
      console.error('[Scanner] ❌ JSON parsing error:', e);
      throw new Error("Could not understand the receipt — try a clearer photo");
    }

    // Reconcile total if missing
    if (!parsed.total || parsed.total === 0) {
      const sum = parsed.items.reduce((a, it) => a + it.price * (it.quantity ?? 1), 0);
      parsed.total = Math.round((sum + (parsed.tax ?? 0)) * 100) / 100;
      console.log('[Scanner] Calculated total:', parsed.total);
    }

    // ==========================================
    // ✅ FIX: Allow saving even if totals don't match
    // ==========================================
    const itemTotal = parsed.items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0);
    const difference = Math.abs(itemTotal - parsed.total);

    if (difference > 0.01) {
      console.warn(`⚠️ Items total (${itemTotal}) differs from receipt total (${parsed.total}) by ${difference}`);
      // ✅ Allow saving — just log the warning
    }

    console.log('[Scanner] 💾 Saving receipt to database...');
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
        // ✅ Add a flag to track if receipt is balanced
        is_balanced: difference <= 0.01,
        warning_message: difference > 0.01 ? `Items total (${itemTotal}) differs from receipt total (${parsed.total})` : null,
      })
      .select("id")
      .single();

    if (error || !receipt) {
      console.error('[Scanner] ❌ Database error:', error);
      throw new Error(error?.message ?? "Failed to save receipt");
    }

    console.log(`[Scanner] ✅ Receipt saved with ID: ${receipt.id}`);
    return { 
      receipt_id: receipt.id, 
      ...parsed,
      is_balanced: difference <= 0.01,
      warning: difference > 0.01 ? `Items total (${itemTotal}) differs from receipt total (${parsed.total}) by ${difference.toFixed(2)}` : null
    };
  });
