import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Splitit" }] }),
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/dashboard" });
  }, [user, authLoading, navigate]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: "https://easy-split-ten.vercel.app/dashboard",
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created — welcome!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      }
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIXED: Hardcoded Vercel URL for Google redirect
  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: "https://easy-split-ten.vercel.app/auth/callback",
        },
      });
      
      if (error) {
        console.error('Google sign-in error:', error);
        toast.error(error.message || "Google sign-in failed");
        setLoading(false);
        return;
      }
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      toast.error(err.message || "Google sign-in failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: brand panel */}
      <div className="hidden lg:flex relative p-12 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <Link to="/" className="relative flex items-center gap-2 z-10">
          <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center font-display font-bold text-primary-foreground">
            S
          </div>
          <span className="font-display font-semibold text-xl">Splitit</span>
        </Link>
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-4xl font-semibold tracking-tight leading-tight mb-4">
            Money should be the
            <br />
            <span className="gradient-text">least dramatic</span> part of the day.
          </h2>
          <p className="text-muted-foreground">
            Scan, split, share. Friends settle with Mobile Money or bank — no signup, no friction.
          </p>
        </div>
        <div className="relative z-10 text-xs text-muted-foreground">
          Built in Uganda · MTN, Airtel & bank-friendly.
        </div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="size-8 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center font-display font-bold text-primary-foreground">
                S
              </div>
              <span className="font-display font-semibold text-lg">Splitit</span>
            </Link>
          </div>

          <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            {mode === "signup"
              ? "Start splitting in less than a minute."
              : "Sign in to keep splitting."}
          </p>

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full rounded-xl border border-border bg-card hover:bg-muted transition py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <GoogleIcon /> Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" />
            OR
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary transition"
              />
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary transition"
            />
            <PasswordField
              value={password}
              onChange={setPassword}
              show={showPwd}
              onToggle={() => setShowPwd((s) => !s)}
              placeholder="Password"
            />
            {mode === "signup" && (
              <PasswordField
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showConfirm}
                onToggle={() => setShowConfirm((s) => !s)}
                placeholder="Confirm password"
                mismatch={
                  confirmPassword.length > 0 && confirmPassword !== password
                }
              />
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground text-center">
            {mode === "signup" ? "Already have an account?" : "New to Splitit?"}{" "}
            <button
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="text-primary hover:underline font-medium"
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  onToggle,
  placeholder,
  mismatch,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder: string;
  mismatch?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        required
        minLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl bg-input border px-4 py-2.5 pr-11 outline-none transition ${
          mismatch ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
        }`}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 px-3 grid place-items-center text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24">
      <path
        fill="#EA4335"
        d="M12 11v3.2h4.5c-.2 1.2-1.4 3.4-4.5 3.4-2.7 0-4.9-2.2-4.9-5s2.2-5 4.9-5c1.5 0 2.5.6 3.1 1.2l2.1-2.1C15.9 5.4 14.1 4.5 12 4.5 7.9 4.5 4.5 7.9 4.5 12s3.4 7.5 7.5 7.5c4.3 0 7.2-3 7.2-7.3 0-.5 0-.8-.1-1.2H12z"
      />
    </svg>
  );
}
