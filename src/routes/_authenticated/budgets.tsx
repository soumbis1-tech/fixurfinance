import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { useCategories } from "@/hooks/use-family-lookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { Loader2, Plus, Target, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({ meta: [{ title: "Budgets & Goals" }] }),
  component: BudgetsPage,
});

function BudgetsPage() {
  const { activeFamily } = useActiveFamily();
  const familyId = activeFamily?.id;
  const currency = activeFamily?.currency ?? "INR";
  const qc = useQueryClient();
  const cats = useCategories(familyId);

  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  function shiftMonth(delta: number) {
    setPeriod((p) => {
      const d = new Date(p.year, p.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }

  const budgets = useQuery({
    enabled: !!familyId,
    queryKey: ["budgets", familyId, period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("id, category_id, amount, notes")
        .eq("family_id", familyId!)
        .eq("period_year", period.year)
        .eq("period_month", period.month);
      if (error) throw error;
      return data ?? [];
    },
  });

  const spent = useQuery({
    enabled: !!familyId,
    queryKey: ["category_summary", familyId, period],
    queryFn: async () => {
      const start = new Date(period.year, period.month - 1, 1).toISOString().slice(0, 10);
      const end = new Date(period.year, period.month, 0).toISOString().slice(0, 10);
      const { data, error } = await supabase.rpc("category_summary", {
        _family_id: familyId!,
        _start: start,
        _end: end,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const spentMap = useMemo(
    () => Object.fromEntries((spent.data ?? []).map((r) => [r.category_id, Number(r.total)])),
    [spent.data],
  );
  const budgetMap = useMemo(
    () => Object.fromEntries((budgets.data ?? []).map((b) => [b.category_id, b])),
    [budgets.data],
  );

  const upsert = useMutation({
    mutationFn: async ({ categoryId, amount }: { categoryId: string; amount: number }) => {
      const existing = budgetMap[categoryId];
      if (existing) {
        const { error } = await supabase.from("budgets").update({ amount }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("budgets").insert({
          family_id: familyId!,
          category_id: categoryId,
          period_year: period.year,
          period_month: period.month,
          amount,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const delBudget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const totalBudget = (budgets.data ?? []).reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent = (spent.data ?? []).reduce((s, b) => s + Number(b.total), 0);
  const monthLabel = new Date(period.year, period.month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Budgets & Goals</h1>
          <p className="text-sm text-muted-foreground">Set category limits per month and track savings goals.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="text-sm font-medium w-36 text-center">{monthLabel}</div>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <StatCard label="Total budget" value={formatMoney(totalBudget, currency)} />
        <StatCard label="Total spent" value={formatMoney(totalSpent, currency)} />
        <StatCard label="Remaining" value={formatMoney(totalBudget - totalSpent, currency)} accent={totalSpent > totalBudget && totalBudget > 0 ? "danger" : "ok"} />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border font-medium">Category budgets</div>
        {cats.isLoading ? (
          <div className="p-6 flex items-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
        ) : (
          <div className="divide-y divide-border">
            {(cats.data ?? []).map((c) => {
              const budget = Number(budgetMap[c.id]?.amount ?? 0);
              const used = spentMap[c.id] ?? 0;
              const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
              const over = budget > 0 && used > budget;
              return (
                <div key={c.id} className="p-4 grid sm:grid-cols-[1fr_180px_auto] gap-3 items-center">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatMoney(used, currency)} of {budget > 0 ? formatMoney(budget, currency) : "no budget"}
                    </div>
                    {budget > 0 && (
                      <Progress value={pct} className={`mt-2 h-2 ${over ? "[&>div]:bg-destructive" : ""}`} />
                    )}
                  </div>
                  <BudgetInput
                    value={budget}
                    onCommit={(v) => upsert.mutate({ categoryId: c.id, amount: v })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!budgetMap[c.id]}
                    onClick={() => budgetMap[c.id] && delBudget.mutate(budgetMap[c.id].id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <GoalsSection familyId={familyId ?? null} currency={currency} />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "ok" | "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${accent === "danger" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function BudgetInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value ? String(value) : "");
  return (
    <Input
      type="number"
      min={0}
      placeholder="0"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v || 0);
        if (n !== value) onCommit(n);
      }}
    />
  );
}

function GoalsSection({ familyId, currency }: { familyId: string | null; currency: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");

  const goals = useQuery({
    enabled: !!familyId,
    queryKey: ["goals", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("id, name, target_amount, current_amount, target_date")
        .eq("family_id", familyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addGoal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("goals").insert({
        family_id: familyId!,
        name: name.trim(),
        target_amount: Number(target),
        target_date: date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      setName(""); setTarget(""); setDate(""); setOpen(false);
      toast.success("Goal added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateProgress = useMutation({
    mutationFn: async ({ id, current_amount }: { id: string; current_amount: number }) => {
      const { error } = await supabase.from("goals").update({ current_amount }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="font-medium flex items-center gap-2"><Target className="h-4 w-4" /> Savings goals</div>
        <Button size="sm" onClick={() => setOpen((o) => !o)}><Plus className="h-4 w-4 mr-1" /> Goal</Button>
      </div>
      {open && (
        <div className="p-4 border-b border-border grid sm:grid-cols-4 gap-3 items-end">
          <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" /></div>
          <div><Label className="text-xs">Target ({currency})</Label><Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
          <div><Label className="text-xs">Target date (optional)</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <Button onClick={() => addGoal.mutate()} disabled={!name.trim() || !target || addGoal.isPending}>Save</Button>
        </div>
      )}
      {goals.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div>
      ) : goals.data?.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">No goals yet. Click "Goal" to add one.</div>
      ) : (
        <div className="divide-y divide-border">
          {goals.data?.map((g) => {
            const pct = Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100));
            return (
              <div key={g.id} className="p-4 grid sm:grid-cols-[1fr_180px_auto] gap-3 items-center">
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatMoney(Number(g.current_amount), currency)} of {formatMoney(Number(g.target_amount), currency)}
                    {g.target_date ? ` · by ${g.target_date}` : ""}
                  </div>
                  <Progress value={pct} className="mt-2 h-2" />
                </div>
                <Input
                  type="number"
                  defaultValue={Number(g.current_amount)}
                  onBlur={(e) => {
                    const v = Number(e.target.value || 0);
                    if (v !== Number(g.current_amount)) updateProgress.mutate({ id: g.id, current_amount: v });
                  }}
                />
                <Button variant="ghost" size="icon" onClick={() => del.mutate(g.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
