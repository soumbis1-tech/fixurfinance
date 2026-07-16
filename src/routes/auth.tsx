import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet,
  Loader2,
  TrendingUp,
  ShieldCheck,
  PieChart,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

const PENDING_KEY = "fet-pending-invite-token";

function safeNextPath(next: string | undefined | null): string | null {
  if (!next) return null;
  // Only allow same-origin relative paths (must start with "/" and not "//").
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function postAuthDestination(nextParam?: string | null):
  | { href: string }
  | { to: string; search?: Record<string, string> } {
  const safe = safeNextPath(nextParam);
  if (safe) return { href: safe };
  if (typeof window === "undefined") return { to: "/dashboard" };
  const token = localStorage.getItem(PENDING_KEY);
  if (token) return { to: "/accept-invite", search: { token } };
  return { to: "/dashboard" };
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const dest = postAuthDestination(search.next);
      if ("href" in dest) throw redirect({ href: dest.href } as never);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw redirect({ to: dest.to, search: dest.search as any });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign in — Family Expense Tracker" },
      { name: "description", content: "Sign in to your Family Expense Tracker." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  function goToDest() {
    const dest = postAuthDestination(next);
    if ("href" in dest) {
      window.location.href = dest.href;
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: dest.to, search: dest.search as any });
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    goToDest();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const safe = safeNextPath(next);
    const emailRedirectTo = safe
      ? `${window.location.origin}/auth?next=${encodeURIComponent(safe)}`
      : window.location.origin;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: { full_name: name },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Check your email to confirm your account, then sign in.");
  }

  async function handleGoogle() {
    setLoading(true);
    const safe = safeNextPath(next);
    const redirectUri = safe
      ? `${window.location.origin}/auth?next=${encodeURIComponent(safe)}`
      : window.location.origin;
    const result = (await lovable.auth.signInWithOAuth("google", {
      redirect_uri: redirectUri,
    })) as { error?: unknown; redirected?: boolean };
    if (result.error) {
      setLoading(false);
      const err = result.error;
      toast.error(typeof err === "string" ? err : (err as Error).message ?? "Sign-in failed");
      return;
    }
    if (result.redirected) return;
    goToDest();
  }

  async function handleReset() {
    if (!email) return toast.error("Enter your email first");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent.");
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ============ HERO / BRAND SIDE ============ */}
      <aside
        className="relative hidden lg:flex flex-col justify-between overflow-hidden p-10 xl:p-14 text-white"
        style={{
          backgroundColor: "#07131f",
          backgroundImage:
            "radial-gradient(1100px 620px at 12% 8%, rgba(16,185,129,0.38), transparent 62%)," +
            "radial-gradient(900px 520px at 92% 92%, rgba(79,70,229,0.42), transparent 60%)," +
            "radial-gradient(700px 400px at 80% 15%, rgba(20,184,166,0.22), transparent 65%)," +
            "linear-gradient(160deg, #07131f 0%, #0a1a2b 55%, #0b1f2e 100%)",
        }}
      >
        {/* subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.9) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:
              "radial-gradient(ellipse at center, black 55%, transparent 85%)",
          }}
        />
        {/* animated glow blobs */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-emerald-400/25 blur-3xl animate-pulse" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-indigo-500/25 blur-3xl animate-pulse [animation-delay:1.2s]" />

        {/* Brand */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 shadow-lg">
            <Wallet className="h-6 w-6 text-emerald-300" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">Family Expense Tracker</div>
            <div className="text-xs text-white/60">Household finance, effortlessly organized.</div>
          </div>
        </div>

        {/* Headline + preview card */}
        <div className="relative mt-10 space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
              AI-powered money assistant
            </div>
            <h2 className="text-4xl xl:text-5xl font-semibold leading-[1.05] tracking-tight">
              Every rupee,
              <br />
              <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-sky-300 bg-clip-text text-transparent">
                accounted for.
              </span>
            </h2>
            <p className="max-w-md text-sm xl:text-base text-white/70 leading-relaxed">
              Track family spending, budgets, reimbursements, and investments in one calm,
              private workspace — with weekly insights delivered to your inbox.
            </p>
          </div>

          {/* Floating stat card */}
          <div className="relative max-w-sm">
            <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-white/10 to-white/0 blur-xl" />
            <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-5 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-white/60">This month</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  <ArrowDownRight className="h-3 w-3" /> 12% vs last
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight">₹ 84,320</span>
                <span className="text-xs text-white/50">/ ₹ 1,10,000 budget</span>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[76%] rounded-full bg-gradient-to-r from-emerald-400 to-teal-300" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
                <MiniStat icon={<PieChart className="h-3.5 w-3.5" />} label="Categories" value="18" />
                <MiniStat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Saved" value="₹25.6k" />
                <MiniStat icon={<ArrowUpRight className="h-3.5 w-3.5" />} label="Invested" value="₹12k" />
              </div>
            </div>
          </div>
        </div>

        {/* Trust footer */}
        <div className="relative flex items-center gap-6 text-xs text-white/60">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
            Bank-grade encryption
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
            Family-only access (RLS)
          </span>
        </div>
      </aside>

      {/* ============ FORM SIDE ============ */}
      <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {/* Mobile brand */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">Family Expense Tracker</div>
              <div className="text-xs text-muted-foreground">Household finance, organized.</div>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to continue managing your family's finances.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur">
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 mt-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="email-in">Email</Label>
                    <Input
                      id="email-in"
                      type="email"
                      placeholder="you@family.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="pw-in">Password</Label>
                      <button
                        type="button"
                        onClick={handleReset}
                        className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="pw-in"
                      type="password"
                      placeholder="••••••••"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Sign in
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 mt-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="name-up">Full name</Label>
                    <Input
                      id="name-up"
                      type="text"
                      placeholder="Jane Doe"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email-up">Email</Label>
                    <Input
                      id="email-up"
                      type="email"
                      placeholder="you@family.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pw-up">Password</Label>
                    <Input
                      id="pw-up"
                      type="password"
                      placeholder="At least 6 characters"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or continue with</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="outline"
              className="w-full h-11 font-medium"
              onClick={handleGoogle}
              disabled={loading}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 mr-2" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z"
                />
              </svg>
              Continue with Google
            </Button>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing you agree to keep your family's financial data private and secure.
          </p>
        </div>
      </main>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
