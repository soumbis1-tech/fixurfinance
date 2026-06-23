import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Reset password" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash. The client picks it up
    // automatically; we just verify a session exists before allowing the update.
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      setReady(!!data.session);
    }, 300);
    return () => clearTimeout(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated.");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 space-y-3"
      >
        <h1 className="text-lg font-semibold">Set a new password</h1>
        {!ready && (
          <p className="text-sm text-muted-foreground">
            Open this page from the password-reset email link.
          </p>
        )}
        <Label htmlFor="newpw">New password</Label>
        <Input
          id="newpw"
          type="password"
          minLength={6}
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={loading || !ready}>
          Update password
        </Button>
      </form>
    </div>
  );
}
