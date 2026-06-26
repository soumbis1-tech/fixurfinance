import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Circle, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function SetupChecklist({ familyId }: { familyId: string | null }) {
  const [open, setOpen] = useState(true);

  const stats = useQuery({
    enabled: !!familyId,
    queryKey: ["setup_checklist", familyId],
    queryFn: async () => {
      const [members, expenses, settings] = await Promise.all([
        supabase.from("family_members").select("id", { count: "exact", head: true }).eq("family_id", familyId!),
        supabase.from("expenses").select("id", { count: "exact", head: true }).eq("family_id", familyId!),
        supabase.from("weekly_report_settings").select("enabled, recipients").eq("family_id", familyId!).maybeSingle(),
      ]);
      return {
        members: members.count ?? 0,
        expenses: expenses.count ?? 0,
        weeklyEnabled: !!settings.data?.enabled,
        weeklyHasRecipients: (settings.data?.recipients?.length ?? 0) > 0,
      };
    },
  });

  if (!familyId || !stats.data) return null;
  const s = stats.data;
  const items = [
    { done: s.members > 1, label: `Add family members (${s.members})`, href: "/settings#members" },
    { done: s.expenses > 0, label: `Record your first expense (${s.expenses})`, href: "/expenses/new" },
    { done: s.weeklyHasRecipients, label: "Configure weekly report recipients", href: "/settings#weekly" },
    { done: s.weeklyEnabled, label: "Enable the weekly email", href: "/settings#weekly" },
  ];
  const completed = items.filter((i) => i.done).length;
  if (completed === items.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <div className="text-sm font-semibold">Finish setting up</div>
          <div className="text-xs text-muted-foreground">{completed} of {items.length} done</div>
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="border-t border-border divide-y divide-border">
          {items.map((it) => (
            <li key={it.label} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {it.done ? <Check className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <a href={it.href} className={cn("flex-1 hover:underline", it.done && "text-muted-foreground line-through")}>
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
