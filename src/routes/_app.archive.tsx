import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { restoreExpense } from "@/lib/expenses.functions";
import { formatDate, formatMoney } from "@/lib/format";
import { Archive, ArchiveRestore, Receipt } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/archive")({
  head: () => ({ meta: [{ title: "Archive — Splitit" }] }),
  component: ArchivePage,
});

function ArchivePage() {
  const qc = useQueryClient();
  const restoreFn = useServerFn(restoreExpense);

  const q = useQuery({
    queryKey: ["archived-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, description, amount, currency, expense_date, archived_at, groups(name,color)")
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const restore = useMutation({
    mutationFn: (expense_id: string) => restoreFn({ data: { expense_id } }),
    onSuccess: () => {
      toast.success("Restored");
      qc.invalidateQueries({ queryKey: ["archived-expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard-expenses"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const expenses = q.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Archive className="size-5 text-muted-foreground" />
        <h1 className="font-display text-3xl font-semibold tracking-tight">Archive</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Archived expenses are hidden from your dashboard but never deleted. Restore any time.
      </p>

      <div className="glass-card rounded-2xl divide-y divide-border overflow-hidden">
        {expenses.length === 0 && (
          <div className="p-10 text-center">
            <Receipt className="size-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">Nothing archived yet</p>
          </div>
        )}
        {expenses.map((e: any) => (
          <div key={e.id} className="flex items-center gap-3 p-4">
            <div className="size-10 rounded-xl bg-muted text-muted-foreground grid place-items-center">
              <Receipt className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <Link
                to="/expenses/$id"
                params={{ id: e.id }}
                className="text-sm font-medium truncate hover:underline block"
              >
                {e.description}
              </Link>
              <div className="text-xs text-muted-foreground">
                {e.groups?.name ?? "Personal"} · {formatDate(e.expense_date)}
              </div>
            </div>
            <div className="font-numeric text-sm">
              {formatMoney(Number(e.amount), e.currency)}
            </div>
            <button
              onClick={() => restore.mutate(e.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              <ArchiveRestore className="size-3.5" /> Restore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
