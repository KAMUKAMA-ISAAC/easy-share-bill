-- =============================================================================
-- Splitit · Secure Payments + Share-Code RPC (no service role required)
-- Run this in Supabase SQL Editor.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1) DROP the old plaintext single-set payment fields on profiles (user chose wipe)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS momo_provider,
  DROP COLUMN IF EXISTS momo_number,
  DROP COLUMN IF EXISTS momo_name,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_account_name;

-- Vault password "check" — encrypted known plaintext used to verify the vault password
-- on unlock. We DO NOT store the password itself anywhere.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vault_check       text,
  ADD COLUMN IF NOT EXISTS vault_check_iv    text,
  ADD COLUMN IF NOT EXISTS vault_check_salt  text;

-- ----------------------------------------------------------------------------
-- 2) payment_methods table — multiple encrypted methods per user
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('mtn_momo','airtel_money','bank')),
  label             text NOT NULL,                -- "My main MTN", "Stanbic salary"
  display_hint      text NOT NULL,                -- e.g. "•••• 7890" — safe to expose to payers
  account_name      text,                         -- "Isaac Kamukama" — shown for trust
  bank_name         text,                         -- nullable for momo
  encrypted_payload text NOT NULL,                -- AES-GCM ciphertext of full number/account (base64)
  iv                text NOT NULL,                -- AES-GCM IV (base64)
  salt              text NOT NULL,                -- PBKDF2 salt (base64)
  is_default        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_methods_user_idx ON public.payment_methods(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_own ON public.payment_methods;
CREATE POLICY pm_own ON public.payment_methods FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER payment_methods_updated BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) expenses: which payment methods are exposed for this receipt
-- ----------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payout_method_ids uuid[] NOT NULL DEFAULT '{}';

-- ----------------------------------------------------------------------------
-- 4) Helpful: ensure shared_links.share_code is uppercase 6-char
-- ----------------------------------------------------------------------------
-- (column already exists; just add a length check if missing)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'shared_links_share_code_len'
  ) THEN
    ALTER TABLE public.shared_links
      ADD CONSTRAINT shared_links_share_code_len
      CHECK (share_code IS NULL OR length(share_code) BETWEEN 4 AND 12);
  END IF;
END $$;

-- ============================================================================
-- 5) RPC: share_get_by_code  (callable by anon — no service role needed!)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.share_get_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link    record;
  v_result  jsonb;
  v_methods jsonb;
  v_eid     uuid;
  v_uid     uuid;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) < 4 THEN
    RAISE EXCEPTION 'Invalid code';
  END IF;

  SELECT resource_type, resource_id, token, expires_at, created_by
    INTO v_link
    FROM public.shared_links
   WHERE share_code = upper(trim(p_code))
   LIMIT 1;

  IF v_link IS NULL THEN
    RAISE EXCEPTION 'No receipt matches that code';
  END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION 'That code has expired';
  END IF;

  IF v_link.resource_type = 'expense' THEN
    v_eid := v_link.resource_id;
    SELECT paid_by_user_id INTO v_uid FROM public.expenses WHERE id = v_eid;

    -- Pick the payment methods the OWNER selected for this expense; fallback to defaults.
    SELECT jsonb_agg(jsonb_build_object(
      'id',           pm.id,
      'kind',         pm.kind,
      'label',        pm.label,
      'display_hint', pm.display_hint,
      'account_name', pm.account_name,
      'bank_name',    pm.bank_name,
      'is_default',   pm.is_default
    ) ORDER BY pm.is_default DESC, pm.created_at ASC)
    INTO v_methods
    FROM public.payment_methods pm
    WHERE pm.user_id = v_uid
      AND (
        pm.id = ANY(COALESCE((SELECT payout_method_ids FROM public.expenses WHERE id = v_eid), '{}'::uuid[]))
        OR (
          COALESCE(array_length((SELECT payout_method_ids FROM public.expenses WHERE id = v_eid), 1), 0) = 0
          AND pm.is_default = true
        )
      );

    v_result := jsonb_build_object(
      'type',  'expense',
      'token', v_link.token,
      'expense', (
        SELECT to_jsonb(e) - 'updated_at' FROM public.expenses e WHERE e.id = v_eid
      ),
      'splits', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'member_id', s.member_id, 'amount', s.amount,
          'paid', s.paid, 'paid_at', s.paid_at
        )) FROM public.splits s WHERE s.expense_id = v_eid
      ), '[]'::jsonb),
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', i.id, 'name', i.name, 'price', i.price, 'quantity', i.quantity,
          'locked', i.locked, 'assigned_member_ids', i.assigned_member_ids,
          'sort_order', i.sort_order
        ) ORDER BY i.sort_order) FROM public.expense_items i WHERE i.expense_id = v_eid
      ), '[]'::jsonb),
      'members', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', gm.id, 'display_name', gm.display_name))
        FROM public.group_members gm
        WHERE gm.id IN (
          SELECT member_id FROM public.splits WHERE expense_id = v_eid
          UNION
          SELECT paid_by_member_id FROM public.expenses WHERE id = v_eid AND paid_by_member_id IS NOT NULL
        )
      ), '[]'::jsonb),
      'claims', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'item_id', c.item_id, 'guest_name', c.guest_name,
          'quantity', c.quantity, 'amount', c.amount, 'paid', c.paid,
          'paid_at', c.paid_at, 'payment_method', c.payment_method
        )) FROM public.item_claims c WHERE c.expense_id = v_eid
      ), '[]'::jsonb),
      'payment_methods', COALESCE(v_methods, '[]'::jsonb),
      'payer_name', (
        SELECT gm.display_name FROM public.group_members gm
        WHERE gm.id = (SELECT paid_by_member_id FROM public.expenses WHERE id = v_eid)
      )
    );

    RETURN v_result;
  END IF;

  -- group share
  v_result := jsonb_build_object(
    'type',  'group',
    'token', v_link.token,
    'group', (SELECT to_jsonb(g) FROM public.groups g WHERE g.id = v_link.resource_id),
    'expenses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'description', e.description, 'amount', e.amount,
        'currency', e.currency, 'expense_date', e.expense_date,
        'paid_by_member_id', e.paid_by_member_id
      ) ORDER BY e.expense_date DESC)
      FROM public.expenses e
      WHERE e.group_id = v_link.resource_id AND e.archived_at IS NULL
    ), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'display_name', display_name))
      FROM public.group_members WHERE group_id = v_link.resource_id
    ), '[]'::jsonb)
  );
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.share_get_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.share_get_by_code(text) TO anon, authenticated;

