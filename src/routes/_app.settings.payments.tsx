import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  getVaultStatus,
  initVault,
  unlockVault,
  lockVault,
  getSessionPassword,
  type VaultStatus,
} from "@/lib/payment-vault";
import {
  listMethods,
  createMethod,
  deleteMethod,
  setDefault,
  kindLabel,
  type PaymentMethod,
  type PaymentMethodKind,
} from "@/lib/payment-methods";
import { toast } from "sonner";
import {
  ArrowLeft,
  Shield,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Star,
  Smartphone,
  Landmark,
  Eye,
  EyeOff,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_app/settings/payments")({
  head: () => ({ meta: [{ title: "Payment details — Splitit" }] }),
  component: PaymentsVault,
});

function PaymentsVault() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const s = await getVaultStatus(user.id);
      setStatus(s);
      if (s.state === "unlocked") {
        const m = await listMethods(user.id);
        setMethods(m);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) refresh();
  }, [user?.id]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-2">
        <Link to="/settings" className="p-2 hover:bg-muted rounded-xl transition">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="size-6 text-primary" />
          Payment vault
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6 ml-12">
        Your payout numbers are encrypted on your device before they're saved. Even Splitit's database
        can't read them.
      </p>

      {!status ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Loader2 className="size-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : status.state === "uninitialized" ? (
        <SetupCard userId={user.id} onDone={refresh} />
      ) : status.state === "locked" ? (
        <UnlockCard check={status.check} onUnlocked={refresh} />
      ) : (
        <VaultBody
          userId={user.id}
          password={status.password}
          methods={methods}
          refreshing={refreshing}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

// =============================================================================
// First-time setup
// =============================================================================
function SetupCard({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw !== pw2) return toast.error("Passwords don't match");
    setBusy(true);
    try {
      await initVault(userId, pw);
      toast.success("Vault created. Don't lose this password — it can't be recovered.");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-xl bg-primary/15 grid place-items-center shrink-0">
          <KeyRound className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold">Create your vault password</h2>
          <p className="text-sm text-muted-foreground mt-1">
            This password encrypts your MoMo and bank details on your device. We never see it. If you
            forget it, you'll need to re-enter your payout numbers.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Vault password
          </label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 pr-10 outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 p-1.5 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Confirm password
          </label>
          <input
            type={show ? "text" : "password"}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="Type it again"
            autoComplete="new-password"
            className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-200/90 flex gap-2">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
        <span>
          Write this down somewhere safe. The password is <strong>not stored anywhere</strong> — if
          you forget it, your encrypted details become unrecoverable.
        </span>
      </div>

      <button
        onClick={submit}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-3 font-medium hover:opacity-90 transition disabled:opacity-50"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Create vault
      </button>
    </div>
  );
}

// =============================================================================
// Unlock screen
// =============================================================================
function UnlockCard({
  check,
  onUnlocked,
}: {
  check: { ciphertext: string; iv: string; salt: string };
  onUnlocked: () => void;
}) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pw) return;
    setBusy(true);
    try {
      const ok = await unlockVault(check, pw);
      if (!ok) {
        toast.error("Wrong password");
        return;
      }
      toast.success("Vault unlocked");
      onUnlocked();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-xl bg-primary/15 grid place-items-center shrink-0">
          <Lock className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold">Unlock your vault</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your vault password to view or change your payout details.
          </p>
        </div>
      </div>

      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Vault password
        </label>
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoComplete="current-password"
            autoFocus
            className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 pr-10 outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 p-1.5 text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={busy || !pw}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-3 font-medium hover:opacity-90 transition disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Unlock className="size-4" />}
        Unlock
      </button>
    </div>
  );
}

