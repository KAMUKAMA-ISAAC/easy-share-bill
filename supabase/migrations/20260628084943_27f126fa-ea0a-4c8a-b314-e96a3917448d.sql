
-- 1) Share codes on shared_links
ALTER TABLE public.shared_links ADD COLUMN IF NOT EXISTS share_code text UNIQUE;
CREATE INDEX IF NOT EXISTS shared_links_share_code_idx ON public.shared_links(share_code);

-- 2) Expense archive
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS expenses_archived_idx ON public.expenses(archived_at);

-- 3) Payout destination (per-expense; owner decides where collected money goes)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payout_destination text NOT NULL DEFAULT 'direct'
  CHECK (payout_destination IN ('direct','wallet'));

-- 4) Wallet system
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UGX',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallets_own ON public.wallets;
CREATE POLICY wallets_own ON public.wallets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('credit','debit','withdrawal','withdrawal_pending')),
  description text,
  reference text,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','pending','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_tx_select_own ON public.wallet_transactions;
CREATE POLICY wallet_tx_select_own ON public.wallet_transactions FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS wallet_tx_insert_own ON public.wallet_transactions;
CREATE POLICY wallet_tx_insert_own ON public.wallet_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS wallet_tx_user_idx ON public.wallet_transactions(user_id, created_at DESC);