-- ============================================================================
-- 6) RPC: share_claim_items
-- ============================================================================
CREATE OR REPLACE FUNCTION public.share_claim_items(
  p_code       text,
  p_item_ids   uuid[],
  p_guest_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link    record;
  v_expense record;
  v_total   numeric := 0;
  v_inserted jsonb := '[]'::jsonb;
  v_row     record;
  v_existing int;
BEGIN
  IF p_guest_name IS NULL OR length(trim(p_guest_name)) = 0 THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Pick at least one item';
  END IF;

  SELECT resource_type, resource_id, expires_at
    INTO v_link
    FROM public.shared_links
   WHERE share_code = upper(trim(p_code))
   LIMIT 1;
  IF v_link IS NULL THEN RAISE EXCEPTION 'Invalid code'; END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION 'Code expired';
  END IF;
  IF v_link.resource_type <> 'expense' THEN
    RAISE EXCEPTION 'Claims only work on expense links';
  END IF;

  SELECT id, claim_mode INTO v_expense FROM public.expenses WHERE id = v_link.resource_id;
  IF v_expense IS NULL THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF v_expense.claim_mode = 'preassigned' THEN
    RAISE EXCEPTION 'This bill was pre-assigned by the organiser';
  END IF;

  -- Validate items belong to this expense
  PERFORM 1 FROM public.expense_items
    WHERE expense_id = v_expense.id AND id = ANY(p_item_ids)
    HAVING count(*) = array_length(p_item_ids, 1);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Some items are no longer available';
  END IF;

  -- For first_come, ensure none are already claimed
  IF v_expense.claim_mode = 'first_come' THEN
    SELECT count(*) INTO v_existing
      FROM public.item_claims
     WHERE item_id = ANY(p_item_ids);
    IF v_existing > 0 THEN
      RAISE EXCEPTION 'Someone already grabbed one of those items';
    END IF;
  END IF;

  FOR v_row IN
    SELECT id, price, quantity FROM public.expense_items
    WHERE expense_id = v_expense.id AND id = ANY(p_item_ids)
  LOOP
    INSERT INTO public.item_claims(item_id, expense_id, guest_name, quantity, amount)
    VALUES (v_row.id, v_expense.id, trim(p_guest_name), COALESCE(v_row.quantity, 1),
            v_row.price * COALESCE(v_row.quantity, 1))
    RETURNING jsonb_build_object('id', id, 'item_id', item_id, 'amount', amount) INTO v_inserted;
    -- accumulate
    v_total := v_total + (v_row.price * COALESCE(v_row.quantity, 1));
  END LOOP;

  -- Re-query the inserted to get clean array
  WITH ins AS (
    SELECT id, item_id, amount FROM public.item_claims
    WHERE expense_id = v_expense.id AND guest_name = trim(p_guest_name)
      AND item_id = ANY(p_item_ids) AND paid = false
    ORDER BY created_at DESC
    LIMIT array_length(p_item_ids, 1)
  )
  SELECT jsonb_agg(to_jsonb(ins.*)) INTO v_inserted FROM ins;

  IF v_expense.claim_mode = 'first_come' THEN
    UPDATE public.expense_items SET locked = true WHERE id = ANY(p_item_ids);
  END IF;

  RETURN jsonb_build_object(
    'claim_ids', (SELECT jsonb_agg(elem->>'id') FROM jsonb_array_elements(v_inserted) elem),
    'total', v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.share_claim_items(text, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.share_claim_items(text, uuid[], text) TO anon, authenticated;

-- ============================================================================
-- 7) RPC: share_pay_claims  (mock payment — marks claims paid, optional wallet credit)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.share_pay_claims(
  p_code      text,
  p_claim_ids uuid[],
  p_method    text,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link    record;
  v_total   numeric := 0;
  v_method_tag text;
  v_exp     record;
BEGIN
  IF p_method NOT IN ('mtn_momo','airtel_money','bank_transfer','card') THEN
    RAISE EXCEPTION 'Unsupported method %', p_method;
  END IF;
  IF p_claim_ids IS NULL OR array_length(p_claim_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No claims';
  END IF;

  SELECT resource_type, resource_id, expires_at
    INTO v_link
    FROM public.shared_links
   WHERE share_code = upper(trim(p_code))
   LIMIT 1;
  IF v_link IS NULL THEN RAISE EXCEPTION 'Invalid code'; END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION 'Code expired';
  END IF;
  IF v_link.resource_type <> 'expense' THEN
    RAISE EXCEPTION 'Pay only works on expense links';
  END IF;

  -- Validate claims belong to this expense
  PERFORM 1 FROM public.item_claims
    WHERE id = ANY(p_claim_ids) AND expense_id = v_link.resource_id
    HAVING count(*) = array_length(p_claim_ids, 1);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claims do not belong to this receipt';
  END IF;

  v_method_tag := CASE WHEN p_reference IS NULL OR length(p_reference) = 0
                       THEN p_method
                       ELSE p_method || ':' || p_reference END;

  SELECT COALESCE(sum(amount), 0) INTO v_total
    FROM public.item_claims
   WHERE id = ANY(p_claim_ids) AND paid = false;

  UPDATE public.item_claims
     SET paid = true,
         paid_at = now(),
         payment_method = v_method_tag
   WHERE id = ANY(p_claim_ids) AND paid = false;

  -- Optional wallet credit for owner if they chose wallet payout
  SELECT paid_by_user_id, payout_destination, description, id
    INTO v_exp FROM public.expenses WHERE id = v_link.resource_id;

  IF v_exp.payout_destination = 'wallet' AND v_exp.paid_by_user_id IS NOT NULL AND v_total > 0 THEN
    INSERT INTO public.wallets(user_id, balance, currency)
    VALUES (v_exp.paid_by_user_id, v_total, 'UGX')
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.wallets.balance + EXCLUDED.balance,
          updated_at = now();

    INSERT INTO public.wallet_transactions(user_id, amount, kind, description, reference, expense_id, status)
    VALUES (v_exp.paid_by_user_id, v_total, 'credit',
            'Payment for "' || v_exp.description || '"', v_method_tag, v_exp.id, 'completed');
  END IF;

  RETURN jsonb_build_object('ok', true, 'total', v_total, 'method', p_method);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.share_pay_claims(text, uuid[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.share_pay_claims(text, uuid[], text, text) TO anon, authenticated;

-- ============================================================================
-- 8) RPC: share_mark_split_paid  (legacy non-itemized split — guest marks own split paid)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.share_mark_split_paid(
  p_code     text,
  p_split_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link  record;
  v_split record;
BEGIN
  SELECT resource_type, resource_id, expires_at
    INTO v_link FROM public.shared_links
   WHERE share_code = upper(trim(p_code)) LIMIT 1;
  IF v_link IS NULL THEN RAISE EXCEPTION 'Invalid code'; END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RAISE EXCEPTION 'Code expired';
  END IF;

  SELECT id, expense_id, amount, paid INTO v_split FROM public.splits WHERE id = p_split_id;
  IF v_split IS NULL THEN RAISE EXCEPTION 'Split not found'; END IF;

  -- Ownership check
  IF v_link.resource_type = 'expense' AND v_split.expense_id <> v_link.resource_id THEN
    RAISE EXCEPTION 'Split does not belong to this link';
  END IF;
  IF v_link.resource_type = 'group' THEN
    PERFORM 1 FROM public.expenses
     WHERE id = v_split.expense_id AND group_id = v_link.resource_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Split does not belong to this group'; END IF;
  END IF;

  IF v_split.paid THEN
    RETURN jsonb_build_object('ok', true, 'alreadyPaid', true);
  END IF;

  UPDATE public.splits SET paid = true, paid_at = now() WHERE id = v_split.id;
  RETURN jsonb_build_object('ok', true, 'alreadyPaid', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.share_mark_split_paid(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.share_mark_split_paid(text, uuid) TO anon, authenticated;

-- ============================================================================
-- 9) Allow anon SELECT on item_claims so the share page can show "claimed by X"
--    (Already granted, but RLS blocks it. We add an anon-readable policy.)
-- ============================================================================
DROP POLICY IF EXISTS item_claims_anon_view ON public.item_claims;
-- We won't add anon SELECT directly — share_get_by_code returns the data already.
-- Keeping anon SELECT off for safety.
