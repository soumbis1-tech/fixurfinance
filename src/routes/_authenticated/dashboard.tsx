import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { formatMoney, formatDate } from "@/lib/format";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, format } from "date-fns";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Wallet, TrendingUp, Calendar, Receipt, PiggyBank, RefreshCw, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Family Expense Tracker" },
      { name: "description", content: "Spending overview for your family." },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const { hasFamily, isLoading: famLoading, activeFamily } = useActiveFamily();

  useEffect(() => {
    if (!famLoading && !hasFamily) navigate({ to: "/onboarding" });
  }, [famLoading, hasFamily, navigate]);

  const familyId = activeFamily?.id;
  const today = new Date();
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const todayISO = format(today, "yyyy-MM-dd");

  const monthly = useQuery({
    enabled: !!familyId,
    queryKey: ["monthly_summary", familyId, today.getFullYear(), today.getMonth() + 1],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monthly_summary", {
        _family_id: familyId!,
        _year: today.getFullYear(),
        _month: today.getMonth() + 1,
      });
      if (error) throw error;
      return data?.[0] ?? { total: 0, expense_total: 0, investment_total: 0, reimbursable_total: 0 };
    },
  });

  const weekTotal = useQuery({
    enabled: !!familyId,
    queryKey: ["week_total", familyId, weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount")
        .eq("family_id", familyId!)
        .eq("type", "expense")
        .gte("date", weekStart)
        .lte("date", weekEnd);
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    },
  });

  const todayTotal = useQuery({
    enabled: !!familyId,
    queryKey: ["today_total", familyId, todayISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount")
        .eq("family_id", familyId!)
        .eq("type", "expense")
        .eq("date", todayISO);
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    },
  });

  const categories = useQuery({
    enabled: !!familyId,
    queryKey: ["category_summary", familyId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("category_summary", {
        _family_id: familyId!,
        _start: monthStart,
        _end: monthEnd,
      });
      if (error) throw error;
      return (data ?? []).filter((c: { total: number }) => Number(c.total) > 0);
    },
  });

  const members = useQuery({
    enabled: !!familyId,
    queryKey: ["member_summary", familyId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("member_summary", {
        _family_id: familyId!,
        _start: monthStart,
        _end: monthEnd,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const daily = useQuery({
    enabled: !!familyId,
    queryKey: ["daily_summary", familyId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("daily_summary", {
        _family_id: familyId!,
        _start: monthStart,
        _end: monthEnd,
      });
      if (error) throw error;
      return (data ?? []).map((r: { day: string; total: number }) => ({
        day: format(new Date(r.day), "d MMM"),
        total: Number(r.total),
      }));
    },
  });

  const recent = useQuery({
    enabled: !!familyId,
    queryKey: ["recent_expenses", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, date, description, amount, type")
        .eq("family_id", familyId!)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const recurringUnpaid = useQuery({
    enabled: !!familyId,
    queryKey: ["recurring_unpaid", familyId, today.getFullYear(), today.getMonth() + 1],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_payment_status")
        .select("status")
        .eq("family_id", familyId!)
        .eq("period_year", today.getFullYear())
        .eq("period_month", today.getMonth() + 1);
      if (error) throw error;
      const paid = (data ?? []).filter((r) => r.status === "paid").length;
      const due = (data ?? []).filter((r) => r.status !== "paid").length;
      return { paid, due };
    },
  });

  const currency = activeFamily?.currency ?? "INR";
  const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

  if (famLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (!hasFamily) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(today)} · {activeFamily?.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="This month"
          value={formatMoney(monthly.data?.total ?? 0, currency)}
          icon={TrendingUp}
        />
        <StatCard
          label="This week"
          value={formatMoney(weekTotal.data ?? 0, currency)}
          icon={Calendar}
        />
        <StatCard
          label="Today"
          value={formatMoney(todayTotal.data ?? 0, currency)}
          icon={Receipt}
        />
        <StatCard
          label="Investments (mo)"
          value={formatMoney(monthly.data?.investment_total ?? 0, currency)}
          icon={PiggyBank}
        />
        <StatCard
          label="Reimbursable pending"
          value={formatMoney(monthly.data?.reimbursable_total ?? 0, currency)}
          icon={RefreshCw}
        />
        <StatCard
          label="Recurring paid / due"
          value={`${recurringUnpaid.data?.paid ?? 0} / ${recurringUnpaid.data?.due ?? 0}`}
          icon={Wallet}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Daily spending — {format(today, "MMMM yyyy")}</h3>
          <div className="h-64">
            {(daily.data?.length ?? 0) === 0 ? (
              <EmptyChart text="No expenses yet this month" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(v: number) => formatMoney(v, currency)}
                  />
                  <Bar dataKey="total" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">By category</h3>
          <div className="h-64">
            {(categories.data?.length ?? 0) === 0 ? (
              <EmptyChart text="Add expenses to see categories" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categories.data}
                    dataKey="total"
                    nameKey="category_name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {categories.data?.map((_: unknown, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(v: number) => formatMoney(v, currency)}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Top members this month</h3>
          {(members.data?.filter((m: { total: number }) => Number(m.total) > 0).length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No spending recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {members.data
                ?.filter((m: { total: number }) => Number(m.total) > 0)
                .slice(0, 6)
                .map((m: { member_id: string; member_name: string; total: number }) => (
                  <li
                    key={m.member_id}
                    className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0"
                  >
                    <span>{m.member_name}</span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(m.total, currency)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Recent transactions</h3>
          {(recent.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add an expense or import a file to get started.
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.data?.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="truncate">{r.description}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(r.date)}</div>
                  </div>
                  <span className="tabular-nums font-medium">
                    {formatMoney(r.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
      {text}
    </div>
  );
}
