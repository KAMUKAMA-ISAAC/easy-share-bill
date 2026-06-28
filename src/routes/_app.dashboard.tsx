import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { formatMoney, formatDate, initialsOf } from "@/lib/format";
import { ArrowUpRight, Plus, Receipt, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Splitit" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();

  const expensesQ = useQuery({
    queryKey: ["dashboard-expenses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "id, description, amount, currency, expense_date, category, group_id, paid_by_user_id, paid_by_member_id, splits(id,member_id,amount,paid), groups(name,color)",
        )
        .is("archived_at", null)
        .order("expense_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const groupsQ = useQuery({
    queryKey: ["dashboard-groups", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, color, category, group_members(id,user_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Compute balances
  const { youAreOwed, youOwe } = computeBalances(expensesQ.data ?? [], user?.id);
  const net = youAreOwed - youOwe;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">
            Your balances
          </h1>
        </div>
        <Link
          to="/expenses/new"
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:opacity-90 transition shadow-lg shadow-primary/20"
        >
          <Plus className="size-4" /> New expense
        </Link>
      </div>

      {/* Balance cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <span>Net balance</span>
            <Wallet className="size-4" />
          </div>
          <div
            className={`font-numeric text-4xl mt-3 ${
              net >= 0 ? "text-accent" : "text-destructive"
            }`}
          >
            {net >= 0 ? "+" : "-"}
            {formatMoney(Math.abs(net))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {net >= 0 ? "You're net positive" : "You owe overall"}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <span>Owed to you</span>
            <TrendingUp className="size-4 text-accent" />
          </div>
          <div className="font-numeric text-4xl mt-3">{formatMoney(youAreOwed)}</div>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <span>You owe</span>
            <TrendingDown className="size-4 text-destructive" />
          </div>
          <div className="font-numeric text-4xl mt-3">{formatMoney(youOwe)}</div>
        </div>
      </div>

      {/* Groups */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">Your groups</h2>
          <Link
            to="/groups"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            View all <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Link
            to="/groups/new"
            className="glass-card rounded-2xl p-5 border-dashed hover:border-primary hover:bg-primary/5 transition flex flex-col items-center justify-center min-h-[120px] text-muted-foreground hover:text-primary"
          >
            <Plus className="size-6 mb-2" />
            <span className="text-sm font-medium">Create group</span>
          </Link>
          {(groupsQ.data ?? []).slice(0, 5).map((g) => (
            <Link
              key={g.id}
              to="/groups/$id"
              params={{ id: g.id }}
              className="glass-card rounded-2xl p-5 hover:border-border-strong transition group"
            >
              <div className="flex items-start justify-between">
                <div
                  className="size-10 rounded-xl grid place-items-center font-display font-semibold"
                  style={{
                    backgroundColor: (g.color ?? "#7C5CFF") + "22",
                    color: g.color ?? "#7C5CFF",
                  }}
                >
                  {initialsOf(g.name)}
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground transition" />
              </div>
              <div className="mt-3 font-semibold">{g.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {(g.group_members?.length ?? 0)} members · {g.category}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent expenses */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">Recent expenses</h2>
        </div>
        <div className="glass-card rounded-2xl divide-y divide-border overflow-hidden">
          {(expensesQ.data ?? []).length === 0 && (
            <div className="p-10 text-center">
              <Receipt className="size-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No expenses yet</p>
              <Link
                to="/expenses/new"
                className="inline-flex mt-4 items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition"
              >
                <Plus className="size-4" /> Add your first expense
              </Link>
            </div>
          )}
          {(expensesQ.data ?? []).slice(0, 10).map((e: any) => {
            const yourSplit = e.splits?.find(
              (s: any) => s.member_id && e.paid_by_member_id !== s.member_id,
            );
            const youPaid = e.paid_by_user_id === user?.id;
            return (
              <Link
                key={e.id}
                to="/expenses/$id"
                params={{ id: e.id }}
                className="flex items-center gap-4 p-4 hover:bg-muted/40 transition"
              >
                <div
                  className="size-10 rounded-xl grid place-items-center"
                  style={{
                    backgroundColor: (e.groups?.color ?? "#7C5CFF") + "22",
                    color: e.groups?.color ?? "#7C5CFF",
                  }}
                >
                  <Receipt className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{e.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.groups?.name ?? "Personal"} · {formatDate(e.expense_date)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-numeric font-semibold">
                    {formatMoney(Number(e.amount), e.currency)}
                  </div>
                  <div className={`text-xs ${youPaid ? "text-accent" : "text-muted-foreground"}`}>
                    {youPaid ? "you paid" : "you owe"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function computeBalances(
  expenses: Array<{
    amount: number;
    paid_by_user_id: string;
    paid_by_member_id: string | null;
    splits?: Array<{ member_id: string; amount: number; paid: boolean }>;
  }>,
  userId: string | undefined,
) {
  let youAreOwed = 0;
  let youOwe = 0;
  if (!userId) return { youAreOwed, youOwe };
  for (const e of expenses) {
    if (e.paid_by_user_id === userId) {
      // sum of unpaid splits for others
      const owedToYou = (e.splits ?? [])
        .filter((s) => s.member_id !== e.paid_by_member_id && !s.paid)
        .reduce((a, s) => a + Number(s.amount), 0);
      youAreOwed += owedToYou;
    }
    // For "you owe": handled when current user is a non-payer member
    // (best-effort without member->user mapping in this query)
  }
  return { youAreOwed, youOwe };
}
