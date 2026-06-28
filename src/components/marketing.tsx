import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getExpenseByCode } from "@/lib/receipt-codes.functions";
import { formatMoney } from "@/lib/format";
import { Loader2 } from "lucide-react";

export function MarketingPage() {
  const [code, setCode] = useState("");
  const [expense, setExpense] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const getFn = useServerFn(getExpenseByCode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    
    setLoading(true);
    setError("");
    setExpense(null);
    
    try {
      const result = await getFn({ data: { code: code.toUpperCase() } });
      if (result) {
        setExpense(result);
      } else {
        setError("Code not found or expired");
      }
    } catch (err: any) {
      setError(err.message || "Code not found or expired");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative px-4 py-20 lg:py-32 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-white/80 text-sm mb-6">
            <span className="size-2 rounded-full bg-accent animate-pulse" />
            Split bills with friends
          </div>
          
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white">
            Money should be the
            <br />
            <span className="gradient-text">least dramatic</span> part of the day.
          </h1>
          
          <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto">
            Scan, split, share. Friends settle with Mobile Money or bank — no signup, no friction.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-primary px-6 py-3 font-medium hover:opacity-90 transition"
            >
              Get Started
            </Link>
            <span className="text-white/40 text-sm">or</span>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 text-white px-6 py-3 font-medium hover:bg-white/10 transition"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Receipt Lookup Section */}
      <section className="max-w-4xl mx-auto px-4 py-12 -mt-8">
        <div className="rounded-2xl bg-card border border-border p-6 shadow-lg">
          <h2 className="text-xl font-semibold text-center mb-2">View a shared receipt</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Enter the 6-digit code from your friend to view their receipt
          </p>
          
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="text"
              value={code}
              onChange={(e) => {
                const val = e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '');
                setCode(val.slice(0, 6));
              }}
              placeholder="e.g. AB7X92"
              maxLength={6}
              className="flex-1 rounded-xl border border-border px-4 py-3 text-center text-2xl font-mono uppercase bg-input focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="rounded-xl bg-primary text-primary-foreground px-6 py-3 font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center min-w-[120px]"
            >
              {loading ? <Loader2 className="size-5 animate-spin" /> : "View Receipt"}
            </button>
          </form>

          {error && (
            <p className="text-destructive text-sm text-center mt-4">{error}</p>
          )}

          {expense && (
            <div className="mt-6 p-6 rounded-xl border border-border bg-muted/30">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">{expense.description}</h3>
                  <p className="text-sm text-muted-foreground">
                    {expense.merchant || "Receipt"} • {new Date(expense.expense_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-2xl font-bold font-numeric">
                  {formatMoney(expense.total, expense.currency || "UGX")}
                </div>
              </div>
              
              {expense.items && expense.items.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-border pt-4">
                  {expense.items.map((item: any) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>{item.name} {item.quantity > 1 && `×${item.quantity}`}</span>
                      <span className="font-numeric">{formatMoney(item.price * (item.quantity || 1), expense.currency || "UGX")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
