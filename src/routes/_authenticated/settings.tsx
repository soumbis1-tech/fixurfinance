import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveFamily } from "@/hooks/use-families";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2, Mail, Send, AlertTriangle } from "lucide-react";
import { sendTestWeeklyReport } from "@/lib/weekly-report.functions";
import { formatDate } from "@/lib/format";

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
  }, [activeFamily?.id, activeFamily?.name, activeFamily?.currency]);

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
    const { error } = await supabase.from("families").update({ name: famName, currency }).eq("id", activeFamily.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved.");
    qc.invalidateQueries({ queryKey: ["families"] });
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!activeFamily || !memberName.trim()) return;
    const { error } = await supabase.from("family_members").insert({ family_id: activeFamily.id, display_name: memberName.trim() });
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

      <section className="rounded-xl border border-border bg-card p-5 space-y-2">
        <h2 className="font-semibold">Account</h2>
        <div className="text-sm">Signed in as <span className="font-medium">{user?.email}</span></div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Family</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fname">Family name</Label>
            <Input id="fname" value={famName} onChange={(e) => setFamName(e.target.value)} disabled={!isAdmin} />
          </div>
          <div>
            <Label htmlFor="curr">Currency code</Label>
            <Input id="curr" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} disabled={!isAdmin} placeholder="INR" />
          </div>
        </div>
        <Button onClick={saveFamily} disabled={saving || !isAdmin}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save family
        </Button>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Family members</h2>
        <form onSubmit={addMember} className="flex gap-2">
          <Input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Add a person…" />
          <Button type="submit"><UserPlus className="h-4 w-4 mr-2" /> Add</Button>
        </form>
        <ul className="divide-y divide-border border border-border rounded-md">
          {(members.data ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {m.display_name}
                {m.user_id && <span className="ml-2 text-xs text-muted-foreground">(linked user)</span>}
              </span>
              <Button variant="ghost" size="icon" onClick={() => removeMember(m.id)} disabled={!isAdmin || !!m.user_id} aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {members.data?.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No members yet.</li>}
        </ul>
      </section>

      <WeeklyReportSection familyId={activeFamily?.id ?? null} isAdmin={isAdmin} />
    </div>
  );
}

function WeeklyReportSection({ familyId, isAdmin }: { familyId: string | null; isAdmin: boolean }) {
  const qc = useQueryClient();
  const sendTest = useServerFn(sendTestWeeklyReport);

  const settings = useQuery({
    enabled: !!familyId,
    queryKey: ["weekly_report_settings", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_report_settings")
        .select("*")
        .eq("family_id", familyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const runs = useQuery({
    enabled: !!familyId,
    queryKey: ["weekly_report_runs", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_report_runs")
        .select("ran_at, period_start, period_end, status, error, recipients")
        .eq("family_id", familyId!)
        .order("ran_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [recipients, setRecipients] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [hour, setHour] = useState(9);

  useEffect(() => {
    if (settings.data) {
      setEnabled(settings.data.enabled);
      setRecipients((settings.data.recipients ?? []).join(", "));
      setDayOfWeek(settings.data.day_of_week);
      setHour(settings.data.hour_of_day);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error("No family");
      const list = recipients.split(",").map((s) => s.trim()).filter((s) => /\S+@\S+\.\S+/.test(s));
      const payload = { family_id: familyId, enabled, recipients: list, day_of_week: dayOfWeek, hour_of_day: hour };
      const { error } = await supabase.from("weekly_report_settings").upsert(payload, { onConflict: "family_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["weekly_report_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error("No family");
      return sendTest({ data: { familyId } });
    },
    onSuccess: (r) => {
      if (r.sent) toast.success(`Sent via ${r.provider}`);
      else toast.warning(r.error || "Not sent");
      qc.invalidateQueries({ queryKey: ["weekly_report_runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4" /> Weekly email report</h2>
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!isAdmin} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label>Recipients (comma-separated)</Label>
          <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="you@example.com, partner@example.com" disabled={!isAdmin} />
        </div>
        <div>
          <Label>Day of week</Label>
          <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} disabled={!isAdmin}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <Label>Hour (24h)</Label>
          <Input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} disabled={!isAdmin} />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => save.mutate()} disabled={save.isPending || !isAdmin}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save settings
        </Button>
        <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !isAdmin}>
          {test.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Send test email
        </Button>
      </div>

      <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p><b>Setup needed:</b> Set <code>RESEND_API_KEY</code> (and optional <code>RESEND_FROM</code>) in project secrets to actually deliver email. Without it, "Send test" returns "no provider".</p>
            <p>For weekly automation, set <code>CRON_SECRET</code> in secrets, then configure an external scheduler (cron-job.org, EasyCron, etc.) to <b>POST</b> to:</p>
            <code className="block bg-background border border-border rounded px-2 py-1 break-all">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/public/cron/weekly-reports
            </code>
            <p>with header <code>x-cron-secret: &lt;your secret&gt;</code> on your chosen weekday/hour.</p>
          </div>
        </div>
      </div>

      {(runs.data?.length ?? 0) > 0 && (
        <div>
          <div className="text-xs uppercase text-muted-foreground mb-2">Recent runs</div>
          <ul className="text-xs divide-y divide-border border border-border rounded-md">
            {runs.data?.map((r, i) => (
              <li key={i} className="px-3 py-2 flex items-center justify-between gap-3">
                <span>{formatDate(r.ran_at)} · {r.period_start} → {r.period_end}</span>
                <span className={r.status === "sent" ? "text-green-600" : "text-destructive"}>
                  {r.status}{r.error ? ` — ${r.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
