import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const familyOnly = z.object({ familyId: z.string().uuid() });

export const sendTestWeeklyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => familyOnly.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { buildWeeklyReport, renderWeeklyReportHtml, sendEmail } = await import("./weekly-report.server");

    // Confirm membership via RLS-scoped read
    const { data: settings } = await supabase
      .from("weekly_report_settings")
      .select("recipients")
      .eq("family_id", data.familyId)
      .maybeSingle();
    if (!settings) throw new Error("Configure recipients first.");
    if (!settings.recipients?.length) throw new Error("Add at least one recipient email.");

    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400 * 1000);
    const report = await buildWeeklyReport(
      supabase,
      data.familyId,
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
    );
    const html = renderWeeklyReportHtml(report);

    const result = await sendEmail({
      to: settings.recipients,
      subject: `[Test] ${report.family.name} weekly report`,
      html,
    });

    await supabase.from("weekly_report_runs").insert({
      family_id: data.familyId,
      period_start: report.periodStart,
      period_end: report.periodEnd,
      recipients: settings.recipients,
      status: result.sent ? "sent" : "failed",
      error: result.error ?? null,
    });

    return result;
  });
