import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { formatMoney, formatDate, initialsOf } from "@/lib/format";
import { getExpenseByCode } from "@/lib/receipt-codes.functions";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Hash,
  Loader2,
  Plus,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Splitit" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const [expensesOpen, setExpensesOpen] = useState(false);

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
        .select(
          "id, name, color, category, archived_at, group_members(id,user_id)",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { youAreOwed, youOwe } = computeBalances(expensesQ.data ?? [], user?.id);
  const net = youAreOwed - youOwe;
  const expenses = expensesQ.data ?? [];

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
          data-testid="new-expense-btn"
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
            data-testid="net-balance-amount"
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
          <div className="font-numeric text-4xl mt-3" data-testid="owed-to-you-amount">
            {formatMoney(youAreOwed)}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <span>You owe</span>
            <TrendingDown className="size-4 text-destructive" />
          </div>
          <div className="font-numeric text-4xl mt-3" data-testid="you-owe-amount">
            {formatMoney(youOwe)}
          </div>
        </div>
      </div>

      {/* Join Receipt — prominent, dashboard-only entry point */}
      <DashboardJoinReceipt />

      {/* Groups */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">Your groups</h2>
          <Link
            to="/groups"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            data-testid="dashboard-view-all-groups-link"
          >
            View all <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Link
            to="/groups/new"
            data-testid="dashboard-create-group-btn"
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
              data-testid={`dashboard-group-${g.id}`}
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

      {/* Recent expenses — collapsible */}
      <div>
        <button
          type="button"
          onClick={() => setExpensesOpen((v) => !v)}
          className="w-full flex items-center justify-between mb-4 group"
          data-testid="recent-expenses-toggle"
          aria-expanded={expensesOpen}
        >
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl font-semibold">Recent expenses</h2>
            <span className="rounded-full bg-muted text-muted-foreground text-xs px-2 py-0.5 font-numeric">
              {expenses.length}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground transition">
            {expensesOpen ? (
              <>
                Hide <ChevronUp className="size-4" />
              </>
            ) : (
              <>
                Show <ChevronDown className="size-4" />
              </>
            )}
          </span>
        </button>

        {expensesOpen && (
          <div
            className="glass-card rounded-2xl divide-y divide-border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
            data-testid="recent-expenses-list"
          >
            {expenses.length === 0 && (
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
            {expenses.slice(0, 10).map((e: any) => {
              const youPaid = e.paid_by_user_id === user?.id;
              return (
                <Link
                  key={e.id}
                  to="/expenses/$id"
                  params={{ id: e.id }}
                  className="flex items-center gap-4 p-4 hover:bg-muted/40 transition"
                  data-testid={`dashboard-expense-${e.id}`}
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
                    <div
                      className={`text-xs ${
                        youPaid ? "text-accent" : "text-muted-foreground"
                      }`}
                    >
                      {youPaid ? "you paid" : "you owe"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Inline "Join Receipt" panel for the dashboard. Mirrors the landing-page
 * code lookup but tailored for signed-in users (different copy, no
 * "Open receipt" CTA dance, plain field + button).
 */
function DashboardJoinReceipt() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const lookupFn = useServerFn(getExpenseByCode);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const result = await lookupFn({ data: { code } });
      if (!result) {
        setError("Code not found or expired. Ask the organiser for a new one.");
        return;
      }
      toast.success("Receipt found — opening…");
      navigate({ to: "/share/$token", params: { token: result.token } });
    } catch (err: any) {
      setError(err?.message ?? "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="glass-card rounded-2xl p-5 sm:p-6 mb-10 border-primary/20"
      data-testid="dashboard-join-receipt"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
            <Hash className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">Join a receipt</h2>
            <p className="text-sm text-muted-foreground">
              Got a 6-character code from a friend? Enter it to open and pay
              your share.
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col sm:flex-row gap-2 sm:items-stretch w-full sm:max-w-md"
        >
          <input
            type="text"
            value={code}
            onChange={(ev) => {
              const v = ev.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 6);
              setCode(v);
              if (error) setError("");
            }}
            placeholder="ABC123"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            data-testid="dashboard-join-receipt-input"
            className="flex-1 rounded-xl border border-border bg-input px-4 py-2.5 text-center font-numeric text-xl tracking-[0.3em] uppercase focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            data-testid="dashboard-join-receipt-submit"
            className="rounded-xl bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:opacity-90 transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5 min-w-[110px]"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Open <ArrowUpRight className="size-4" />
              </>
            )}
          </button>
        </form>
      </div>
      {error && (
        <p
          className="text-destructive text-sm mt-3 sm:mt-2"
          data-testid="dashboard-join-receipt-error"
        >
          {error}
        </p>
      )}
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
  const youOwe = 0;
  if (!userId) return { youAreOwed, youOwe };
  for (const e of expenses) {
    if (e.paid_by_user_id === userId) {
      const owedToYou = (e.splits ?? [])
        .filter((s) => s.member_id !== e.paid_by_member_id && !s.paid)
        .reduce((a, s) => a + Number(s.amount), 0);
      youAreOwed += owedToYou;
    }
  }
  return { youAreOwed, youOwe };
}
