import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSharedExpense, guestMarkSplitPaid } from "@/lib/shared-links.functions";
import { formatDate, formatMoney, initialsOf } from "@/lib/format";
import { Check, Loader2, Receipt, Shield } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "Settle up · Splitit" },
      { name: "description", content: "View and settle a shared expense — no account needed." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: GuestShare,
});

function GuestShare() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getSharedExpense);
  const markFn = useServerFn(guestMarkSplitPaid);

  const q = useQuery({
    queryKey: ["share", token],
    queryFn: () => getFn({ data: { token } }),
  });

  const mark = useMutation({
    mutationFn: (split_id: string) => markFn({ data: { token, split_id } }),
    onSuccess: () => {
      toast.success("Marked as paid — thanks!");
      qc.invalidateQueries({ queryKey: ["share", token] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  if (q.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="text-center max-w-md">
          <h1 className="font-display text-2xl font-semibold">Link unavailable</h1>
          <p className="text-muted-foreground mt-2">{(q.error as Error).message}</p>
          <Link to="/" className="mt-6 inline-block text-primary hover:underline">
            Go to Splitit
          </Link>
        </div>
      </div>
    );
  }

  const data = q.data!;
  return (
    <div className="min-h-screen">
      {/* Mini header */}
      <header className="border-b border-border/60 backdrop-blur-xl bg-background/70">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center font-display font-bold text-primary-foreground text-sm">
              S
            </div>
            <span className="font-display font-semibold">Splitit</span>
          </Link>
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Shield className="size-3.5" /> Secure guest link
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
        {data.type === "expense" ? (
          <ExpenseView data={data} onMark={(id) => mark.mutate(id)} pending={mark.isPending} />
        ) : (
          <GroupView data={data} />
        )}

        <div className="mt-10 rounded-2xl bg-card/50 border border-border p-5 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Splitit makes splitting bills with friends effortless.
          </p>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition"
          >
            Create your own account
          </Link>
        </div>
      </main>
    </div>
  );
}

function ExpenseView({
  data,
  onMark,
  pending,
}: {
  data: Extract<Awaited<ReturnType<typeof getSharedExpense>>, { type: "expense" }>;
  onMark: (id: string) => void;
  pending: boolean;
}) {
  const { expense, splits, members, items, payer_name } = data;
  const memberById: Record<string, any> = {};
  members.forEach((m: any) => (memberById[m.id] = m));

  const paidSum = splits.filter((s) => s.paid).reduce((a, s) => a + Number(s.amount), 0);
  const progress = (paidSum / Number(expense.amount)) * 100;

  return (
    <>
      <div className="text-center mb-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {payer_name} paid
        </div>
        <div className="font-numeric text-5xl mt-2 gradient-text">
          {formatMoney(Number(expense.amount), expense.currency)}
        </div>
        <div className="mt-1 text-foreground font-semibold">{expense.description}</div>
        <div className="text-xs text-muted-foreground">
          {formatDate(expense.expense_date)}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 mb-5">
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>Settled</span>
          <span>
            {formatMoney(paidSum, expense.currency)} /{" "}
            {formatMoney(Number(expense.amount), expense.currency)}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </div>

      {items.length > 0 && (
        <div className="glass-card rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Receipt className="size-4" /> Items
          </h2>
          <div className="space-y-1.5 text-sm">
            {items.map((it, i) => (
              <div key={i} className="flex justify-between text-muted-foreground">
                <span>
                  {it.name} {it.quantity > 1 && <span className="text-xs">×{it.quantity}</span>}
                </span>
                <span className="font-numeric">
                  {formatMoney(Number(it.price) * (it.quantity ?? 1), expense.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold text-sm">Who owes what</h2>
        </div>
        <div className="divide-y divide-border">
          {splits.map((s) => {
            const member = memberById[s.member_id];
            const isPayer = s.member_id === expense.paid_by_member_id;
            return (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="size-9 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 grid place-items-center text-xs font-medium">
                  {initialsOf(member?.display_name ?? "?")}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{member?.display_name ?? "Member"}</div>
                  {isPayer && <div className="text-xs text-muted-foreground">paid the bill</div>}
                </div>
                <div className="font-numeric text-sm font-semibold">
                  {formatMoney(Number(s.amount), expense.currency)}
                </div>
                {!isPayer &&
                  (s.paid ? (
                    <span className="text-xs inline-flex items-center gap-1 text-accent bg-accent/10 px-2 py-1 rounded-md">
                      <Check className="size-3" /> Paid
                    </span>
                  ) : (
                    <button
                      onClick={() => onMark(s.id)}
                      disabled={pending}
                      className="text-xs rounded-md bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 transition disabled:opacity-50"
                    >
                      Mark paid
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function GroupView({
  data,
}: {
  data: Extract<Awaited<ReturnType<typeof getSharedExpense>>, { type: "group" }>;
}) {
  const total = data.expenses.reduce((a, e) => a + Number(e.amount), 0);
  const memberById: Record<string, any> = {};
  data.members.forEach((m: any) => (memberById[m.id] = m));

  return (
    <>
      <div className="text-center mb-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Group</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">
          {data.group.name}
        </h1>
        <div className="font-numeric text-2xl mt-3 text-muted-foreground">
          {formatMoney(total)} total
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold text-sm">Expenses</h2>
        </div>
        <div className="divide-y divide-border">
          {data.expenses.map((e) => (
            <div key={e.id} className="flex items-center gap-3 p-4">
              <div className="size-9 rounded-xl bg-primary/15 text-primary grid place-items-center">
                <Receipt className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{e.description}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(e.expense_date)} ·{" "}
                  {memberById[e.paid_by_member_id ?? ""]?.display_name ?? "Someone"} paid
                </div>
              </div>
              <div className="font-numeric text-sm">
                {formatMoney(Number(e.amount), e.currency)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
