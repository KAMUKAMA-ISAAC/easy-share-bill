import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { ArrowLeft, Loader2, Smartphone, Landmark, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Payment settings — Splitit" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [momoProvider, setMomoProvider] = useState<string>("");
  const [momoNumber, setMomoNumber] = useState("");
  const [momoName, setMomoName] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");

  const profileQ = useQuery({
    queryKey: ["my-profile"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select(
          "momo_provider, momo_number, momo_name, bank_name, bank_account_number, bank_account_name",
        )
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!profileQ.data) return;
    setMomoProvider(profileQ.data.momo_provider ?? "");
    setMomoNumber(profileQ.data.momo_number ?? "");
    setMomoName(profileQ.data.momo_name ?? "");
    setBankName(profileQ.data.bank_name ?? "");
    setBankAccountNumber(profileQ.data.bank_account_number ?? "");
    setBankAccountName(profileQ.data.bank_account_name ?? "");
  }, [profileQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({
          momo_provider: momoProvider || null,
          momo_number: momoNumber || null,
          momo_name: momoName || null,
          bank_name: bankName || null,
          bank_account_number: bankAccountNumber || null,
          bank_account_name: bankAccountName || null,
        })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Payment details saved"),
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <button
        onClick={() => navigate({ to: "/dashboard" })}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      <h1 className="font-display text-3xl font-semibold tracking-tight mb-1">
        Payment details
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Shown to guests on your shared bills so they know how to pay you back.
        Optional — leave any field blank if you don't use it.
      </p>

      <div className="glass-card rounded-2xl p-5 mb-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Smartphone className="size-4 text-primary" />
          <h2 className="font-semibold text-sm">Mobile money</h2>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Provider
          </label>
          <select
            value={momoProvider}
            onChange={(e) => setMomoProvider(e.target.value)}
            className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
          >
            <option value="">Choose provider…</option>
            <option value="mtn_momo">MTN Mobile Money</option>
            <option value="airtel_money">Airtel Money</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Phone number
            </label>
            <input
              value={momoNumber}
              onChange={(e) => setMomoNumber(e.target.value)}
              placeholder="07XXXXXXXX"
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary font-numeric"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Registered name
            </label>
            <input
              value={momoName}
              onChange={(e) => setMomoName(e.target.value)}
              placeholder="Jane Doe"
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 mb-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Landmark className="size-4 text-primary" />
          <h2 className="font-semibold text-sm">Bank transfer</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Bank
            </label>
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Stanbic, Equity…"
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Account number
            </label>
            <input
              value={bankAccountNumber}
              onChange={(e) => setBankAccountNumber(e.target.value)}
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary font-numeric"
            />
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Account name
          </label>
          <input
            value={bankAccountName}
            onChange={(e) => setBankAccountName(e.target.value)}
            className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-2.5 font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save details
        </button>
      </div>

      <p className="text-xs text-muted-foreground mt-6">
        Mock checkout is enabled — guest payments are recorded but no real money
        moves. Connect a payment processor later to take real payments.
      </p>
      <Link to="/dashboard" className="hidden">noop</Link>
    </div>
  );
}
