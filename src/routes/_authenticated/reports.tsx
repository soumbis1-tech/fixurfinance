import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports" }] }),
  component: ReportsPage,
});

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#a855f7", "#14b8a6", "#eab308"];

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - 5, 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function ReportsPage() {
  const { activeFamily } = useActiveFamily();
  const familyId = activeFamily?.id;
  const currency = activeFamily?.currency ?? "INR";
  const [range, setRange] = useState(defaultRange);

  const dailyQ = useQuery({
    enabled: !!familyId,
    queryKey: ["daily_summary", familyId, range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("daily_summary", {
        _family_id: familyId!, _start: range.from, _end: range.to,
      });
      if (error) throw error;
      return (data ?? []) as { day: string; total: number }[];
    },
  });

  const catQ = useQuery({
    enabled: !!familyId,
    queryKey: ["cat_summary", familyId, range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("category_summary", {
        _family_id: familyId!, _start: range.from, _end: range.to,
      });
      if (error) throw error;
      return ((data ?? []) as { category_name: string; total: number }[]).filter((d) => Number(d.total) > 0);
    },
  });

  const memberQ = useQuery({
    enabled: !!familyId,
    queryKey: ["mem_summary", familyId, range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("member_summary", {
        _family_id: familyId!, _start: range.from, _end: range.to,
      });
      if (error) throw error;
      return ((data ?? []) as { member_name: string; total: number }[]).filter((d) => Number(d.total) > 0);
    },
  });

  // Monthly aggregation from daily series
  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dailyQ.data ?? []) {
      const k = d.day.slice(0, 7);
      map.set(k, (map.get(k) ?? 0) + Number(d.total));
    }
    return Array.from(map.entries()).map(([month, total]) => ({ month, total }));
  }, [dailyQ.data]);

  const total = (dailyQ.data ?? []).reduce((s, r) => s + Number(r.total), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Spending trends, category and member breakdowns.</p>
        </div>
        <div className="flex items-end gap-2">
          <div><Label className="text-xs">From</Label><Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></div>
          <Button variant="outline" onClick={() => setRange(defaultRange())}>Reset</Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Total in range" value={formatMoney(total, currency)} />
        <Stat label="Days with spend" value={`${(dailyQ.data ?? []).filter((d) => Number(d.total) > 0).length}`} />
        <Stat label="Categories" value={`${(catQ.data ?? []).length}`} />
      </div>

      <ChartCard title="Monthly trend">
        {monthly.length === 0 ? <Empty loading={dailyQ.isLoading} /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip {...tooltipStyle(currency)} />
              <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Daily spending">
          {(dailyQ.data ?? []).length === 0 ? <Empty loading={dailyQ.isLoading} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dailyQ.data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
                <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="By category">
          {(catQ.data ?? []).length === 0 ? <Empty loading={catQ.isLoading} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={catQ.data} dataKey="total" nameKey="category_name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {catQ.data?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="By member (Paid by)">
        {(memberQ.data ?? []).length === 0 ? <Empty loading={memberQ.isLoading} /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={memberQ.data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={12} />
              <YAxis dataKey="member_name" type="category" fontSize={12} width={120} />
              <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
              <Bar dataKey="total" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-medium mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ loading }: { loading: boolean }) {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
      {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</> : "No data in this range."}
    </div>
  );
}
