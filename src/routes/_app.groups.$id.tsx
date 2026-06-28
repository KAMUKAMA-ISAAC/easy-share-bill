import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { addGroupMember, createShareLink, deleteGroup } from "@/lib/expenses.functions";
import { formatDate, formatMoney, initialsOf } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Plus, Receipt, Share2, Trash2, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_app/groups/$id")({
  head: () => ({ meta: [{ title: "Group — Splitit" }] }),
  component: GroupDetail,
});

function GroupDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [mName, setMName] = useState("");
  const [mEmail, setMEmail] = useState("");

  const groupQ = useQuery({
    queryKey: ["group", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, description, color, category, created_by, group_members(id, display_name, email, user_id)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const expensesQ = useQuery({
    queryKey: ["group-expenses", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, description, amount, currency, expense_date, paid_by_member_id, splits(amount,paid)")
        .eq("group_id", id)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMemberFn = useServerFn(addGroupMember);
  const addMutation = useMutation({
    mutationFn: () =>
      addMemberFn({
        data: { group_id: id, display_name: mName.trim(), email: mEmail.trim() },
      }),
    onSuccess: () => {
      toast.success("Member added");
      setMName("");
      setMEmail("");
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["group", id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const shareFn = useServerFn(createShareLink);
  const handleShare = async () => {
    try {
      const { token, share_code } = await shareFn({ data: { resource_type: "group", resource_id: id } });
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success(`Share link copied! Code: ${share_code}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  };

  const deleteFn = useServerFn(deleteGroup);
  const del = useMutation({
    mutationFn: () => deleteFn({ data: { group_id: id } }),
    onSuccess: () => {
      toast.success("Group deleted");
      navigate({ to: "/groups" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const group = groupQ.data;
  const members = group?.group_members ?? [];
  const expenses = expensesQ.data ?? [];
  const totalSpent = expenses.reduce((a, e) => a + Number(e.amount), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
      <Link
        to="/groups"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" /> Groups
      </Link>

      {group && (
        <div className="flex items-start gap-4 mb-8">
          <div
            className="size-16 rounded-2xl grid place-items-center font-display font-semibold text-2xl"
            style={{
              backgroundColor: (group.color ?? "#7C5CFF") + "22",
              color: group.color ?? "#7C5CFF",
            }}
          >
            {initialsOf(group.name)}
          </div>
          <div className="flex-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{group.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {members.length} members · {group.category} ·{" "}
              <span className="font-numeric">{formatMoney(totalSpent)}</span> total
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleShare}
              className="rounded-xl border border-border px-4 py-2 text-sm inline-flex items-center gap-2 hover:bg-muted transition"
            >
              <Share2 className="size-4" /> Share
            </button>
            <Link
              to="/expenses/new"
              search={{ group_id: id }}
              className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium inline-flex items-center gap-2 hover:opacity-90 transition"
            >
              <Plus className="size-4" /> Expense
            </Link>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_280px] gap-6">
        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Expenses</h2>
          <div className="glass-card rounded-2xl divide-y divide-border overflow-hidden">
            {expenses.length === 0 && (
              <div className="p-10 text-center">
                <Receipt className="size-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4">No expenses yet</p>
                <Link
                  to="/expenses/new"
                  search={{ group_id: id }}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition"
                >
                  <Plus className="size-4" /> Add first expense
                </Link>
              </div>
            )}
            {expenses.map((e) => {
              const paidPct =
                ((e.splits ?? []).filter((s) => s.paid).reduce((a, s) => a + Number(s.amount), 0) /
                  Number(e.amount)) *
                100;
              return (
                <Link
                  key={e.id}
                  to="/expenses/$id"
                  params={{ id: e.id }}
                  className="flex items-center gap-4 p-4 hover:bg-muted/40 transition"
                >
                  <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center">
                    <Receipt className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{e.description}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(e.expense_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-numeric font-semibold">
                      {formatMoney(Number(e.amount), e.currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(paidPct)}% settled
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <aside>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold">Members</h2>
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="text-primary hover:underline text-sm inline-flex items-center gap-1"
            >
              <UserPlus className="size-3.5" /> Add
            </button>
          </div>

          {showAdd && (
            <div className="glass-card rounded-2xl p-4 mb-3 space-y-2">
              <input
                value={mName}
                onChange={(e) => setMName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                type="email"
                value={mEmail}
                onChange={(e) => setMEmail(e.target.value)}
                placeholder="email (optional)"
                className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={() => addMutation.mutate()}
                  disabled={!mName.trim() || addMutation.isPending}
                  className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="glass-card rounded-2xl divide-y divide-border overflow-hidden">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-3">
                <div className="size-9 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 grid place-items-center text-xs font-medium">
                  {initialsOf(m.display_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.display_name}</div>
                  {m.email && (
                    <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  )}
                </div>
                {!m.user_id && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    guest
                  </span>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
