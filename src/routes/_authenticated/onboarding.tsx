import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Wallet, Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  beforeLoad: async () => {
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
  const [seed, setSeed] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.rpc("create_family", { _name: name });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    const familyId = data as unknown as string;
    if (typeof window !== "undefined" && familyId) {
      localStorage.setItem("fet-active-family", familyId);
    }
    if (seed && familyId) {
      const { error: seedErr } = await supabase.rpc("seed_family_sample_data", { _family_id: familyId });
      if (seedErr) toast.warning("Family created, but sample data failed: " + seedErr.message);
      else toast.success("Family created with sample data.");
    } else {
      toast.success("Family created.");
    }
    setLoading(false);
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Create your family workspace</h1>
            <p className="text-sm text-muted-foreground">You can invite members and rename it later.</p>
          </div>
        </div>
        <div>
          <Label htmlFor="famname">Family name</Label>
          <Input id="famname" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 cursor-pointer">
          <Switch checked={seed} onCheckedChange={setSeed} className="mt-0.5" />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" /> Add sample data
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Seeds ~60 example expenses across the last 60 days, a few budgets, and one savings goal so the dashboard and charts feel alive immediately. You can delete or import over them.
            </span>
          </span>
        </label>

        <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create family
        </Button>
        <p className="text-xs text-muted-foreground">
          We'll also seed your default categories, keyword rules, and common recurring household items.
        </p>
      </form>
    </div>
  );
}