// =============================================================================
// Unlocked vault — list + add + manage
// =============================================================================
function VaultBody({
  userId,
  password,
  methods,
  refreshing,
  onChanged,
}: {
  userId: string;
  password: string;
  methods: PaymentMethod[];
  refreshing: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState<PaymentMethodKind | null>(null);

  const momoMethods = methods.filter((m) => m.kind === "mtn_momo" || m.kind === "airtel_money");
  const bankMethods = methods.filter((m) => m.kind === "bank");

  return (
    <div className="space-y-6">
      {/* Vault status header */}
      <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-accent/15 grid place-items-center">
            <Unlock className="size-5 text-accent" />
          </div>
          <div>
            <div className="text-sm font-medium flex items-center gap-1.5">
              Vault unlocked <CheckCircle2 className="size-4 text-accent" />
            </div>
            <div className="text-xs text-muted-foreground">
              Locks automatically when you close this tab
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            lockVault();
            onChanged();
          }}
          className="text-sm inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 hover:bg-muted/50 transition"
        >
          <Lock className="size-3.5" /> Lock
        </button>
      </div>

      {/* Mobile Money */}
      <Section
        title="Mobile Money"
        subtitle="MTN MoMo & Airtel Money numbers"
        icon={<Smartphone className="size-4" />}
      >
        {momoMethods.length === 0 && adding !== "mtn_momo" && adding !== "airtel_money" && (
          <div className="text-sm text-muted-foreground italic px-4 py-3">
            No mobile money numbers yet.
          </div>
        )}
        {momoMethods.map((m) => (
          <MethodRow key={m.id} m={m} userId={userId} onChanged={onChanged} />
        ))}
        {adding === "mtn_momo" || adding === "airtel_money" ? (
          <AddForm
            initialKind={adding}
            userId={userId}
            password={password}
            onCancel={() => setAdding(null)}
            onDone={() => {
              setAdding(null);
              onChanged();
            }}
          />
        ) : (
          <div className="flex gap-2 px-4 py-3 border-t border-border">
            <button
              onClick={() => setAdding("mtn_momo")}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-yellow-500/15 text-yellow-200 hover:bg-yellow-500/25 transition px-3 py-2 text-sm font-medium"
            >
              <Plus className="size-3.5" /> Add MTN number
            </button>
            <button
              onClick={() => setAdding("airtel_money")}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-500/15 text-red-200 hover:bg-red-500/25 transition px-3 py-2 text-sm font-medium"
            >
              <Plus className="size-3.5" /> Add Airtel number
            </button>
          </div>
        )}
      </Section>

      {/* Bank */}
      <Section
        title="Bank accounts"
        subtitle="For card payments and direct transfers"
        icon={<Landmark className="size-4" />}
      >
        {bankMethods.length === 0 && adding !== "bank" && (
          <div className="text-sm text-muted-foreground italic px-4 py-3">No bank accounts yet.</div>
        )}
        {bankMethods.map((m) => (
          <MethodRow key={m.id} m={m} userId={userId} onChanged={onChanged} />
        ))}
        {adding === "bank" ? (
          <AddForm
            initialKind="bank"
            userId={userId}
            password={password}
            onCancel={() => setAdding(null)}
            onDone={() => {
              setAdding(null);
              onChanged();
            }}
          />
        ) : (
          <div className="px-4 py-3 border-t border-border">
            <button
              onClick={() => setAdding("bank")}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary/15 text-primary hover:bg-primary/25 transition px-3 py-2 text-sm font-medium"
            >
              <Plus className="size-3.5" /> Add bank account
            </button>
          </div>
        )}
      </Section>

      <div className="text-xs text-muted-foreground text-center">
        🔒 Encrypted with AES-256-GCM · key derived via PBKDF2 (250k rounds)
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2 font-semibold">
          {icon}
          {title}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function MethodRow({
  m,
  userId,
  onChanged,
}: {
  m: PaymentMethod;
  userId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const onDelete = async () => {
    if (!confirm(`Remove "${m.label}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteMethod(m.id);
      toast.success("Removed");
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const onSetDefault = async () => {
    setBusy(true);
    try {
      await setDefault(m.id, userId, m.kind);
      toast.success("Set as default");
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const Icon = m.kind === "bank" ? Landmark : Smartphone;
  return (
    <div className="flex items-center gap-3 p-4">
      <div
        className={`size-10 rounded-xl grid place-items-center text-white ${
          m.kind === "mtn_momo"
            ? "bg-yellow-500"
            : m.kind === "airtel_money"
              ? "bg-red-500"
              : "bg-primary"
        }`}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {m.label}
          {m.is_default && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-accent/15 text-accent px-1.5 py-0.5 rounded">
              <Star className="size-2.5" /> Default
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground font-numeric">
          {m.bank_name ? `${m.bank_name} · ` : ""}
          {m.display_hint}
          {m.account_name ? ` · ${m.account_name}` : ""}
        </div>
      </div>
      {!m.is_default && (
        <button
          onClick={onSetDefault}
          disabled={busy}
          title="Set as default"
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-accent transition"
        >
          <Star className="size-4" />
        </button>
      )}
      <button
        onClick={onDelete}
        disabled={busy}
        title="Remove"
        className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function AddForm({
  initialKind,
  userId,
  password,
  onCancel,
  onDone,
}: {
  initialKind: PaymentMethodKind;
  userId: string;
  password: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<PaymentMethodKind>(initialKind);
  const [label, setLabel] = useState("");
  const [number, setNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim()) return toast.error("Give it a label");
    if (!number.trim() || number.replace(/\s/g, "").length < 4)
      return toast.error("Enter a valid number");
    if (kind === "bank" && !bankName.trim()) return toast.error("Bank name is required");
    setBusy(true);
    try {
      await createMethod(userId, password, {
        kind,
        label,
        full_number: number,
        account_name: accountName,
        bank_name: kind === "bank" ? bankName : undefined,
        is_default: isDefault,
      });
      toast.success("Saved & encrypted");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 border-t border-border bg-muted/20 space-y-3">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Plus className="size-4" /> Add {kindLabel(kind)}
      </div>

      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Label</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={kind === "bank" ? "Stanbic salary" : "My main MTN"}
          className="mt-1 w-full rounded-xl bg-input border border-border px-3 py-2 outline-none focus:border-primary text-sm"
        />
      </div>

      {kind === "bank" && (
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Bank name</label>
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Stanbic / Equity / Centenary / DFCU / Absa…"
            className="mt-1 w-full rounded-xl bg-input border border-border px-3 py-2 outline-none focus:border-primary text-sm"
          />
        </div>
      )}

      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          {kind === "bank" ? "Account number" : "Phone number"}
        </label>
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder={kind === "bank" ? "9030001234567" : "0772 123 456"}
          inputMode="numeric"
          className="mt-1 w-full rounded-xl bg-input border border-border px-3 py-2 outline-none focus:border-primary text-sm font-numeric"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Encrypted on your device. Only the last 4 digits will be visible to payers.
        </p>
      </div>

      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Account holder name (optional)
        </label>
        <input
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="As shown on the account"
          className="mt-1 w-full rounded-xl bg-input border border-border px-3 py-2 outline-none focus:border-primary text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="size-4 accent-primary"
        />
        <span>Use this as my default for {kindLabel(kind)} receipts</span>
      </label>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted transition"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Encrypt & save
        </button>
      </div>
    </div>
  );
}
