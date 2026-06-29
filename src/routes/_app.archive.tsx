import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  restoreExpense,
  permanentlyDeleteExpense,
  restoreGroup,
  permanentlyDeleteGroup,
} from "@/lib/expenses.functions";
import { formatDate, formatMoney, initialsOf } from "@/lib/format";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Receipt,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/archive")({
  head: () => ({ meta: [{ title: "Archive — Splitit" }] }),
  component: ArchivePage,
});

type ArchiveTab = "expenses" | "groups";

function ArchivePage() {
  const [tab, setTab] = useState<ArchiveTab>("expenses");

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Archive className="size-5 text-muted-foreground" />
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Archive
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Deleted receipts and groups stay here. Restore any time, or remove
        them permanently when you're sure.
      </p>

      <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card/60 p-1 mb-6">
        <TabButton
          active={tab === "expenses"}
          onClick={() => setTab("expenses")}
          testid="archive-tab-expenses"
        >
          <Receipt className="size-4" /> Receipts
        </TabButton>
        <TabButton
          active={tab === "groups"}
          onClick={() => setTab("groups")}
          testid="archive-tab-groups"
        >
          <Users className="size-4" /> Groups
        </TabButton>
      </div>

      {tab === "expenses" ? <ExpensesArchive /> : <GroupsArchive />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ExpensesArchive() {
  const qc = useQueryClient();
  const restoreFn = useServerFn(restoreExpense);
  const purgeFn = useServerFn(permanentlyDeleteExpense);

  const q = useQuery({
    queryKey: ["archived-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "id, description, amount, currency, expense_date, archived_at, groups(name,color)",
        )
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const restore = useMutation({
    mutationFn: (expense_id: string) => restoreFn({ data: { expense_id } }),
    onSuccess: () => {
      toast.success("Receipt restored");
      qc.invalidateQueries({ queryKey: ["archived-expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard-expenses"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const purge = useMutation({
    mutationFn: (expense_id: string) => purgeFn({ data: { expense_id } }),
    onSuccess: () => {
      toast.success("Receipt deleted forever");
      qc.invalidateQueries({ queryKey: ["archived-expenses"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const items = q.data ?? [];

  if (q.isLoading) {
    return (
      <div className="text-center py-10">
        <Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="size-10 mx-auto text-muted-foreground mb-3" />}
        title="No deleted receipts"
        subtitle="Receipts you delete from the dashboard show up here."
      />
    );
  }

  return (
    <div
      className="glass-card rounded-2xl divide-y divide-border overflow-hidden"
      data-testid="archived-expenses-list"
    >
      {items.map((e: any) => (
        <div
          key={e.id}
          className="flex items-center gap-3 p-4 flex-wrap"
          data-testid={`archived-expense-${e.id}`}
        >
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => restore.mutate(e.id)}
              disabled={restore.isPending}
              data-testid={`restore-expense-${e.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
            >
              <ArchiveRestore className="size-3.5" /> Restore
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    `Delete "${e.description}" forever? This cannot be undone.`,
                  )
                ) {
                  purge.mutate(e.id);
                }
              }}
              disabled={purge.isPending}
              data-testid={`purge-expense-${e.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-xs hover:bg-destructive/20 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupsArchive() {
  const qc = useQueryClient();
  const restoreFn = useServerFn(restoreGroup);
  const purgeFn = useServerFn(permanentlyDeleteGroup);

  const q = useQuery({
    queryKey: ["archived-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select(
          "id, name, color, category, description, archived_at, group_members(id)",
        )
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const restore = useMutation({
    mutationFn: (group_id: string) => restoreFn({ data: { group_id } }),
    onSuccess: () => {
      toast.success("Group restored");
      qc.invalidateQueries({ queryKey: ["archived-groups"] });
      qc.invalidateQueries({ queryKey: ["groups-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard-groups"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const purge = useMutation({
    mutationFn: (group_id: string) => purgeFn({ data: { group_id } }),
    onSuccess: () => {
      toast.success("Group deleted forever");
      qc.invalidateQueries({ queryKey: ["archived-groups"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const items = q.data ?? [];

  if (q.isLoading) {
    return (
      <div className="text-center py-10">
        <Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-10 mx-auto text-muted-foreground mb-3" />}
        title="No deleted groups"
        subtitle="Groups you delete from the groups list show up here."
      />
    );
  }

  return (
    <div
      className="glass-card rounded-2xl divide-y divide-border overflow-hidden"
      data-testid="archived-groups-list"
    >
      {items.map((g: any) => (
        <div
          key={g.id}
          className="flex items-center gap-3 p-4 flex-wrap"
          data-testid={`archived-group-${g.id}`}
        >
          <div
            className="size-10 rounded-xl grid place-items-center font-display font-semibold text-sm"
            style={{
              backgroundColor: (g.color ?? "#7C5CFF") + "22",
              color: g.color ?? "#7C5CFF",
            }}
          >
            {initialsOf(g.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{g.name}</div>
            <div className="text-xs text-muted-foreground">
              {g.group_members?.length ?? 0} members · {g.category}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => restore.mutate(g.id)}
              disabled={restore.isPending}
              data-testid={`restore-group-${g.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
            >
              <ArchiveRestore className="size-3.5" /> Restore
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    `Delete "${g.name}" forever? All expenses, splits, and members in this group will be gone for good.`,
                  )
                ) {
                  purge.mutate(g.id);
                }
              }}
              disabled={purge.isPending}
              data-testid={`purge-group-${g.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-xs hover:bg-destructive/20 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="glass-card rounded-2xl p-10 text-center">
      {icon}
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}
