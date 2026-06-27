import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  getSharedExpense,
  guestMarkSplitPaid,
  guestClaimItems,
  guestPayClaims,
} from "@/lib/shared-links.functions";
import { formatDate, formatMoney, initialsOf } from "@/lib/format";
import {
  Check,
  Loader2,
  Receipt,
  Shield,
  Smartphone,
  Landmark,
  CheckCircle2,
} from "lucide-react";
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

  // ✅ DEBUG: Log the token from the URL
  console.log(`[Route] 🔍 Token from URL: "${token}"`);
  console.log(`[Route] 📝 Token length: ${token.length}`);
  console.log(`[Route] 📝 Token type: ${typeof token}`);

  const q = useQuery({
    queryKey: ["share", token],
    queryFn: async () => {
      console.log(`[Route] 📤 Calling getSharedExpense with token: "${token}"`);
      try {
        const result = await getFn({ data: { token } });
        console.log(`[Route] ✅ getSharedExpense succeeded:`, result);
        return result;
      } catch (error) {
        console.error(`[Route] ❌ getSharedExpense failed:`, error);
        throw error;
      }
    },
  });

  const markFn = useServerFn(guestMarkSplitPaid);
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
    const msg = (q.error as Error).message || "";
    console.error(`[Route] ❌ Error rendering:`, msg);
    const isConfig =
      /service role|SUPABASE_URL|missing|env/i.test(msg);
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="text-center max-w-md">
          <h1 className="font-display text-2xl font-semibold">Link unavailable</h1>
          <p className="text-muted-foreground mt-2 text-sm">{msg}</p>
          {isConfig && (
            <div className="mt-4 rounded-xl border border-border bg-card/60 p-4 text-left text-xs text-muted-foreground">
              <div className="font-medium text-foreground mb-1">Deployment hint</div>
              Set <code className="font-numeric">SUPABASE_URL</code>,{" "}
              <code className="font-numeric">SUPABASE_SERVICE_ROLE_KEY</code>,{" "}
              <code className="font-numeric">VITE_SUPABASE_URL</code> and{" "}
              <code className="font-numeric">VITE_SUPABASE_ANON_KEY</code> in your Vercel project
              env, then redeploy. See <code>DEPLOYMENT.md</code>.
            </div>
          )}
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
          <ExpenseView data={data} token={token} onMark={(id) => mark.mutate(id)} pending={mark.isPending} />
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

type ExpenseData = Extract<Awaited<ReturnType<typeof getSharedExpense>>, { type: "expense" }>;

