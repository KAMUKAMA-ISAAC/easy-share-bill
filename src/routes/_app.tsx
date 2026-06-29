import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Users, Plus, LogOut, Loader2, Settings, Wallet } from "lucide-react";
import { initialsOf } from "@/lib/format";
import logoAsset from "@/assets/split-logo.png";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

function AppShell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Apply saved theme preference on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("splitit:prefs");
      const theme = raw ? (JSON.parse(raw).theme as string) : "system";
      const dark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    } catch {}
  }, []);

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const name =
    (user.user_metadata?.display_name as string) ||
    (user.user_metadata?.full_name as string) ||
    user.email?.split("@")[0] ||
    "You";

  const navItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
    { to: "/groups", icon: Users, label: "Groups" },
    { to: "/expenses/new", icon: Plus, label: "New", highlight: true },
    { to: "/wallet", icon: Wallet, label: "Wallet" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top header (desktop) */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src={logoAsset} alt="Splitit" className="size-9 rounded-xl" />
            <span className="font-display font-semibold text-lg hidden sm:inline">Splitit</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const active = pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    item.highlight
                      ? "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
                      : `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition ${
                          active
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`
                  }
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/settings"
              className="size-9 grid place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition"
              title="Settings"
            >
              <Settings className="size-4" />
            </Link>

            <Link
              to="/profile"
              className="size-9 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 grid place-items-center text-sm font-medium hover:opacity-90 transition"
              title="Profile"
            >
              {initialsOf(name)}
            </Link>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/" });
              }}
              className="size-9 grid place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile bottom nav - Optimized */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl bg-background/85 border-t border-border/60 safe-area-bottom">
        <div className="grid grid-cols-4 max-w-md mx-auto">
          {navItems.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition touch-manipulation ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
              {item.highlight ? (
  <div className={`size-12 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg shadow-primary/30 transition-transform active:scale-95 ${
    active ? "ring-2 ring-primary/20 ring-offset-2 ring-offset-background" : ""
  }`}>
    <Plus className="size-6" strokeWidth={3} />
  </div>
) : (
  <item.icon className="size-5" strokeWidth={2} />
)}
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
