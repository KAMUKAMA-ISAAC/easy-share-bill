import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import {
  ArrowLeft,
  Bell,
  Globe,
  Sun,
  Moon,
  Monitor,
  Wallet,
  User as UserIcon,
  LogOut,
  ChevronRight,
  Coins,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Splitit" }] }),
  component: SettingsPage,
});

const PREFS_KEY = "splitit:prefs";

type Prefs = {
  theme: "light" | "dark" | "system";
  defaultCurrency: string;
  language: string;
  notifyEmail: boolean;
  notifyPush: boolean;
};

const DEFAULTS: Prefs = {
  theme: "system",
  defaultCurrency: "UGX",
  language: "en",
  notifyEmail: true,
  notifyPush: true,
};

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

function applyTheme(theme: Prefs["theme"]) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    if (patch.theme) applyTheme(patch.theme);
    toast.success("Saved");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <button
        onClick={() => navigate({ to: "/dashboard" })}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      <h1 className="font-display text-3xl font-semibold tracking-tight mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">
        App preferences and account.
      </p>

      {/* Appearance */}
      <Section title="Appearance" icon={<Sun className="size-4 text-primary" />}>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { v: "light", label: "Light", Icon: Sun },
              { v: "dark", label: "Dark", Icon: Moon },
              { v: "system", label: "System", Icon: Monitor },
            ] as const
          ).map(({ v, label, Icon }) => (
            <button
              key={v}
              onClick={() => update({ theme: v })}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm transition ${
                prefs.theme === v
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Defaults */}
      <Section title="Defaults" icon={<Coins className="size-4 text-primary" />}>
        <Field label="Default currency">
          <select
            value={prefs.defaultCurrency}
            onChange={(e) => update({ defaultCurrency: e.target.value })}
            className="w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
          >
            <option value="UGX">Ugandan Shilling (UGX)</option>
            <option value="USD">US Dollar (USD)</option>
            <option value="EUR">Euro (EUR)</option>
            <option value="GBP">British Pound (GBP)</option>
            <option value="KES">Kenyan Shilling (KES)</option>
            <option value="TZS">Tanzanian Shilling (TZS)</option>
          </select>
        </Field>
        <Field label="Language" icon={<Globe className="size-3" />}>
          <select
            value={prefs.language}
            onChange={(e) => update({ language: e.target.value })}
            className="w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
          >
            <option value="en">English</option>
            <option value="sw">Kiswahili</option>
            <option value="lg">Luganda</option>
          </select>
        </Field>
      </Section>

      {/* Notifications */}
      <Section title="Notifications" icon={<Bell className="size-4 text-primary" />}>
        <Toggle
          label="Email notifications"
          description="Receipts, reminders, and settlement updates"
          checked={prefs.notifyEmail}
          onChange={(v) => update({ notifyEmail: v })}
        />
        <Toggle
          label="Push notifications"
          description="When a friend pays or claims an item"
          checked={prefs.notifyPush}
          onChange={(v) => update({ notifyPush: v })}
        />
      </Section>

      {/* Account */}
      <Section title="Account" icon={<UserIcon className="size-4 text-primary" />}>
        <LinkRow
          to="/profile"
          icon={<UserIcon className="size-4" />}
          title="Profile"
          subtitle="Name, photo, contact"
        />
        <LinkRow
          to="/settings/payments"
          icon={<Wallet className="size-4" />}
          title="Payment details"
          subtitle="Mobile money & bank info shown to guests"
        />
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/" });
          }}
          className="w-full flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-muted/60 transition text-destructive"
        >
          <LogOut className="size-4" />
          <span className="text-sm font-medium">Sign out</span>
        </button>
        <p className="text-xs text-muted-foreground px-3 pt-1">
          Signed in as {user?.email}
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5 mb-1">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-3 hover:bg-muted/60 transition text-left"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function LinkRow({
  to,
  icon,
  title,
  subtitle,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-muted/60 transition"
    >
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}
