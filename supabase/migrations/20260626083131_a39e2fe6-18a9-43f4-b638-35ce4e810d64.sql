
-- 1) Move is_group_member into a non-exposed schema
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = _group_id AND created_by = _user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION private.is_group_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_group_member(uuid, uuid) TO authenticated, service_role;

-- Recreate every policy that references public.is_group_member to use private.is_group_member
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = paid_by_user_id
    AND (group_id IS NULL OR private.is_group_member(group_id, auth.uid()))
  );

DROP POLICY IF EXISTS expenses_select_member ON public.expenses;
CREATE POLICY expenses_select_member ON public.expenses
  FOR SELECT TO authenticated
  USING (
    (group_id IS NULL AND paid_by_user_id = auth.uid())
    OR (group_id IS NOT NULL AND private.is_group_member(group_id, auth.uid()))
  );

DROP POLICY IF EXISTS items_select ON public.expense_items;
CREATE POLICY items_select ON public.expense_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_items.expense_id
        AND (
          e.paid_by_user_id = auth.uid()
          OR (e.group_id IS NOT NULL AND private.is_group_member(e.group_id, auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS members_insert_group ON public.group_members;
CREATE POLICY members_insert_group ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_group_member(group_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_members.group_id AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS members_select_group ON public.group_members;
CREATE POLICY members_select_group ON public.group_members
  FOR SELECT TO authenticated
  USING (private.is_group_member(group_id, auth.uid()));

-- 2) Fix overpermissive UPDATE on group_members
DROP POLICY IF EXISTS members_update_group ON public.group_members;
CREATE POLICY members_update_own_or_admin ON public.group_members
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_members.group_id AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_members.group_id AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS groups_select_member ON public.groups;
CREATE POLICY groups_select_member ON public.groups
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR private.is_group_member(id, auth.uid()));

DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.splits s
      JOIN public.expenses e ON e.id = s.expense_id
      WHERE s.id = payments.split_id
        AND (
          e.paid_by_user_id = auth.uid()
          OR (e.group_id IS NOT NULL AND private.is_group_member(e.group_id, auth.uid()))
        )
    )
  );

-- 3) Tighten payments_insert: caller must be related to the expense
DROP POLICY IF EXISTS payments_insert ON public.payments;
CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = marked_by_user_id
    AND EXISTS (
      SELECT 1 FROM public.splits s
      JOIN public.expenses e ON e.id = s.expense_id
      WHERE s.id = payments.split_id
        AND (
          e.paid_by_user_id = auth.uid()
          OR (e.group_id IS NOT NULL AND private.is_group_member(e.group_id, auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS splits_select ON public.splits;
CREATE POLICY splits_select ON public.splits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = splits.expense_id
        AND (
          e.paid_by_user_id = auth.uid()
          OR (e.group_id IS NOT NULL AND private.is_group_member(e.group_id, auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS members_view_item_claims ON public.item_claims;
CREATE POLICY members_view_item_claims ON public.item_claims
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = item_claims.expense_id
        AND e.group_id IS NOT NULL
        AND private.is_group_member(e.group_id, auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = item_claims.expense_id
        AND e.paid_by_user_id = auth.uid()
    )
  );

-- 4) item_claims write policies (owner-scoped). Guest writes still go via service role.
CREATE POLICY item_claims_owner_insert ON public.item_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = item_claims.expense_id AND e.paid_by_user_id = auth.uid()
    )
  );

CREATE POLICY item_claims_owner_update ON public.item_claims
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = item_claims.expense_id AND e.paid_by_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = item_claims.expense_id AND e.paid_by_user_id = auth.uid()
    )
  );

CREATE POLICY item_claims_owner_delete ON public.item_claims
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = item_claims.expense_id AND e.paid_by_user_id = auth.uid()
    )
  );

-- Drop the public-schema copy now that nothing references it
DROP FUNCTION IF EXISTS public.is_group_member(uuid, uuid);

-- 5) profiles: restrict reads to own profile only (was USING true)
DROP POLICY IF EXISTS profiles_select_all_auth ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 6) storage: add missing UPDATE policy on receipts bucket
DROP POLICY IF EXISTS receipts_update_own ON storage.objects;
CREATE POLICY receipts_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
