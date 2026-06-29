import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createShareLink } from "@/lib/expenses.functions";
import { formatMoney } from "@/lib/format";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Check,
  Download,
  Hash,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Receipt as ReceiptIcon,
  RefreshCw,
  Share2,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_app/expenses/$id/share")({
  head: () => ({ meta: [{ title: "Share receipt — Splitit" }] }),
  component: ExpenseSharePage,
});

const CODE_TTL_MS = 5 * 60 * 1000; // matches server-side share-code TTL

function ExpenseSharePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qrRef = useRef<HTMLDivElement>(null);
  const generatedFor = useRef<string | null>(null);

  const [share, setShare] = useState<{
    code: string;
    token: string;
    qrUrl: string;
    expiresAt: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<"code" | "url" | null>(null);

  // Tick clock every second for the expiry countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Light read of the expense so we can show context (title, total, currency).
  const expenseQ = useQuery({
    queryKey: ["expense-share-header", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, description, amount, currency, expense_date, archived_at")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const shareFn = useServerFn(createShareLink);
  const generate = useMutation({
    mutationFn: () =>
      shareFn({ data: { resource_type: "expense", resource_id: id } }),
    onSuccess: (res) => {
      const expiresAt = res.expires_at
        ? new Date(res.expires_at).getTime()
        : Date.now() + CODE_TTL_MS;
      // The QR encodes a deep-link back to the landing page with the code
      // pre-filled — friends scan, land on '/', and just press Enter.
      const qrUrl = `${window.location.origin}/?code=${res.share_code}`;
      setShare({
        code: res.share_code,
        token: res.token,
        qrUrl,
        expiresAt,
      });
      toast.success("Share code generated");
    },
    onError: (e: any) =>
      toast.error(e?.message ?? "Could not generate share code"),
  });

  // Auto-generate exactly once per expense when the page loads.
  useEffect(() => {
    if (!expenseQ.data) return;
    if (generatedFor.current === id) return;
    generatedFor.current = id;
    generate.mutate();
  }, [expenseQ.data?.id, id, generate]);

  const expired = share ? share.expiresAt - now <= 0 : false;
  const remainingMs = share ? Math.max(0, share.expiresAt - now) : 0;
  const mm = Math.floor(remainingMs / 60_000);
  const ss = Math.floor((remainingMs % 60_000) / 1000);

  const copy = async (value: string, kind: "code" | "url") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast.success(kind === "code" ? "Code copied" : "Link copied");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually");
    }
  };

  const downloadQR = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg || !share) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
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
      a.download = `splitit-${share.code}.png`;
      a.click();
    };
    img.src = src;
  };

  const shareNative = async () => {
    if (!share) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Splitit receipt",
          text: `Open my receipt — code ${share.code}`,
          url: share.qrUrl,
        });
      } else {
        copy(share.qrUrl, "url");
      }
    } catch {
      /* user dismissed share sheet */
    }
  };

  const exp = expenseQ.data;

  return (
    <div
      className="mx-auto max-w-2xl px-4 sm:px-6 py-8"
      data-testid="expense-share-page"
    >
      <Link
        to="/expenses/$id"
        params={{ id }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        data-testid="back-to-expense-link"
      >
        <ArrowLeft className="size-4" /> Back to expense
      </Link>

      {/* Hero */}
      <div className="glass-card rounded-2xl p-6 mb-6 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 text-accent px-3 py-1 text-xs mb-3">
          <Sparkles className="size-3.5" />
          Expense saved · ready to share
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {exp?.description ?? "Receipt"}
        </h1>
        {exp && (
          <div className="font-numeric text-4xl mt-3 gradient-text">
            {formatMoney(Number(exp.amount), exp.currency)}
          </div>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          Send this code or QR to friends — they pay without an account.
        </p>
      </div>

      {/* Share block */}
      <div className="glass-card rounded-2xl p-6 mb-6">
        {generate.isPending && !share && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-sm">Generating your unique code…</span>
          </div>
        )}

        {share && (
          <>
            {/* QR */}
            <div
              ref={qrRef}
              className="flex justify-center bg-white rounded-2xl p-5 mb-5"
              data-testid="share-qr-container"
            >
              <QRCodeSVG
                value={share.qrUrl}
                size={208}
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Code */}
            <div
              className="rounded-2xl bg-muted/40 border border-border p-5 text-center mb-4"
              data-testid="share-code-block"
            >
              <div className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                <Hash className="size-3.5" /> Receipt code
              </div>
              <div
                className="font-numeric text-4xl sm:text-5xl font-semibold tracking-[0.25em] mt-2 mb-3"
                data-testid="share-code-value"
              >
                {share.code}
              </div>

              <button
                onClick={() => copy(share.code, "code")}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition"
                data-testid="copy-share-code-btn"
              >
                {copied === "code" ? (
                  <>
                    <Check className="size-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" /> Copy code
                  </>
                )}
              </button>

              <p
                className={`text-xs mt-3 ${
                  expired
                    ? "text-destructive"
                    : remainingMs < 60_000
                      ? "text-amber-400"
                      : "text-muted-foreground"
                }`}
                data-testid="share-code-timer"
              >
                {expired
                  ? "This code has expired — generate a new one."
                  : `Expires in ${mm}:${ss.toString().padStart(2, "0")}`}
              </p>
            </div>

            {/* Link row */}
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs font-mono mb-3">
              <Link2 className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1" data-testid="share-link-value">
                {share.qrUrl}
              </span>
              <button
                onClick={() => copy(share.qrUrl, "url")}
                className="shrink-0 p-1 hover:text-foreground text-muted-foreground"
                title="Copy link"
                data-testid="copy-share-link-btn"
              >
                {copied === "url" ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={downloadQR}
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
                data-testid="download-qr-btn"
              >
                <Download className="size-4" /> Download QR
              </button>
              <button
                onClick={shareNative}
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
                data-testid="share-qr-btn"
              >
                <Share2 className="size-4" /> Share
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Settle our Splitit bill: ${share.qrUrl}  (or use code ${share.code})`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
                data-testid="share-whatsapp"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
              <a
                href={`sms:?&body=${encodeURIComponent(
                  `Splitit: ${share.qrUrl} (code ${share.code})`,
                )}`}
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
                data-testid="share-sms"
              >
                <MessageCircle className="size-4" /> SMS
              </a>
              <a
                href={`mailto:?subject=Splitit%20receipt&body=${encodeURIComponent(
                  `${share.qrUrl}\n\nOr enter code ${share.code} on the Splitit homepage.`,
                )}`}
                className="rounded-xl border border-border py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition"
                data-testid="share-email"
              >
                <Mail className="size-4" /> Email
              </a>
            </div>

            {expired && (
              <button
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-2.5 font-medium hover:opacity-90 transition disabled:opacity-50"
                data-testid="regenerate-code-btn"
              >
                {generate.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Generate a new code
              </button>
            )}
          </>
        )}

        {generate.isError && !share && (
          <div className="text-center text-sm text-destructive py-6">
            Failed to generate a share code.
            <button
              onClick={() => generate.mutate()}
              className="ml-2 text-primary hover:underline"
              data-testid="retry-generate-code-btn"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Continue actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => navigate({ to: "/expenses/$id", params: { id } })}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-2.5 hover:bg-muted transition text-sm"
          data-testid="view-expense-btn"
        >
          <ReceiptIcon className="size-4" /> Open expense details
        </button>
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:opacity-90 transition text-sm"
          data-testid="done-share-btn"
        >
          Done
        </button>
      </div>
    </div>
  );
}
