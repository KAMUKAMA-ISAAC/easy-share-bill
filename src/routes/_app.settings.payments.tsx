// src/routes/_app.settings.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, User, CreditCard, Bell, Moon, LogOut, ArrowRight, Smartphone, Landmark } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Splitit" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/dashboard" className="p-2 hover:bg-muted rounded-xl transition">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        App preferences and account.
      </p>

      {/* Settings Sections */}
      <div className="space-y-4">
        {/* Appearance Section */}
        <div className="glass-card rounded-2xl p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Appearance
          </h2>
          <div className="space-y-2">
            <button className="w-full flex items-center justify-between py-2 px-3 rounded-xl hover:bg-muted/50 transition">
              <span>Light</span>
              <span className="text-muted-foreground text-sm">🌞</span>
            </button>
            <button className="w-full flex items-center justify-between py-2 px-3 rounded-xl hover:bg-muted/50 transition">
              <span>Dark</span>
              <span className="text-muted-foreground text-sm">🌙</span>
            </button>
            <button className="w-full flex items-center justify-between py-2 px-3 rounded-xl hover:bg-muted/50 transition">
              <span>System</span>
              <span className="text-muted-foreground text-sm">💻</span>
            </button>
          </div>
        </div>

        {/* Defaults Section */}
        <div className="glass-card rounded-2xl p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Defaults
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-muted/50 transition">
              <div>
                <div className="text-sm font-medium">Default Currency</div>
                <div className="text-xs text-muted-foreground">Ugandan Shilling (UGX)</div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-muted/50 transition">
              <div>
                <div className="text-sm font-medium">Language</div>
                <div className="text-xs text-muted-foreground">English</div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Account Section */}
        <div className="glass-card rounded-2xl p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Account
          </h2>
          <div className="space-y-1">
            <Link
              to="/profile"
              className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-muted/50 transition"
            >
              <div>
                <div className="font-medium">Profile</div>
                <div className="text-xs text-muted-foreground">Name, photo, contact</div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>

            {/* ✅ Payment Details Link - FIXED */}
            <Link
              to="/settings/payments"
              className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-muted/50 transition"
            >
              <div>
                <div className="font-medium">Payment details</div>
                <div className="text-xs text-muted-foreground">Mobile money &amp; bank info shown to guests</div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>

            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-between py-3 px-3 rounded-xl hover:bg-muted/50 transition text-destructive"
            >
              <div>
                <div className="font-medium">Sign out</div>
                <div className="text-xs text-muted-foreground">
                  Signed in as {user?.email}
                </div>
              </div>
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
