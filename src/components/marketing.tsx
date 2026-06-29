import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getExpenseByCode } from "@/lib/receipt-codes.functions";
import { formatMoney } from "@/lib/format";
import {
  ScanLine,
  SplitSquareHorizontal,
  Smartphone,
  Shield,
  Loader2,
  ArrowRight,
} from "lucide-react";
import logoAsset from "@/assets/split-logo.png";

export const SplititLogo = ({ className = "size-8" }: { className?: string }) => (
  <img src={logoAsset.url} alt="Splitit" className={className} />
);

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <SplititLogo className="size-9 rounded-xl" />
          <div className="hidden sm:block leading-tight">
            <div className="font-display font-semibold text-lg">Splitit</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Scan · Split · Settle
            </div>
          </div>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            to="/auth"
            className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90 transition"
          >
            Get started
            <ArrowRight className="size-3.5" />
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function StatChip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-numeric text-2xl">{children}</div>
    </div>
  );
}

type Feature = { title: string; description: string; icon: React.ComponentType<any> };

export const FEATURES: Feature[] = [
  {
    title: "Scan with AI",
    description: "Snap the receipt — itemised totals, taxes and tips are parsed in seconds.",
    icon: ScanLine,
  },
  {
    title: "Flexible splits",
    description: "Equal, percentage, or item-by-item. Change the mode anytime.",
    icon: SplitSquareHorizontal,
  },
  {
    title: "MoMo & bank",
    description: "Friends settle with MTN, Airtel or bank transfer — no app, no signup.",
    icon: Smartphone,
  },
  {
    title: "Private by default",
    description: "Receipts are private. Sharing needs your 6-character code or QR.",
    icon: Shield,
  },
];

export function FeatureCard({ title, description, icon: Icon }: Feature) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center mb-3">
        <Icon className="size-5" />
      </div>
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
    </div>
  );
}

/**
 * Landing-page receipt lookup. Enter a 6-char code, auto-uppercase,
 * jump straight into /share/$token. No intermediate join page.
 */
export function CodeLookup() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
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
      } else {
        navigate({ to: "/share/$token", params: { token: result.token } });
      }
    } catch (err: any) {
      setError(err?.message ?? "Code not found or expired");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 -mt-10 relative z-10">
      <div className="glass-card rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="text-center mb-5">
          <div className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-2">
            Got a code?
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Access a shared receipt
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Enter the 6-character code from your friend — no account needed.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              const v = e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 6);
              setCode(v);
              if (error) setError("");
            }}
            placeholder="ABC123"
            maxLength={6}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 rounded-xl border border-border bg-input px-4 py-3 text-center font-numeric text-2xl tracking-[0.4em] uppercase focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="rounded-xl bg-primary text-primary-foreground px-6 py-3 font-medium hover:opacity-90 transition disabled:opacity-50 inline-flex items-center justify-center min-w-[140px]"
          >
            {loading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                Open receipt
                <ArrowRight className="size-4 ml-1.5" />
              </>
            )}
          </button>
        </form>

        {error && <p className="text-destructive text-sm text-center mt-4">{error}</p>}

        <p className="text-xs text-muted-foreground text-center mt-4">
          Codes expire 5 minutes after they're generated.
        </p>
      </div>
    </section>
  );
}

/** Back-compat alias for any old imports. */
export const MarketingPage = CodeLookup;
