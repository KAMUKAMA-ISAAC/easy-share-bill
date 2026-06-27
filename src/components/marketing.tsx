import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";
import { Receipt, Users, Sparkles, Share2 } from "lucide-react";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/60 border-b border-border/60">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="size-8 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center font-display font-bold text-primary-foreground">
            S
          </div>
          <span className="font-display font-semibold text-lg tracking-tight">Splitit</span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            to="/auth"
            className="text-sm text-muted-foreground hover:text-foreground transition"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="rounded-xl bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 transition"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function FeatureCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Receipt;
  title: string;
  desc: string;
}) {
  return (
    <div className="glass-card rounded-2xl p-6 hover:border-border-strong transition group">
      <div className="size-11 rounded-xl bg-primary/15 text-primary grid place-items-center mb-4 group-hover:scale-110 transition">
        <Icon className="size-5" />
      </div>
      <h3 className="font-display font-semibold text-base mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

export function StatChip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
      <div className="font-numeric text-3xl">{children}</div>
    </div>
  );
}

export const FEATURES = [
  {
    icon: Sparkles,
    title: "AI receipt scanning",
    desc: "Snap a photo — items and prices are extracted in seconds. Edit anything before saving.",
  },
  {
    icon: Receipt,
    title: "Flexible splits in UGX",
    desc: "Equal, percentage, custom, or item-by-item — every total stays in Ugandan Shillings.",
  },
  {
    icon: Share2,
    title: "MoMo & bank links",
    desc: "Share a secure link via WhatsApp. Friends pay on MTN MoMo, Airtel Money, or bank — no account.",
  },
  {
    icon: Users,
    title: "Groups for everything",
    desc: "Trips, hostels, boda crews, office lunches — keep balances tidy across all your circles.",
  },
];
