DROP POLICY IF EXISTS groups_select_member ON public.groups;
CREATE POLICY groups_select_member ON public.groups
  FOR SELECT
  USING (created_by = auth.uid() OR public.is_group_member(id, auth.uid()));