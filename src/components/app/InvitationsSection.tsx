import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Mail, Trash2, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/format";

type Role = "owner" | "admin" | "member" | "viewer";

export function InvitationsSection({ familyId, isAdmin }: { familyId: string | null; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");

  const invites = useQuery({
    enabled: !!familyId,
    queryKey: ["family_invitations", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_invitations")
        .select("id, email, role, token, status, expires_at, created_at, accepted_at")
        .eq("family_id", familyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error("No family");
      const e = email.trim().toLowerCase();
      if (!/\S+@\S+\.\S+/.test(e)) throw new Error("Enter a valid email");
      const { error } = await supabase
        .from("family_invitations")
        .insert({ family_id: familyId, email: e, role, invited_by: (await supabase.auth.getUser()).data.user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      setEmail("");
      toast.success("Invitation created. Share the link with them.");
      qc.invalidateQueries({ queryKey: ["family_invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("family_invitations")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["family_invitations"] }),
  });

  function inviteLink(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/accept-invite?token=${token}`;
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4" id="members">
      <h2 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4" /> Invite people</h2>

      {isAdmin ? (
        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
        >
          <div>
            <Label htmlFor="inv-email" className="sr-only">Email</Label>
            <Input id="inv-email" type="email" placeholder="person@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send invite
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Only owners and admins can send invitations.</p>
      )}

      <div className="text-xs text-muted-foreground">
        Invitations create a secure link. Copy it and share via email, WhatsApp, or any channel — the invitee signs in with the matching email to accept.
      </div>

      <ul className="divide-y divide-border border border-border rounded-md">
        {(invites.data ?? []).map((i) => (
          <li key={i.id} className="px-3 py-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center text-sm">
            <div className="min-w-0">
              <div className="font-medium truncate">{i.email}</div>
              <div className="text-xs text-muted-foreground">
                {i.role} · {i.status}
                {i.status === "pending" && ` · expires ${formatDate(i.expires_at)}`}
                {i.accepted_at && ` · accepted ${formatDate(i.accepted_at)}`}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {i.status === "pending" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(inviteLink(i.token));
                    toast.success("Invite link copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                </Button>
              )}
              {isAdmin && i.status === "pending" && (
                <Button variant="ghost" size="icon" aria-label="Revoke" onClick={() => revoke.mutate(i.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
        {invites.data?.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No invitations yet.</li>}
      </ul>
    </section>
  );
}
