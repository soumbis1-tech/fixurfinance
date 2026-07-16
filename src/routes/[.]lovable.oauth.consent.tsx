import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, Wallet } from "lucide-react";

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{
    data?: {
      client?: { name?: string; client_name?: string; redirect_uris?: string[] };
      scope?: string;
      redirect_url?: string;
      redirect_to?: string;
    };
    error?: { message: string };
  }>;
  approveAuthorization: (id: string) => Promise<{
    data?: { redirect_url?: string; redirect_to?: string };
    error?: { message: string };
  }>;
  denyAuthorization: (id: string) => Promise<{
    data?: { redirect_url?: string; redirect_to?: string };
    error?: { message: string };
  }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } as never });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate } as never);
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-lg font-semibold">Could not load this authorization request</h1>
        <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState<null | "approve" | "deny">(null);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.client_name ?? details?.client?.name ?? "an app";
  const redirectUri = details?.client?.redirect_uris?.[0];
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(null);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(null);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">Family Expense Tracker</div>
            <div className="text-xs text-muted-foreground">Authorize external access</div>
          </div>
        </div>

        <div>
          <h1 className="text-lg font-semibold">Connect {clientName} to your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This lets {clientName} use this app as you. It can call the enabled tools
            (list expenses, view monthly summaries, add expenses, list reimbursements)
            on your behalf while you are signed in.
          </p>
        </div>

        {redirectUri && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground break-all">
            Redirects to: {redirectUri}
          </div>
        )}

        {scopes.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-1">
            {scopes.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                {s}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          This does not bypass this app's permissions — {clientName} will only see data
          your family membership allows.
        </p>

        {error && (
          <div role="alert" className="text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={busy !== null}
            onClick={() => decide(true)}
          >
            {busy === "approve" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Approve
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy !== null}
            onClick={() => decide(false)}
          >
            {busy === "deny" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Deny
          </Button>
        </div>
      </div>
    </main>
  );
}
