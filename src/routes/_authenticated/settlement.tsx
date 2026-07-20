import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/format";
import { Handshake, CheckCircle2, Clock, AlertCircle, Loader2, X } from "lucide-react";
import { currentCycleStart, settlementHistoryCycleStart } from "@/lib/settlement-cycle";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settlement")({
  head: () => ({ meta: [{ title: "Expense Settlement" }] }),
  component: SettlementPage,
});

type Settlement = {
  id: string;
  family_id: string;
  initiated_by: string;
  period_start: string;
  period_end: string;
  status: "pending" | "completed" | "cancelled";
  completed_at: string | null;
  created_at: string;
};

function SettlementPage() {
  const { activeFamily } = useActiveFamily();
  const { user } = useAuth();
  const familyId = activeFamily?.id ?? null;
  const currency = activeFamily?.currency ?? "INR";
  const qc = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);

  // Last completed settlement (defines period start)
  const lastCompleted = useQuery({
    enabled: !!familyId,
    queryKey: ["settlement_last", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_settlements")
        .select("*")
        .eq("family_id", familyId!)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Settlement | null;
    },
  });

  // Current pending settlement (if any)
  const pending = useQuery({
    enabled: !!familyId,
    queryKey: ["settlement_pending", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_settlements")
        .select("*")
        .eq("family_id", familyId!)
        .eq("status", "pending")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Settlement | null;
    },
  });

  // Family user members (approval universe)
  const familyUsers = useQuery({
    enabled: !!familyId,
    queryKey: ["settlement_users", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_user_roles")
        .select("user_id, profile:profiles!inner(id, full_name, email)")
        .eq("family_id", familyId!);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        user_id: r.user_id as string,
        name: (r.profile?.full_name || r.profile?.email || "Member") as string,
      }));
    },
  });

  // Approvals for pending settlement
  const approvals = useQuery({
    enabled: !!pending.data?.id,
    queryKey: ["settlement_approvals", pending.data?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_settlement_approvals")
        .select("user_id, approved_at")
        .eq("settlement_id", pending.data!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Period start = last completed's completed_at OR family created_at
  const family = useQuery({
    enabled: !!familyId && !lastCompleted.data,
    queryKey: ["family_created", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("families")
        .select("created_at")
        .eq("id", familyId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Settlement cycles run twice a month (1st–15th, 16th–end). The visible
  // period starts at the later of: the current cycle start, and the last
  // completed settlement's timestamp (so a mid-cycle settlement resets it).
  const periodStart = useMemo(() => {
    const cycleStart = currentCycleStart().toISOString();
    const candidates = [cycleStart];
    if (lastCompleted.data?.completed_at) candidates.push(lastCompleted.data.completed_at);
    else if (family.data?.created_at) candidates.push(family.data.created_at);
    return candidates.sort().pop() ?? null;
  }, [lastCompleted.data, family.data]);

  // Expenses in the current settlement window: exclude reimbursable, trip-linked, and personal expense
  const expenses = useQuery({
    enabled: !!familyId && !!periodStart,
    queryKey: ["settlement_expenses", familyId, periodStart],
    queryFn: async () => {
      const startDate = new Date(periodStart!).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("expenses")
        .select("id, date, amount, description, comments, paid_by, reimbursable, trip_id, type")
        .eq("family_id", familyId!)
        .eq("type", "expense")
        .eq("reimbursable", false)
        .is("trip_id", null)
        .gte("date", startDate);
      if (error) throw error;
      return (data ?? []).filter(
        (r) => !(r.comments ?? "").toLowerCase().includes("personal expense"),
      );
    },
  });

  const members = useQuery({
    enabled: !!familyId,
    queryKey: ["members_all", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_members")
        .select("id, display_name, user_id")
        .eq("family_id", familyId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byMember = useMemo(() => {
    const nameById = new Map((members.data ?? []).map((m) => [m.id, m.display_name]));
    const map = new Map<string, { name: string; total: number; count: number }>();
    let grand = 0;
    for (const r of expenses.data ?? []) {
      const key = r.paid_by ?? "unassigned";
      const name = (r.paid_by && nameById.get(r.paid_by)) || "Unassigned";
      const cur = map.get(key) ?? { name, total: 0, count: 0 };
      cur.total += Number(r.amount);
      cur.count += 1;
      map.set(key, cur);
      grand += Number(r.amount);
    }
    return {
      rows: Array.from(map.values()).sort((a, b) => b.total - a.total),
      grand,
    };
  }, [expenses.data, members.data]);

  const startMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("start_expense_settlement", { _family_id: familyId! });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Settlement started. Waiting for other members to approve.");
      qc.invalidateQueries({ queryKey: ["settlement_pending", familyId] });
      qc.invalidateQueries({ queryKey: ["settlement_approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("approve_expense_settlement", { _settlement_id: id });
      if (error) throw error;
      return data?.[0];
    },
    onSuccess: (row) => {
      if (row?.status === "completed") {
        toast.success("Settlement completed. All balances reset.");
      } else {
        toast.success(`Approved (${row?.approvals_count}/${row?.required_count})`);
      }
      qc.invalidateQueries({ queryKey: ["settlement_pending", familyId] });
      qc.invalidateQueries({ queryKey: ["settlement_last", familyId] });
      qc.invalidateQueries({ queryKey: ["settlement_approvals"] });
      qc.invalidateQueries({ queryKey: ["settlement_expenses", familyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_expense_settlement", { _settlement_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settlement cancelled");
      qc.invalidateQueries({ queryKey: ["settlement_pending", familyId] });
      qc.invalidateQueries({ queryKey: ["settlement_approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const history = useQuery({
    enabled: showHistory && !!familyId,
    queryKey: ["settlement_history", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_settlements")
        .select("id, status, period_start, period_end, completed_at, created_at, initiated_by, totals")
        .eq("family_id", familyId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const approvedUserIds = new Set((approvals.data ?? []).map((a) => a.user_id));
  const allUsers = familyUsers.data ?? [];
  const pendingUsers = allUsers.filter((u) => !approvedUserIds.has(u.user_id));
  const approvedUsers = allUsers.filter((u) => approvedUserIds.has(u.user_id));
  const iApproved = user ? approvedUserIds.has(user.id) : false;
  const initiatorName =
    pending.data && allUsers.find((u) => u.user_id === pending.data!.initiated_by)?.name;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Handshake className="h-6 w-6" /> Expense Settlement
          </h1>
          <p className="text-sm text-muted-foreground">
            Tracks family-purpose expenses only. Excludes trip, personal, and reimbursable expenses.
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowHistory((s) => !s)}>
          {showHistory ? "Hide history" : "View history"}
        </Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat
          label="Last settlement"
          value={
            lastCompleted.data?.completed_at
              ? formatDate(lastCompleted.data.completed_at)
              : "Never"
          }
          icon={CheckCircle2}
        />
        <Stat
          label="Since"
          value={periodStart ? formatDate(periodStart) : "—"}
          icon={Clock}
        />
        <Stat
          label="Family total (unsettled)"
          value={formatMoney(byMember.grand, currency)}
          icon={Handshake}
        />
      </div>

      {pending.data && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                Settlement in progress
              </div>
              <div className="text-sm text-muted-foreground">
                Started by <span className="font-medium">{initiatorName ?? "a member"}</span> on{" "}
                {formatDate(pending.data.created_at)}. Waiting on approval from every family member.
              </div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-background/60 p-3">
              <div className="text-xs uppercase text-muted-foreground mb-2">Approved</div>
              {approvedUsers.length === 0 && <div className="text-sm text-muted-foreground">None yet</div>}
              <ul className="space-y-1">
                {approvedUsers.map((u) => (
                  <li key={u.user_id} className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {u.name}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-background/60 p-3">
              <div className="text-xs uppercase text-muted-foreground mb-2">Pending approval</div>
              {pendingUsers.length === 0 && <div className="text-sm text-muted-foreground">All approved</div>}
              <ul className="space-y-1">
                {pendingUsers.map((u) => (
                  <li key={u.user_id} className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    {u.name}
                    {u.user_id === user?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!iApproved && (
              <Button
                onClick={() => approveMut.mutate(pending.data!.id)}
                disabled={approveMut.isPending}
              >
                {approveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Approve settlement
              </Button>
            )}
            {pending.data.initiated_by === user?.id && (
              <Button
                variant="outline"
                onClick={() => cancelMut.mutate(pending.data!.id)}
                disabled={cancelMut.isPending}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-medium">Family expenses to settle</h2>
          {!pending.data && (byMember.grand > 0) && (
            <Button onClick={() => startMut.mutate()} disabled={startMut.isPending}>
              {startMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Handshake className="h-4 w-4 mr-1" />}
              Start settlement
            </Button>
          )}
        </div>
        {expenses.isLoading ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div>
        ) : byMember.rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No family expenses to settle since {periodStart ? formatDate(periodStart) : "start"}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Paid by</th>
                  <th className="px-4 py-2 font-medium text-right">Entries</th>
                  <th className="px-4 py-2 font-medium text-right">Amount</th>
                  <th className="px-4 py-2 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {byMember.rows.map((r) => (
                  <tr key={r.name} className="border-t border-border">
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{formatMoney(r.total, currency)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {byMember.grand ? Math.round((r.total / byMember.grand) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {byMember.rows.reduce((s, r) => s + r.count, 0)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(byMember.grand, currency)}</td>
                  <td className="px-4 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {showHistory && (
        <div className="rounded-xl border border-border bg-card">
          <div className="p-4 border-b border-border font-medium">Settlement history</div>
          {history.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Loading…</div>
          ) : (history.data ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No settlements yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {history.data!.map((h) => {
                const rows = Array.isArray(h.totals)
                  ? (h.totals as Array<{ name: string; total: number; count: number }>)
                  : [];
                const grand = rows.reduce((s, r) => s + Number(r.total || 0), 0);
                const displayStart = settlementHistoryCycleStart(
                  h.completed_at ?? h.period_end ?? h.created_at,
                );
                return (
                  <li key={h.id} className="p-4 text-sm space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium capitalize">{h.status}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(displayStart.toISOString())} → {formatDate(h.period_end)}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        {h.completed_at ? `Completed ${formatDate(h.completed_at)}` : formatDate(h.created_at)}
                        {grand > 0 && (
                          <div className="text-sm font-medium text-foreground tabular-nums">
                            {formatMoney(grand, currency)}
                          </div>
                        )}
                      </div>
                    </div>
                    {rows.length > 0 && (
                      <div className="rounded-md bg-muted/40 divide-y divide-border">
                        {rows.map((r, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                            <span>{r.name}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {r.count} {r.count === 1 ? "entry" : "entries"}
                            </span>
                            <span className="tabular-nums font-medium">
                              {formatMoney(Number(r.total), currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
