ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS is_balanced boolean,
  ADD COLUMN IF NOT EXISTS warning_message text;