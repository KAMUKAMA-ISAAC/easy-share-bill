import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { createExpense } from "@/lib/expenses.functions";
import { parseReceipt } from "@/lib/receipts.functions";
import { computeSplit, type ItemInput, type SplitMode } from "@/lib/split-engine";
import { SplitEditor } from "@/components/split-editor";
import { ArrowLeft, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ group_id: z.string().uuid().optional() });

export const Route = createFileRoute("/_app/expenses/new")({
  head: () => ({ meta: [{ title: "New expense — Splitit" }] }),
  validateSearch: searchSchema,
  component: NewExpense,
});

function NewExpense() {
  const { group_id: initialGroupId } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();

  // form
  const [groupId, setGroupId] = useState<string | null>(initialGroupId ?? null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState("general");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [payerMemberId, setPayerMemberId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<ItemInput[] | null>(null);

  // split
  const [splitState, setSplitState] = useState<{
    mode: SplitMode;
    percentages: Record<string, number>;
    amounts: Record<string, number>;
    items: ItemInput[];
  }>({ mode: "equal", percentages: {}, amounts: {}, items: [] });

  const [perMember, setPerMember] = useState<Record<string, number>>({});
  const [splitValid, setSplitValid] = useState(true);
  const [splitError, setSplitError] = useState<string | undefined>();

  // data
  const groupsQ = useQuery({
    queryKey: ["my-groups-for-expense"],
    queryFn: async () => {
      const { data } = await supabase
        .from("groups")
        .select("id, name, color, group_members(id, display_name, user_id)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const selectedGroup = useMemo(
    () => (groupId ? groupsQ.data?.find((g) => g.id === groupId) : undefined),
    [groupId, groupsQ.data],
  );

  const members = useMemo(
    () =>
      (selectedGroup?.group_members ?? []).map((m: any) => ({
        id: m.id,
        name: m.display_name,
      })),
    [selectedGroup],
  );

  // default payer = the current user's member entry
  useMemo(() => {
    if (!selectedGroup || payerMemberId) return;
    const me = selectedGroup.group_members?.find((m: any) => m.user_id === user?.id);
    if (me) setPayerMemberId(me.id);
  }, [selectedGroup, payerMemberId, user?.id]);

  // Receipt upload + AI parse
  const parseFn = useServerFn(parseReceipt);
  const handleFile = async (file: File) => {
    if (!user) return;
    setScanning(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file);
      if (upErr) throw upErr;
      const parsed = await parseFn({ data: { storage_path: path } });
      setReceiptId(parsed.receipt_id);
      setDescription((d) => d || parsed.merchant || "Receipt");
      setAmount(Number(parsed.total));
      const items: ItemInput[] = parsed.items.map((it: any) => ({
        name: it.name,
        price: Number(it.price),
        quantity: Number(it.quantity ?? 1),
        assignedMemberIds: [],
      }));
      setScannedItems(items);
      setSplitState((s) => ({ ...s, mode: "itemized", items }));
      toast.success(`Scanned ${parsed.merchant}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to scan receipt");
    } finally {
      setScanning(false);
    }
  };

  const createFn = useServerFn(createExpense);
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!groupId || !payerMemberId) throw new Error("Pick a group and a payer");
      if (!description.trim()) throw new Error("Add a description");
      if (amount <= 0) throw new Error("Amount must be > 0");
      if (!splitValid) throw new Error(splitError ?? "Splits don't balance");

      const splits = members.map((m) => ({
        member_id: m.id,
        amount: Math.round((perMember[m.id] ?? 0) * 100) / 100,
        percentage:
          splitState.mode === "percentage" ? (splitState.percentages[m.id] ?? null) : null,
      }));

      return createFn({
        data: {
          group_id: groupId,
          description: description.trim(),
          category,
          amount,
          currency,
          expense_date: date,
          split_mode: splitState.mode,
          paid_by_member_id: payerMemberId,
          splits,
          items:
            splitState.mode === "itemized"
              ? splitState.items.map((it) => ({
                  name: it.name,
                  price: it.price,
                  quantity: it.quantity ?? 1,
                  assigned_member_ids: it.assignedMemberIds,
                }))
              : undefined,
          receipt_id: receiptId,
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Expense saved");
      navigate({ to: "/expenses/$id", params: { id: res.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="font-display text-3xl font-semibold tracking-tight mb-1">New expense</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Scan a receipt or enter details manually.
      </p>

      {/* Receipt scanner */}
      <div className="glass-card rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-4 text-primary" />
          <h2 className="font-semibold text-sm">AI receipt scanner</h2>
        </div>
        {!scannedItems ? (
          <label className="block cursor-pointer rounded-xl border border-dashed border-border hover:border-primary hover:bg-primary/5 transition p-6 text-center">
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              disabled={scanning}
            />
            {scanning ? (
              <div className="flex items-center justify-center gap-2 text-primary">
                <Loader2 className="size-4 animate-spin" /> Reading receipt…
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="size-6" />
                <span className="text-sm">Drop or tap to upload receipt</span>
                <span className="text-xs">JPG, PNG, or PDF</span>
              </div>
            )}
          </label>
        ) : (
          <div className="flex items-center justify-between rounded-xl bg-accent/10 border border-accent/30 text-accent px-4 py-3">
            <div className="text-sm">
              <strong>{scannedItems.length} items</strong> extracted · edit below
            </div>
            <button
              onClick={() => {
                setScannedItems(null);
                setReceiptId(null);
                setSplitState((s) => ({ ...s, items: [], mode: "equal" }));
              }}
              className="text-accent hover:text-accent-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="glass-card rounded-2xl p-5 mb-6 space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Group</label>
          <select
            value={groupId ?? ""}
            onChange={(e) => {
              setGroupId(e.target.value || null);
              setPayerMemberId(null);
            }}
            className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
          >
            <option value="">Choose a group…</option>
            {groupsQ.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {groupsQ.data && groupsQ.data.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              No groups yet.{" "}
              <Link to="/groups/new" className="text-primary hover:underline">
                Create one
              </Link>{" "}
              to add expenses.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dinner at Joe's"
            className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Amount
            </label>
            <div className="relative mt-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <input
                type="number"
                step="0.01"
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full rounded-xl bg-input border border-border pl-8 pr-3 py-2.5 outline-none focus:border-primary font-numeric"
              />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
            />
          </div>
        </div>

        {selectedGroup && (
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Paid by
            </label>
            <select
              value={payerMemberId ?? ""}
              onChange={(e) => setPayerMemberId(e.target.value)}
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
            >
              {selectedGroup.group_members?.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Split */}
      {selectedGroup && members.length > 0 && amount > 0 && (
        <div className="glass-card rounded-2xl p-5 mb-6">
          <h2 className="font-semibold text-sm mb-4">How to split</h2>
          <SplitEditor
            members={members}
            total={amount}
            currency={currency}
            value={splitState}
            onChange={setSplitState}
            onResultChange={(p, valid, err) => {
              setPerMember(p);
              setSplitValid(valid);
              setSplitError(err);
            }}
          />
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Link
          to="/dashboard"
          className="rounded-xl border border-border px-5 py-2.5 hover:bg-muted transition"
        >
          Cancel
        </Link>
        <button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending || !groupId || amount <= 0}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-2.5 font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {submitMutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Save expense
        </button>
      </div>
    </div>
  );
}
