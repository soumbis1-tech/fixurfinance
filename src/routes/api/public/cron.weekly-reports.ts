import { createFileRoute } from "@tanstack/react-router";

// POST /api/public/cron/weekly-reports — invoked by an external scheduler.
// Requires header `x-cron-secret: <CRON_SECRET>` to match the env var.
// On match, iterates all enabled weekly_report_settings rows and sends.

export const Route = createFileRoute("/api/public/cron/weekly-reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!secret || !provided || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { buildWeeklyReport, renderWeeklyReportHtml, sendEmail } = await import(
          "@/lib/weekly-report.server"
        );

        const { data: settingsRows, error } = await supabaseAdmin
          .from("weekly_report_settings")
          .select("family_id, recipients, enabled");
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const end = new Date();
        const start = new Date(end.getTime() - 7 * 86400 * 1000);
        const endIso = end.toISOString().slice(0, 10);
        const startIso = start.toISOString().slice(0, 10);

        const results: { familyId: string; status: string; error?: string }[] = [];
        for (const s of settingsRows ?? []) {
          if (!s.enabled || !s.recipients?.length) continue;
          try {
            const report = await buildWeeklyReport(supabaseAdmin, s.family_id, startIso, endIso);
            const html = renderWeeklyReportHtml(report);
            const r = await sendEmail({
              to: s.recipients,
              subject: `${report.family.name} weekly report — ${startIso} → ${endIso}`,
              html,
            });
            await supabaseAdmin.from("weekly_report_runs").insert({
              family_id: s.family_id,
              period_start: startIso,
              period_end: endIso,
              recipients: s.recipients,
              status: r.sent ? "sent" : "failed",
              error: r.error ?? null,
            });
            results.push({ familyId: s.family_id, status: r.sent ? "sent" : "failed", error: r.error });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await supabaseAdmin.from("weekly_report_runs").insert({
              family_id: s.family_id,
              period_start: startIso,
              period_end: endIso,
              recipients: s.recipients,
              status: "failed",
              error: msg,
            });
            results.push({ familyId: s.family_id, status: "failed", error: msg });
          }
        }
        return Response.json({ ok: true, count: results.length, results });
      },
    },
  },
});