function ExpenseView({
  data,
  token,
  onMark,
  pending,
}: {
  data: ExpenseData;
  token: string;
  onMark: (id: string) => void;
  pending: boolean;
}) {
  const { expense, splits, members, items, claims, payer_name, payer_payment } = data;
  const memberById: Record<string, any> = {};
  members.forEach((m: any) => (memberById[m.id] = m));

  const claimsByItem = useMemo(() => {
    const map: Record<string, typeof claims> = {};
    for (const c of claims) {
      (map[c.item_id] ||= []).push(c);
    }
    return map;
  }, [claims]);

  const totalClaimed = claims.reduce((a, c) => a + Number(c.amount), 0);
  const totalPaidViaClaims = claims
    .filter((c) => c.paid)
    .reduce((a, c) => a + Number(c.amount), 0);
  const paidSplitSum = splits.filter((s) => s.paid).reduce((a, s) => a + Number(s.amount), 0);
  const totalPaid = paidSplitSum + totalPaidViaClaims;
  const progress = (totalPaid / Number(expense.amount)) * 100;

  const hasItems = items.length > 0;
  const claimMode = (expense as any).claim_mode ?? "free";
  const showItemClaiming = hasItems && claimMode !== "preassigned";

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
            {formatMoney(totalPaid, expense.currency)} /{" "}
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

      {showItemClaiming ? (
        <ItemClaimSection
          token={token}
          expense={expense}
          items={items}
          claimsByItem={claimsByItem}
          payerPayment={payer_payment}
          claimMode={claimMode}
        />
      ) : (
        <>
          {hasItems && (
            <div className="glass-card rounded-2xl p-5 mb-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Receipt className="size-4" /> Items
              </h2>
              <div className="space-y-1.5 text-sm">
                {items.map((it: any) => (
                  <div key={it.id} className="flex justify-between text-muted-foreground">
                    <span>
                      {it.name}{" "}
                      {it.quantity > 1 && <span className="text-xs">×{it.quantity}</span>}
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
      )}
    </>
  );
}

function ItemClaimSection({
  token,
  expense,
  items,
  claimsByItem,
  payerPayment,
  claimMode,
}: {
  token: string;
  expense: ExpenseData["expense"];
  items: ExpenseData["items"];
  claimsByItem: Record<string, ExpenseData["claims"]>;
  payerPayment: ExpenseData["payer_payment"];
  claimMode: string;
}) {
  const qc = useQueryClient();
  const claimFn = useServerFn(guestClaimItems);
  const payFn = useServerFn(guestPayClaims);

  const [guestName, setGuestName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"pick" | "pay" | "done">("pick");
  const [createdClaimIds, setCreatedClaimIds] = useState<string[]>([]);
  const [method, setMethod] = useState<"mtn_momo" | "airtel_money" | "bank_transfer">("mtn_momo");
  const [payerPhone, setPayerPhone] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [approvalOpen, setApprovalOpen] = useState(false);

  const selectedTotal = useMemo(() => {
    let sum = 0;
    for (const it of items as any[]) {
      if (selected.has(it.id)) sum += Number(it.price) * (it.quantity ?? 1);
    }
    return sum;
  }, [selected, items]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const claim = useMutation({
    mutationFn: () =>
      claimFn({
        data: {
          token,
          item_ids: Array.from(selected),
          guest_name: guestName.trim(),
        },
      }),
    onSuccess: (res) => {
      setCreatedClaimIds(res.claim_ids);
      setStep("pay");
      toast.success(`Claimed ${formatMoney(res.total, expense.currency)} — choose payment`);
      qc.invalidateQueries({ queryKey: ["share", token] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not claim"),
  });

  const buildReference = () => {
    if (method === "bank_transfer") {
      if (cardNumber.length >= 12) {
        return `CARD •••• ${cardNumber.replace(/\s/g, "").slice(-4)}`;
      }
      return bankRef || undefined;
    }
    return payerPhone ? `From ${payerPhone}` : undefined;
  };

  const pay = useMutation({
    mutationFn: () =>
      payFn({
        data: {
          token,
          claim_ids: createdClaimIds,
          method,
          reference: buildReference(),
        },
      }),
    onSuccess: (res) => {
      setApprovalOpen(false);
      setStep("done");
      toast.success(`Paid ${formatMoney(res.total, expense.currency)} via mock checkout`);
      qc.invalidateQueries({ queryKey: ["share", token] });
    },
    onError: (e: any) => {
      setApprovalOpen(false);
      toast.error(e.message ?? "Payment failed");
    },
  });

  const startPay = () => {
    if (method !== "bank_transfer") {
      if (!/^[0-9+\s-]{9,15}$/.test(payerPhone.trim())) {
        toast.error("Enter a valid Mobile Money number");
        return;
      }
      setApprovalOpen(true);
      // Simulate user approving on their phone after a short delay
      setTimeout(() => pay.mutate(), 1800);
      return;
    }
    // bank
    const isCard = cardNumber.replace(/\s/g, "").length >= 12;
    if (!isCard && !bankRef.trim()) {
      toast.error("Enter card details or a bank transfer reference");
      return;
    }
    if (isCard) {
      if (!/^\d{2}\/\d{2}$/.test(cardExpiry) || cardCvv.length < 3) {
        toast.error("Check card expiry (MM/YY) and CVV");
        return;
      }
    }
    pay.mutate();
  };


  if (step === "done") {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <CheckCircle2 className="size-12 mx-auto text-accent mb-3" />
        <h2 className="font-display text-xl font-semibold">You're settled up</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {expense.paid_by_member_id ? `${payerPayment?.display_name ?? "The organiser"} has been notified.` : "Recorded."}
        </p>
        <button
          onClick={() => {
            setStep("pick");
            setSelected(new Set());
            setCreatedClaimIds([]);
          }}
          className="mt-6 text-sm text-primary hover:underline"
        >
          Claim more items
        </button>
      </div>
    );
  }

  if (step === "pay") {
    return (
      <>
        <PayPanel
          amount={selectedTotal}
          currency={expense.currency}
          payerPayment={payerPayment}
          guestName={guestName}
          method={method}
          setMethod={setMethod}
          payerPhone={payerPhone}
          setPayerPhone={setPayerPhone}
          cardNumber={cardNumber}
          setCardNumber={setCardNumber}
          cardExpiry={cardExpiry}
          setCardExpiry={setCardExpiry}
          cardCvv={cardCvv}
          setCardCvv={setCardCvv}
          bankRef={bankRef}
          setBankRef={setBankRef}
          onPay={startPay}
          pending={pay.isPending || approvalOpen}
        />
        {approvalOpen && (
          <MomoApprovalModal
            phone={payerPhone}
            amount={selectedTotal}
            currency={expense.currency}
            method={method as "mtn_momo" | "airtel_money"}
            payeeName={payerPayment?.momo_name ?? payerPayment?.display_name ?? "Splitit organiser"}
          />
        )}
      </>
    );
  }


  return (
    <div className="glass-card rounded-2xl overflow-hidden mb-5">
      <div className="p-5 border-b border-border">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Receipt className="size-4" /> Pick the items you're paying for
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {claimMode === "first_come"
            ? "First-come, first-served — locked items have been claimed."
            : "Multiple people can claim the same item — split however you like."}
        </p>
      </div>

      <div className="divide-y divide-border">
        {(items as any[]).map((it) => {
          const itemClaims = claimsByItem[it.id] ?? [];
          const isLocked = claimMode === "first_come" && (it.locked || itemClaims.length > 0);
          const isSelected = selected.has(it.id);
          const lineTotal = Number(it.price) * (it.quantity ?? 1);
          return (
            <button
              key={it.id}
              type="button"
              disabled={isLocked}
              onClick={() => toggle(it.id)}
              className={`w-full text-left flex items-center gap-3 p-4 transition ${
                isLocked
                  ? "opacity-50 cursor-not-allowed"
                  : isSelected
                    ? "bg-primary/10"
                    : "hover:bg-muted/50"
              }`}
            >
              <div
                className={`size-5 rounded-md border-2 grid place-items-center transition ${
                  isSelected ? "bg-primary border-primary" : "border-border"
                }`}
              >
                {isSelected && <Check className="size-3.5 text-primary-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {it.name}
                  {it.quantity > 1 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">×{it.quantity}</span>
                  )}
                </div>
                {itemClaims.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Claimed by {itemClaims.map((c) => c.guest_name).join(", ")}
                  </div>
                )}
              </div>
              <div className="font-numeric text-sm font-semibold">
                {formatMoney(lineTotal, expense.currency)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-5 border-t border-border space-y-3">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Your name
          </label>
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="So everyone knows who paid"
            className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            <div className="text-xs text-muted-foreground">Your total</div>
            <div className="font-numeric text-2xl font-semibold">
              {formatMoney(selectedTotal, expense.currency)}
            </div>
          </div>
          <button
            onClick={() => claim.mutate()}
            disabled={claim.isPending || selected.size === 0 || !guestName.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {claim.isPending && <Loader2 className="size-4 animate-spin" />}
            Continue to pay
          </button>
        </div>
      </div>
    </div>
  );
}

function PayPanel({
  amount,
  currency,
  payerPayment,
  guestName,
  method,
  setMethod,
  payerPhone,
  setPayerPhone,
  cardNumber,
  setCardNumber,
  cardExpiry,
  setCardExpiry,
  cardCvv,
  setCardCvv,
  bankRef,
  setBankRef,
  onPay,
  pending,
}: {
  amount: number;
  currency: string;
  payerPayment: ExpenseData["payer_payment"];
  guestName: string;
  method: "mtn_momo" | "airtel_money" | "bank_transfer";
  setMethod: (m: "mtn_momo" | "airtel_money" | "bank_transfer") => void;
  payerPhone: string;
  setPayerPhone: (s: string) => void;
  cardNumber: string;
  setCardNumber: (s: string) => void;
  cardExpiry: string;
  setCardExpiry: (s: string) => void;
  cardCvv: string;
  setCardCvv: (s: string) => void;
  bankRef: string;
  setBankRef: (s: string) => void;
  onPay: () => void;
  pending: boolean;
}) {
  const options = [
    {
      id: "mtn_momo" as const,
      label: "MTN Mobile Money",
      icon: Smartphone,
      hint: payerPayment?.momo_provider === "mtn_momo" ? payerPayment.momo_number : null,
    },
    {
      id: "airtel_money" as const,
      label: "Airtel Money",
      icon: Smartphone,
      hint: payerPayment?.momo_provider === "airtel_money" ? payerPayment.momo_number : null,
    },
    {
      id: "bank_transfer" as const,
      label: "Bank / Card",
      icon: Landmark,
      hint: payerPayment?.bank_account_number ?? null,
    },
  ];

  const recipient =
    method === "bank_transfer"
      ? {
          line1: payerPayment?.bank_name || "Bank not set by organiser",
          line2: payerPayment?.bank_account_number
            ? `${payerPayment.bank_account_number} · ${payerPayment.bank_account_name ?? ""}`
            : "Use any card — funds route via mock processor",
        }
      : {
          line1:
            payerPayment?.momo_provider === method
              ? payerPayment.momo_name ?? "Recipient"
              : "Organiser hasn't set this method",
          line2:
            payerPayment?.momo_provider === method
              ? payerPayment.momo_number ?? ""
              : "Pick another method or notify them",
        };

  return (
    <div className="glass-card rounded-2xl p-5 mb-5 space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {guestName ? `${guestName}, you're paying` : "You're paying"}
        </div>
        <div className="font-numeric text-4xl font-semibold mt-1 gradient-text">
          {formatMoney(amount, currency)}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Payment method
        </div>
        <div className="grid gap-2">
          {options.map((opt) => {
            const active = method === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMethod(opt.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <Icon className="size-5 text-primary" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{opt.label}</div>
                  {opt.hint && (
                    <div className="text-xs text-muted-foreground font-numeric">{opt.hint}</div>
                  )}
                </div>
                <div
                  className={`size-4 rounded-full border-2 ${
                    active ? "border-primary bg-primary" : "border-border"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl bg-muted/30 border border-border p-4 text-sm">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
          Send to
        </div>
        <div className="font-medium">{recipient.line1}</div>
        <div className="font-numeric text-muted-foreground">{recipient.line2}</div>
      </div>

      {/* Method-specific form */}
      {method !== "bank_transfer" ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Your {method === "mtn_momo" ? "MTN" : "Airtel"} number
            </label>
            <input
              value={payerPhone}
              onChange={(e) => setPayerPhone(e.target.value)}
              placeholder="e.g. 0772 123 456"
              inputMode="tel"
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary font-numeric"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              You'll get a pop-up on your phone to approve the transaction.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Pay with card
            </div>
            <input
              value={cardNumber}
              onChange={(e) =>
                setCardNumber(
                  e.target.value
                    .replace(/[^\d]/g, "")
                    .slice(0, 19)
                    .replace(/(.{4})/g, "$1 ")
                    .trim(),
                )
              }
              placeholder="Card number  ·  4242 4242 4242 4242"
              inputMode="numeric"
              className="w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary font-numeric"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={cardExpiry}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
                  setCardExpiry(v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v);
                }}
                placeholder="MM/YY"
                className="rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary font-numeric"
              />
              <input
                value={cardCvv}
                onChange={(e) => setCardCvv(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                placeholder="CVV"
                inputMode="numeric"
                className="rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary font-numeric"
              />
            </div>
          </div>
          <div className="text-center text-xs text-muted-foreground">
            — or use your bank app —
          </div>
          <div className="rounded-xl border border-border p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Already transferred from your bank app?
            </div>
            <input
              value={bankRef}
              onChange={(e) => setBankRef(e.target.value)}
              placeholder="Paste your transfer reference / FT number"
              className="w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary font-numeric"
            />
            <p className="text-xs text-muted-foreground">
              Tip: open Stanbic / Centenary / Equity etc., send to the account above, then paste
              the reference here.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={onPay}
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-3 font-medium hover:opacity-90 transition disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "Processing…" : `Pay ${formatMoney(amount, currency)}`}
      </button>
      <p className="text-xs text-muted-foreground text-center">
        Mock checkout — no real money moves. The method you choose is saved so the organiser knows
        how to expect it.
      </p>
    </div>
  );
}

function MomoApprovalModal({
  phone,
  amount,
  currency,
  method,
  payeeName,
}: {
  phone: string;
  amount: number;
  currency: string;
  method: "mtn_momo" | "airtel_money";
  payeeName: string;
}) {
  const network = method === "mtn_momo" ? "MTN MoMo" : "Airtel Money";
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-card border border-border p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center">
            <Smartphone className="size-5" />
          </div>
          <div>
            <div className="font-semibold">{network} request sent</div>
            <div className="text-xs text-muted-foreground font-numeric">{phone}</div>
          </div>
        </div>
        <div className="rounded-xl bg-muted/40 border border-border p-4 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-numeric font-semibold">{formatMoney(amount, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">To</span>
            <span className="font-medium truncate ml-3">{payeeName}</span>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Check your phone and enter your {network} PIN to approve…</span>
        </div>
      </div>
    </div>
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
