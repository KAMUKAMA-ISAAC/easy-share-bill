import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CodeLookup, FEATURES, FeatureCard, PublicHeader, StatChip } from "@/components/marketing";
import { ArrowRight, Check } from "lucide-react";

const indexSearchSchema = z.object({
  // Friends who scan the QR land here with ?code=ABC123 prefilled.
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Splitit — Smart expense splitting & guest payment links" },
      {
        name: "description",
        content:
          "Scan receipts with AI, split flexibly, and share payment links your friends can pay without an account.",
      },
      { property: "og:title", content: "Splitit — Smart expense splitting" },
      {
        property: "og:description",
        content: "AI receipts, flexible splits, no-login guest payments.",
      },
    ],
  }),
  validateSearch: indexSearchSchema,
  component: Landing,
});

function Landing() {
  const { code } = Route.useSearch();
  return (
    <div className="min-h-screen">
      <PublicHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 lg:pt-32 lg:pb-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 backdrop-blur px-3 py-1 mb-6 text-xs">
              <span className="size-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-muted-foreground">
                AI receipts · flexible splits · guest-friendly links
              </span>
            </div>
            <h1 className="font-display text-5xl md:text-7xl font-semibold leading-[1.05] tracking-tight">
              Splitting bills,
              <br />
              <span className="gradient-text">finally painless.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
              Splitit scans your receipt, splits the cost any way you want, and sends your friends a
              secure link they can settle up with — no app, no signup.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-primary-foreground font-medium hover:opacity-90 transition shadow-lg shadow-primary/20"
              >
                Start splitting free
                <ArrowRight className="size-4 group-hover:translate-x-0.5 transition" />
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 backdrop-blur px-6 py-3 font-medium hover:bg-card transition"
              >
                Sign in
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["No card required", "Guests pay without signup", "Cancel any time"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-accent" /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Floating preview card */}
          <div className="mt-16 lg:mt-24 grid md:grid-cols-3 gap-4 max-w-4xl">
            <StatChip label="Average split">
              <span className="text-foreground">UGX 24,500</span>
            </StatChip>
            <StatChip label="Settled this week">
              <span className="text-accent">+UGX 1,284,000</span>
            </StatChip>
            <StatChip label="Receipts scanned">
              <span>3,412</span>
            </StatChip>
          </div>
        </div>
      </section>

      <CodeLookup initialCode={code} />

      {/* Features */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="max-w-2xl mb-12">
          <div className="text-xs uppercase tracking-wider text-primary font-medium mb-3">
            How it works
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Built for messy real-life money — Ugandan style.
          </h2>
          <p className="mt-3 text-muted-foreground">
            MTN Mobile Money, Airtel Money, and bank transfers — your friends settle the way they
            already pay.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="glass-card rounded-3xl p-10 md:p-16 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-60"
            style={{ background: "var(--gradient-hero)" }}
          />
          <div className="relative">
            <h2 className="font-display text-3xl md:text-5xl font-semibold tracking-tight mb-4">
              Ready to stop chasing IOUs?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto mb-8">
              Create your first group in 30 seconds. Friends pay you back on MoMo, Airtel, or
              bank — no account needed.
            </p>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-primary-foreground font-medium hover:opacity-90 transition"
            >
              Get started — it's free
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Developer credit */}
      <section className="mx-auto max-w-7xl px-6 pb-12">
        <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Built by
            </div>
            <div className="font-display font-semibold text-lg">Kamukama Isaac</div>
            <a
              href="mailto:kamukamaisaac497@gmail.com"
              className="text-sm text-primary hover:underline"
            >
              kamukamaisaac497@gmail.com
            </a>
          </div>
          <p className="text-xs text-muted-foreground max-w-sm sm:text-right">
            Independent developer · Kampala, Uganda. Reach out for feedback, partnerships, or
            custom builds.
          </p>
        </div>
      </section>

      <footer className="border-t border-border/60 mx-auto max-w-7xl px-6 py-8 text-sm text-muted-foreground flex flex-wrap justify-between gap-4">
        <span>© {new Date().getFullYear()} Splitit · Made in Uganda 🇺🇬</span>
        <span>Mobile Money & bank-friendly bill splitting.</span>
      </footer>
    </div>
  );
}
