ALTER TABLE public.expenses ALTER COLUMN currency SET DEFAULT 'UGX';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS momo_provider text,
  ADD COLUMN IF NOT EXISTS momo_number text,
  ADD COLUMN IF NOT EXISTS momo_name text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_account_name text;

CREATE TABLE IF NOT EXISTS public.item_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.expense_items(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  member_id uuid REFERENCES public.group_members(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 1,
  amount numeric NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  payment_method text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_claims TO authenticated;
GRANT SELECT ON public.item_claims TO anon;
GRANT ALL ON public.item_claims TO service_role;

ALTER TABLE public.item_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_view_item_claims" ON public.item_claims
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.id = item_claims.expense_id
      AND public.is_group_member(e.group_id, auth.uid())
  ));

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS claim_mode text NOT NULL DEFAULT 'free'
    CHECK (claim_mode IN ('free','first_come','preassigned'));

ALTER TABLE public.expense_items
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;