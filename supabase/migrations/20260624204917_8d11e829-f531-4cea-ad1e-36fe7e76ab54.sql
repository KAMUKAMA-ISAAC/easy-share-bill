
-- Profiles auto-created on signup
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Groups
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text DEFAULT 'general',
  color text DEFAULT '#7C5CFF',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Group members
CREATE TABLE public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX idx_group_members_group ON public.group_members(group_id);
CREATE INDEX idx_group_members_user ON public.group_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Membership helper (security definer avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.groups WHERE id = _group_id AND created_by = _user_id
  );
$$;

CREATE POLICY "groups_select_member" ON public.groups FOR SELECT TO authenticated
  USING (public.is_group_member(id, auth.uid()));
CREATE POLICY "groups_insert_self" ON public.groups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "groups_update_creator" ON public.groups FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);
CREATE POLICY "groups_delete_creator" ON public.groups FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "members_select_group" ON public.group_members FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members_insert_group" ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id, auth.uid()) OR EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND created_by = auth.uid()));
CREATE POLICY "members_update_group" ON public.group_members FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "members_delete_group" ON public.group_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND created_by = auth.uid()));

-- Auto-add creator as member when a group is created
CREATE OR REPLACE FUNCTION public.add_creator_as_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE creator_name text;
BEGIN
  SELECT COALESCE(display_name, email) INTO creator_name FROM public.profiles WHERE id = NEW.created_by;
  INSERT INTO public.group_members (group_id, user_id, display_name, email)
  VALUES (NEW.id, NEW.created_by, COALESCE(creator_name, 'You'), (SELECT email FROM public.profiles WHERE id = NEW.created_by));
  RETURN NEW;
END;
$$;
CREATE TRIGGER groups_add_creator AFTER INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_member();

-- Receipts
CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  merchant text,
  subtotal numeric(12,2),
  tax numeric(12,2),
  total numeric(12,2),
  parsed_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipts_own" ON public.receipts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Expenses
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  paid_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paid_by_member_id uuid REFERENCES public.group_members(id) ON DELETE SET NULL,
  description text NOT NULL,
  category text DEFAULT 'general',
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  expense_date date NOT NULL DEFAULT current_date,
  split_mode text NOT NULL DEFAULT 'equal' CHECK (split_mode IN ('equal','percentage','custom','itemized')),
  receipt_id uuid REFERENCES public.receipts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_group ON public.expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON public.expenses(paid_by_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_select_member" ON public.expenses FOR SELECT TO authenticated
  USING (group_id IS NULL AND paid_by_user_id = auth.uid()
         OR group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()));
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = paid_by_user_id AND
              (group_id IS NULL OR public.is_group_member(group_id, auth.uid())));
CREATE POLICY "expenses_update_owner" ON public.expenses FOR UPDATE TO authenticated
  USING (auth.uid() = paid_by_user_id);
CREATE POLICY "expenses_delete_owner" ON public.expenses FOR DELETE TO authenticated
  USING (auth.uid() = paid_by_user_id);

-- Expense items
CREATE TABLE public.expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(12,2) NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  assigned_member_ids uuid[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX idx_items_expense ON public.expense_items(expense_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_items TO authenticated;
GRANT ALL ON public.expense_items TO service_role;
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_select" ON public.expense_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id
    AND (e.paid_by_user_id = auth.uid() OR (e.group_id IS NOT NULL AND public.is_group_member(e.group_id, auth.uid())))));
CREATE POLICY "items_modify" ON public.expense_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.paid_by_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.paid_by_user_id = auth.uid()));

-- Splits
CREATE TABLE public.splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  percentage numeric(6,3),
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz
);
CREATE INDEX idx_splits_expense ON public.splits(expense_id);
CREATE INDEX idx_splits_member ON public.splits(member_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.splits TO authenticated;
GRANT ALL ON public.splits TO service_role;
ALTER TABLE public.splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "splits_select" ON public.splits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id
    AND (e.paid_by_user_id = auth.uid() OR (e.group_id IS NOT NULL AND public.is_group_member(e.group_id, auth.uid())))));
CREATE POLICY "splits_modify" ON public.splits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.paid_by_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.paid_by_user_id = auth.uid()));

-- Shared links (guest access tokens)
CREATE TABLE public.shared_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  resource_type text NOT NULL CHECK (resource_type IN ('expense','group')),
  resource_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shared_links_token ON public.shared_links(token);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_links TO authenticated;
GRANT ALL ON public.shared_links TO service_role;
ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "links_own" ON public.shared_links FOR ALL TO authenticated
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- Payments ledger
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id uuid NOT NULL REFERENCES public.splits(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  method text NOT NULL DEFAULT 'manual',
  marked_by_token text,
  marked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.splits s JOIN public.expenses e ON e.id = s.expense_id
    WHERE s.id = split_id AND (e.paid_by_user_id = auth.uid()
      OR (e.group_id IS NOT NULL AND public.is_group_member(e.group_id, auth.uid())))));
CREATE POLICY "payments_insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = marked_by_user_id);

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, read);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER expenses_updated BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
