import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Wallet, Loader2, Check, AlertTriangle } from "lucide-react";

const PENDING_KEY = "fet-pending-invite-token";

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  validateSearch: (s) => z.object({ token: z.string().min(1).optional() }).parse(s),
  head: () => ({ meta: [{ title: "Accept invitation" }] }),
  component: AcceptInvitePage,
});

type Preview = { family_name: string; email: string; role: string; status: string; expires_at: string };

function AcceptInvitePage() {
  const { token } = useSearch({ from: "/accept-invite" });
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) { setError("Missing invitation token."); return; }
    (async () => {
      const { data, error } = await supabase.rpc("invitation_preview", { _token: token });
      if (error) return setError(error.message);
      const row = (data as Preview[] | null)?.[0];
      if (!row) return setError("Invitation not found.");
      setPreview(row);
    })();
  }, [token]);

  async function accept() {
    if (!token) return;
    setAccepting(true);
    const { data, error } = await supabase.rpc("accept_family_invitation", { _token: token });
    setAccepting(false);
    if (error) return toast.error(error.message);
    const fid = data as unknown as string;
    if (fid && typeof window !== "undefined") localStorage.setItem("fet-active-family", fid);
    if (typeof window !== "undefined") localStorage.removeItem(PENDING_KEY);
    toast.success(`Joined ${preview?.family_name ?? "family"}.`);
    navigate({ to: "/dashboard" });
  }

  function gotoSignIn() {
    if (typeof window !== "undefined" && token) localStorage.setItem(PENDING_KEY, token);
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">Family invitation</h1>
            <p className="text-sm text-muted-foreground">Join a Family Expense Tracker workspace</p>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {!error && !preview && (
          <div className="flex items-center text-sm text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading invitation…</div>
        )}

        {preview && (
          <>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Family:</span> <span className="font-medium">{preview.family_name}</span></div>
              <div><span className="text-muted-foreground">Invited:</span> <span className="font-medium">{preview.email}</span></div>
              <div><span className="text-muted-foreground">Role:</span> <span className="font-medium capitalize">{preview.role}</span></div>
              <div><span className="text-muted-foreground">Status:</span> <span className="font-medium capitalize">{preview.status}</span></div>
            </div>

            {preview.status !== "pending" && (
              <div className="text-sm text-muted-foreground">This invitation is no longer pending.</div>
            )}

            {preview.status === "pending" && !loading && !user && (
              <div className="space-y-2">
                <p className="text-sm">Sign in or create an account with <b>{preview.email}</b> to accept.</p>
                <Button className="w-full" onClick={gotoSignIn}>Continue to sign in</Button>
              </div>
            )}

            {preview.status === "pending" && user && user.email?.toLowerCase() !== preview.email.toLowerCase() && (
              <div className="text-sm text-amber-600 dark:text-amber-400 flex gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                You're signed in as <b className="mx-1">{user.email}</b>. Sign out and sign in as <b className="mx-1">{preview.email}</b> to accept.
              </div>
            )}

            {preview.status === "pending" && user && user.email?.toLowerCase() === preview.email.toLowerCase() && (
              <Button className="w-full" onClick={accept} disabled={accepting}>
                {accepting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                Accept invitation
              </Button>
            )}
          </>
        )}

        <div className="text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:underline">Back to home</Link>
        </div>
      </div>
    </div>
  );
}
