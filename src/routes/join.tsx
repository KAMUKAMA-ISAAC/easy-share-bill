import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { resolveShareCode } from "@/lib/shared-links.functions";
import { toast } from "sonner";
import { Hash, Loader2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Join a receipt · Splitit" },
      { name: "description", content: "Enter a 4-digit code to view and pay a shared receipt." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: JoinByCode,
});

function JoinByCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const resolveFn = useServerFn(resolveShareCode);

  const m = useMutation({
    mutationFn: () => resolveFn({ data: { code } }),
    onSuccess: ({ token }) => navigate({ to: "/share/$token", params: { token } }),
    onError: (e: any) => toast.error(e.message ?? "Invalid code"),
  });

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 mb-8 justify-center">
          <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center font-display font-bold text-primary-foreground">
            S
          </div>
          <span className="font-display font-semibold text-xl">Splitit</span>
        </Link>

        <div className="glass-card rounded-2xl p-6">
          <div className="size-12 rounded-xl bg-primary/15 text-primary grid place-items-center mb-4">
            <Hash className="size-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold">Join a receipt</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter the 4-digit code from the receipt organiser.
          </p>

          <input
            inputMode="numeric"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            placeholder="0000"
            className="mt-5 w-full text-center font-numeric text-4xl tracking-[0.5em] rounded-xl bg-input border border-border px-4 py-4 outline-none focus:border-primary"
            autoFocus
          />

          <button
            onClick={() => m.mutate()}
            disabled={code.length !== 4 || m.isPending}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {m.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            Open receipt
          </button>

          <p className="mt-4 text-xs text-muted-foreground text-center">
            No account needed — you'll see exactly what you owe.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Have a link instead? Just open it directly.
        </p>
      </div>
    </div>
  );
}
