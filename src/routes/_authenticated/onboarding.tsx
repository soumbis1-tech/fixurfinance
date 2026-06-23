import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wallet, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  beforeLoad: async () => {
    // If user already has a family, skip onboarding
    const { data } = await supabase
      .from("family_user_roles")
      .select("family_id")
      .limit(1);
    if ((data?.length ?? 0) > 0) throw redirect({ to: "/dashboard" });
  },
  component: Onboarding,
});

function Onboarding() {
  const [name, setName] = useState("Our Household");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.rpc("create_family", { _name: name });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Family created.");
    if (typeof window !== "undefined" && data) {
      localStorage.setItem("fet-active-family", data as string);
    }
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Create your family workspace</h1>
            <p className="text-sm text-muted-foreground">
              You can invite members and rename it later.
            </p>
          </div>
        </div>
        <div>
          <Label htmlFor="famname">Family name</Label>
          <Input
            id="famname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Sharma Family"
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create family
        </Button>
        <p className="text-xs text-muted-foreground">
          We&rsquo;ll seed your default categories, keyword rules, and a starter list of common
          recurring household items so you can start tracking right away.
        </p>
      </form>
    </div>
  );
}
