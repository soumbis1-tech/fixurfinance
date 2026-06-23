import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveFamily } from "@/hooks/use-families";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const { activeFamily, activeRole } = useActiveFamily();
  const qc = useQueryClient();
  const [famName, setFamName] = useState(activeFamily?.name ?? "");
  const [currency, setCurrency] = useState(activeFamily?.currency ?? "INR");
  const [memberName, setMemberName] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdmin = activeRole === "owner" || activeRole === "admin";

  useEffect(() => {
    setFamName(activeFamily?.name ?? "");
    setCurrency(activeFamily?.currency ?? "INR");
  }, [activeFamily?.id]);

  const members = useQuery({
    enabled: !!activeFamily?.id,
    queryKey: ["family_members", activeFamily?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_members")
        .select("id, display_name, user_id, active")
        .eq("family_id", activeFamily!.id)
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function saveFamily() {
    if (!activeFamily) return;
    setSaving(true);
    const { error } = await supabase
      .from("families")
      .update({ name: famName, currency })
      .eq("id", activeFamily.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved.");
    qc.invalidateQueries({ queryKey: ["families"] });
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!activeFamily || !memberName.trim()) return;
    const { error } = await supabase
      .from("family_members")
      .insert({ family_id: activeFamily.id, display_name: memberName.trim() });
    if (error) return toast.error(error.message);
    setMemberName("");
    toast.success("Member added.");
    members.refetch();
  }

  async function removeMember(id: string) {
    const { error } = await supabase.from("family_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    members.refetch();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Account</h2>
        <div className="text-sm">
          Signed in as <span className="font-medium">{user?.email}</span>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Family</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fname">Family name</Label>
            <Input
              id="fname"
              value={famName}
              onChange={(e) => setFamName(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div>
            <Label htmlFor="curr">Currency code</Label>
            <Input
              id="curr"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              disabled={!isAdmin}
              placeholder="INR"
            />
          </div>
        </div>
        <Button onClick={saveFamily} disabled={saving || !isAdmin}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save family
        </Button>
        {!isAdmin && (
          <p className="text-xs text-muted-foreground">
            Only owners/admins can change family settings. You are: {activeRole}.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Family members</h2>
        <form onSubmit={addMember} className="flex gap-2">
          <Input
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            placeholder="Add a person (e.g. Soumik, Soumi…)"
          />
          <Button type="submit">
            <UserPlus className="h-4 w-4 mr-2" /> Add
          </Button>
        </form>
        <ul className="divide-y divide-border border border-border rounded-md">
          {(members.data ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {m.display_name}
                {m.user_id && (
                  <span className="ml-2 text-xs text-muted-foreground">(linked user)</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeMember(m.id)}
                disabled={!isAdmin || !!m.user_id}
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {members.data?.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">No members yet.</li>
          )}
        </ul>
        <p className="text-xs text-muted-foreground">
          To invite another user with sign-in access (instead of a named member), share the app
          and add them in Phase 2 of the build (user invitations UI).
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-2">
        <h2 className="font-semibold">Coming soon</h2>
        <ul className="text-sm text-muted-foreground list-disc list-inside">
          <li>Email invitations and role assignment UI (Phase 2)</li>
          <li>Weekly email report settings (Phase 5)</li>
          <li>OpenAI / AI chatbot setup (Phase 6)</li>
        </ul>
      </section>
    </div>
  );
}
