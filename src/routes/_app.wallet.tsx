import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getWalletSummary, requestWithdrawal } from "@/lib/wallet.functions";
import { formatMoney } from "@/lib/format";
import { Wallet as WalletIcon, ArrowDownToLine, ArrowUpRight, Loader2, Smartphone, Landmark } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/wallet")({
  head: () => ({ meta: [{ title: "Wallet — Splitit" }] }),
  component: WalletPage,
});

function WalletPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getWalletSummary);
  const withdrawFn = useServerFn(requestWithdrawal);

  const q = useQuery({
    queryKey: ["wallet"],
    queryFn: () => getFn(),
  });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [destination, setDestination] = useState<"mtn_momo" | "airtel_money" | "bank_transfer">("mtn_momo");
  const [reference, setReference] = useState("");

  const withdraw = useMutation({
    mutationFn: () => withdrawFn({ data: { amount, destination, reference: reference.trim() } }),
    onSuccess: () => {
      toast.success("Withdrawal requested — we'll process it shortly");
      setOpen(false);
      setAmount(0);
      setReference("");
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const balance = q.data?.balance ?? 0;
  const currency = q.data?.currency ?? "UGX";
  const transactions = q.data?.transactions ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight mb-6">Wallet</h1>

      <div className="glass-card rounded-2xl p-6 mb-6 bg-gradient-to-br from-primary/15 to-accent/10 border-primary/20">
        <div className="flex items-center justify-between text-muted-foreground text-sm">
          <span className="inline-flex items-center gap-2"><WalletIcon className="size-4" /> Available balance</span>
        </div>
        <div className="font-numeric text-5xl mt-3 gradient-text">{formatMoney(balance, currency)}</div>
        <p className="text-xs text-muted-foreground mt-2">
          Money lands here whenever a receipt you own is paid with "Wallet" as the payout destination.
        </p>
        <div className="mt-5 flex gap-2 flex-wrap">
          <button
            onClick={() => setOpen(true)}
            disabled={balance <= 0}
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            <ArrowDownToLine className="size-4" /> Withdraw funds
          </button>
          <Link
            to="/expenses/new"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 font-medium hover:bg-muted transition"
          >
            <ArrowUpRight className="size-4" /> Create receipt
          </Link>
        </div>
      </div>

      {open && (
        <div className="glass-card rounded-2xl p-5 mb-6 space-y-4">
          <h2 className="font-semibold">Withdraw</h2>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Amount (UGX)</label>
            <input
              type="number"
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
              max={balance}
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 font-numeric outline-none focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">Max {formatMoney(balance, currency)}</p>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Destination</label>
            <div className="mt-1 grid gap-2">
              {[
                { id: "mtn_momo" as const, label: "MTN Mobile Money", Icon: Smartphone },
                { id: "airtel_money" as const, label: "Airtel Money", Icon: Smartphone },
                { id: "bank_transfer" as const, label: "Bank account", Icon: Landmark },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDestination(id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition ${
                    destination === id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                  }`}
                >
                  <Icon className="size-4 text-primary" />
                  <span className="text-sm">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              {destination === "bank_transfer" ? "Account number" : "Phone number"}
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={destination === "bank_transfer" ? "0123456789" : "0772 123 456"}
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 font-numeric outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOpen(false)}
              className="flex-1 rounded-xl border border-border py-2.5 hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={() => withdraw.mutate()}
              disabled={!amount || amount > balance || !reference.trim() || withdraw.isPending}
              className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {withdraw.isPending && <Loader2 className="size-4 animate-spin" />}
              Request withdrawal
            </button>
          </div>
        </div>
      )}

      <h2 className="font-display text-lg font-semibold mb-3">Transactions</h2>
      <div className="glass-card rounded-2xl divide-y divide-border overflow-hidden">
        {q.isLoading && (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin mx-auto" />
          </div>
        )}
        {!q.isLoading && transactions.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No transactions yet. When someone pays a receipt set to "Wallet", it'll show up here.
          </div>
        )}
        {transactions.map((t: any) => {
          const credit = Number(t.amount) > 0;
          return (
            <div key={t.id} className="flex items-center gap-3 p-4">
              <div
                className={`size-10 rounded-xl grid place-items-center ${
                  credit ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
                }`}
              >
                {credit ? <ArrowDownToLine className="size-4" /> : <ArrowUpRight className="size-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{t.description ?? t.kind}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleString()} · {t.status}
                </div>
              </div>
              <div
                className={`font-numeric font-semibold text-sm ${
                  credit ? "text-accent" : "text-foreground"
                }`}
              >
                {credit ? "+" : ""}
                {formatMoney(Math.abs(Number(t.amount)), currency)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
