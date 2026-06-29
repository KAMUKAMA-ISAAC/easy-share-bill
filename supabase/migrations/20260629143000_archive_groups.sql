-- Soft-delete support for groups (parallel to expenses.archived_at).
-- After this migration:
--   * "Deleting" a group sets archived_at = now(); the row stays so it can
--     be restored or permanently deleted from the Archive page.
--   * The default groups list filters by `archived_at IS NULL`.
--   * RLS keeps the same visibility rules — only the creator/members can
--     see archived rows, but the application reads them only on the
--     Archive screen.

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS groups_archived_idx ON public.groups(archived_at);
