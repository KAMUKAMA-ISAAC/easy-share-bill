import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createShareLink } from "@/lib/expenses.functions";
import { formatDate, formatMoney, initialsOf } from "@/lib/format";
import { ArrowLeft, Check, Receipt, Share2, MessageCircle, Mail, Link2, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_app/expenses/$id")({
  head: () => ({ meta: [{ title: "Expense — Splitit" }] }),
  component: ExpenseDetail,
});

function ExpenseDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const expenseQ = useQuery({
    queryKey: ["expense", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "*, splits(id, member_id, amount, paid, paid_at, percentage), expense_items(*), groups(name,color)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const memberIds = (expenseQ.data?.splits ?? []).map((s: any) => s.member_id);
  const membersQ = useQuery({
    queryKey: ["expense-members", id, memberIds.join(",")],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("group_members")
        .select("id, display_name, user_id")
        .in("id", memberIds);
      return data ?? [];
    },
  });

  const markPaid = useMutation({
    mutationFn: async (splitId: string) => {
      const { error } = await supabase
        .from("splits")
        .update({ paid: true, paid_at: new Date().toISOString() })
        .eq("id", splitId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as paid");
      qc.invalidateQueries({ queryKey: ["expense", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const shareFn = useServerFn(createShareLink);
  const handleShare = async () => {
    try {
      const { token } = await shareFn({ data: { resource_type: "expense", resource_id: id } });
      const url = `${window.location.origin}/share/${token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  };

  if (expenseQ.isLoading || !expenseQ.data) {
    return <div className="p-10 text-muted-foreground text-center">Loading…</div>;
  }
  const e = expenseQ.data as any;
  const memberById: Record<string, any> = {};
  (membersQ.data ?? []).forEach((m: any) => (memberById[m.id] = m));
  const payer = memberById[e.paid_by_member_id]?.display_name ?? "Someone";
  const paidSum = (e.splits ?? [])
    .filter((s: any) => s.paid)
    .reduce((a: number, s: any) => a + Number(s.amount), 0);
  const progress = (paidSum / Number(e.amount)) * 100;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <Link
        to={e.group_id ? "/groups/$id" : "/dashboard"}
        params={{ id: e.group_id ?? "" }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>

      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="size-12 rounded-xl bg-primary/15 text-primary grid place-items-center">
            <Receipt className="size-5" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{e.description}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {e.groups?.name ?? "Personal"} · {formatDate(e.expense_date)}
            </p>
          </div>
          <div className="text-right">
            <div className="font-numeric text-3xl">{formatMoney(Number(e.amount), e.currency)}</div>
            <div className="text-xs text-muted-foreground">paid by {payer}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Settled</span>
            <span>
              {formatMoney(paidSum, e.currency)} / {formatMoney(Number(e.amount), e.currency)}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent transition-all"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Items if itemized */}
      {e.expense_items?.length > 0 && (
        <div className="glass-card rounded-2xl p-5 mb-6">
          <h2 className="font-semibold text-sm mb-3">Items</h2>
          <div className="space-y-1.5 text-sm">
            {e.expense_items.map((it: any) => (
              <div key={it.id} className="flex justify-between py-1.5 border-b border-border last:border-0">
                <div className="flex-1">
                  <div>{it.name}</div>
                  {it.assigned_member_ids?.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {it.assigned_member_ids
                        .map((mid: string) => memberById[mid]?.display_name)
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}
                </div>
                <div className="font-numeric text-muted-foreground">
                  {formatMoney(Number(it.price) * (it.quantity ?? 1), e.currency)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Splits */}
      <div className="glass-card rounded-2xl overflow-hidden mb-6">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">Who owes what</h2>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {e.split_mode}
          </span>
        </div>
        <div className="divide-y divide-border">
          {(e.splits ?? []).map((s: any) => {
            const member = memberById[s.member_id];
            const isPayer = s.member_id === e.paid_by_member_id;
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
                  {formatMoney(Number(s.amount), e.currency)}
                </div>
                {!isPayer && (
                  <>
                    {s.paid ? (
                      <span className="text-xs inline-flex items-center gap-1 text-accent bg-accent/10 px-2 py-1 rounded-md">
                        <Check className="size-3" /> Paid
                      </span>
                    ) : (
                      <button
                        onClick={() => markPaid.mutate(s.id)}
                        className="text-xs rounded-md bg-primary text-primary-foreground px-2.5 py-1 hover:opacity-90 transition"
                      >
                        Mark paid
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Share */}
      <div className="glass-card rounded-2xl p-5">
        <h2 className="font-semibold text-sm mb-3">Share with friends</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Generate a secure link. Friends can view and mark paid — no account needed.
        </p>
        {!shareUrl ? (
          <button
            onClick={handleShare}
            className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 font-medium hover:opacity-90 transition inline-flex items-center justify-center gap-2"
          >
            <Share2 className="size-4" /> Generate share link
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center bg-white rounded-xl p-4">
              <QRCodeSVG value={shareUrl} size={180} level="M" includeMargin={false} />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Scan with a phone camera to open the share link
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs font-mono">
              <Link2 className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{shareUrl}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  toast.success("Link copied");
                }}
                className="shrink-0 p-1 hover:text-foreground text-muted-foreground"
                title="Copy"
              >
                <Copy className="size-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Splitit: settle up at ${shareUrl}`)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
              <a
                href={`sms:?&body=${encodeURIComponent(`Settle up: ${shareUrl}`)}`}
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
              >
                <MessageCircle className="size-4" /> SMS
              </a>
              <a
                href={`mailto:?subject=Splitit&body=${encodeURIComponent(shareUrl)}`}
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
              >
                <Mail className="size-4" /> Email
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
