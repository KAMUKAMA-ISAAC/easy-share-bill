import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createShareLink, archiveExpense, restoreExpense } from "@/lib/expenses.functions";
import { formatDate, formatMoney, initialsOf } from "@/lib/format";
import {
  ArrowLeft, Check, Receipt, Share2, MessageCircle, Mail, Link2, Copy,
  Hash, Download, Archive, ArchiveRestore, Wallet, Banknote,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useState, useRef } from "react";

export const Route = createFileRoute("/_app/expenses/$id")({
  head: () => ({ meta: [{ title: "Expense — Splitit" }] }),
  component: ExpenseDetail,
});

function ExpenseDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [share, setShare] = useState<{ url: string; code: string } | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

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
      const { token, share_code } = await shareFn({
        data: { resource_type: "expense", resource_id: id },
      });
      const url = `${window.location.origin}/?code=${share_code}`;
      setShare({ url, code: share_code });
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      } catch {}
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  };

  const downloadQR = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const blobUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 600;
      c.height = 600;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, 600, 600);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `splitit-receipt-${share?.code ?? "share"}.png`;
      a.click();
    };
    img.src = blobUrl;
  };

  const shareQR = async () => {
    if (!share) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Splitit receipt",
          text: `Open my receipt — code ${share.code}`,
          url: share.url,
        });
      } else {
        await navigator.clipboard.writeText(share.url);
        toast.success("Link copied");
      }
    } catch {}
  };

  const archiveFn = useServerFn(archiveExpense);
  const restoreFn = useServerFn(restoreExpense);
  const archive = useMutation({
    mutationFn: () => archiveFn({ data: { expense_id: id } }),
    onSuccess: () => {
      toast.success("Expense archived");
      navigate({ to: "/dashboard" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const restore = useMutation({
    mutationFn: () => restoreFn({ data: { expense_id: id } }),
    onSuccess: () => {
      toast.success("Expense restored");
      qc.invalidateQueries({ queryKey: ["expense", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

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
  const isArchived = !!e.archived_at;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <Link
        to={e.group_id ? "/groups/$id" : "/dashboard"}
        params={{ id: e.group_id ?? "" }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>

      {isArchived && (
        <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3 text-sm flex items-center gap-3">
          <Archive className="size-4 text-muted-foreground" />
          <span className="flex-1">This expense is archived.</span>
          <button
            onClick={() => restore.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90"
          >
            <ArchiveRestore className="size-3.5" /> Restore
          </button>
        </div>
      )}

      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="size-12 rounded-xl bg-primary/15 text-primary grid place-items-center">
            <Receipt className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight break-words">{e.description}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {e.groups?.name ?? "Personal"} · {formatDate(e.expense_date)}
            </p>
            <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5">
              {e.payout_destination === "wallet" ? <Wallet className="size-3" /> : <Banknote className="size-3" />}
              Payouts → {e.payout_destination === "wallet" ? "your Splitit wallet" : "your Mobile Money / bank directly"}
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

      <div className="glass-card rounded-2xl p-5">
        <h2 className="font-semibold text-sm mb-3">Share with friends</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Send a link, share a code, or let them scan the QR. No account needed on their end.
        </p>
        {!share ? (
          <button
            onClick={handleShare}
            className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 font-medium hover:opacity-90 transition inline-flex items-center justify-center gap-2"
          >
            <Share2 className="size-4" /> Generate share link & code
          </button>
        ) : (
          <div className="space-y-4">
            <div ref={qrRef} className="flex justify-center bg-white rounded-xl p-4">
              <QRCodeSVG value={share.url} size={180} level="M" includeMargin={false} />
            </div>

            <div className="rounded-xl bg-muted/40 border border-border p-4 text-center">
              <div className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                <Hash className="size-3" /> Share code
              </div>
              <div className="font-numeric text-3xl sm:text-4xl font-semibold tracking-[0.25em] mt-1.5">
                {share.code}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Friends enter this on the Splitit homepage. Expires in 5 minutes.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs font-mono">
              <Link2 className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{share.url}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(share.url);
                  toast.success("Link copied");
                }}
                className="shrink-0 p-1 hover:text-foreground text-muted-foreground"
                title="Copy"
              >
                <Copy className="size-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={downloadQR}
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
              >
                <Download className="size-4" /> Download QR
              </button>
              <button
                onClick={shareQR}
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
              >
                <Share2 className="size-4" /> Share QR
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Splitit: settle up at ${share.url} (code ${share.code})`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
              <a
                href={`sms:?&body=${encodeURIComponent(`Settle up: ${share.url} (code ${share.code})`)}`}
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
              >
                <MessageCircle className="size-4" /> SMS
              </a>
              <a
                href={`mailto:?subject=Splitit&body=${encodeURIComponent(
                  `${share.url}\n\nOr enter code ${share.code} on the Splitit homepage.`,
                )}`}
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
              >
                <Mail className="size-4" /> Email
              </a>
            </div>
          </div>
        )}
      </div>

      {!isArchived && (
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              if (confirm("Archive this expense? You can restore it from the archive.")) {
                archive.mutate();
              }
            }}
            className="text-sm text-muted-foreground hover:text-destructive inline-flex items-center gap-1.5"
          >
            <Archive className="size-4" /> Archive expense
          </button>
        </div>
      )}
    </div>
  );
}
