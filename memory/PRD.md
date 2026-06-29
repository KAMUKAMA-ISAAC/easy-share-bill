# Splitit — Product Requirements & Progress

## Project
- **Repo**: KAMUKAMA-ISAAC/easy-share-bill (imported via Save-to-GitHub flow)
- **Live**: https://easy-split-2ltopzzs9-isaacme.vercel.app/
- **Stack**: TanStack Start (React 19 + Vite) · Supabase (auth + Postgres + storage) · Groq AI (Llama 4 Scout vision) · Deployed on Vercel
- **Market**: Uganda — MTN MoMo, Airtel Money, bank/card

## Core Personas
- **Organiser** (signed-in): scans receipts, creates groups, saves expenses, shares codes
- **Guest** (no login): receives a 6-char code or QR, opens receipt, pays their share

## Static Requirements
- Private receipts gated by 6-char share codes that expire after 5 minutes
- AI receipt parsing (Groq Llama 4 Scout vision)
- Splits: equal / percentage / custom / itemized
- Mobile-first UI with glass-morphism + dark mode

---

## Iteration log

### 2026-06-29 — Bug-fix + Share-Page-After-Save iteration
**Fixed**
- **Root-cause of group create + expense save failures**: `requireSupabaseAuth` middleware was passing the bare anon Supabase client to server functions, so `auth.uid()` was `NULL` and RLS blocked every authenticated write. Fix: middleware now builds a per-request Supabase client carrying the validated user's JWT in `Authorization`, so RLS policies see the real user. (`src/integrations/supabase/auth-middleware.ts`)
- **Groq receipt scan failure**: same root cause — `supabase.storage.createSignedUrl()` failed because storage RLS uses `auth.uid()`. Fixed by the middleware change. Cleaned up noisy debug bucket-listing in `src/lib/receipts.functions.ts`.

**Built**
- **New dedicated share page** at `/_app/expenses/$id/share` (`src/routes/_app.expenses.$id.share.tsx`):
  - Auto-generates the 6-char code + QR on load (once per expense)
  - Live countdown to 5-min expiry, regenerate button when expired
  - Copy code, copy link, download QR, native share, WhatsApp/SMS/Email shortcuts
- **Save → share navigation**: `_app.expenses.new.tsx` now navigates to `/expenses/$id/share` after a successful save instead of the detail page.
- **QR → landing prefill flow**:
  - QR now encodes `${origin}/?code=ABC123` (landing URL) instead of `/share/$token`
  - Landing route (`/`) accepts `?code=` search param (validated)
  - `CodeLookup` component pre-fills the code input and auto-focuses; user just presses Enter (or taps Open) to load the receipt
- Updated the existing expense-detail share section to use the same `?code=…` QR URL for consistency.

**Data-testid coverage added** for the new share page and code-lookup input/submit.

---

## What's been implemented (cumulative)
- Auth (Supabase email/password + Google OAuth via Supabase)
- Group create / member invites
- Expense create with AI receipt scan, item assignment, multiple split modes
- 6-char share codes + QR + share via WhatsApp/SMS/Email
- Guest payment flow (claim items, MoMo / Airtel / Bank mock checkout)
- Wallet (collect-then-withdraw) flow
- Archive / restore expenses
- Theme persistence

## Backlog / Next Action Items
- **P0** — End-to-end verification on the user's Supabase project (sign up, create group, save expense, scan QR on phone, settle as guest)
- **P0** — Re-deploy to Vercel and confirm env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY` aka `LOVABLE_API_KEY`) all present
- **P1** — Add `validator()` migration (TanStack Start deprecated `inputValidator()` — non-blocking warning today)
- **P1** — Better error states on the share page (network errors, RLS edge cases)
- **P2** — Group-level share codes (currently only expense-level)
- **P2** — Code-not-found error inline on landing (currently shown but could be friendlier)
- **P2** — User-listed bugs & features still to come (per user, "I WILL ADD OTHERS LATER")
