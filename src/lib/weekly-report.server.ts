// Server-only helpers for building & sending the weekly report.
import type { SupabaseClient } from "@supabase/supabase-js";

export type WeeklyReport = {
  family: { id: string; name: string; currency: string };
  periodStart: string;
  periodEnd: string;
  total: number;
  topCategories: { name: string; total: number }[];
  topMembers: { name: string; total: number }[];
  reimbursable: { description: string; amount: number; date: string }[];
  recurringUnpaid: { item: string; amount: number; due_day: number }[];
};

export async function buildWeeklyReport(
  client: SupabaseClient,
  familyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<WeeklyReport> {
  const { data: fam } = await client
    .from("families")
    .select("id, name, currency")
    .eq("id", familyId)
    .single();
  if (!fam) throw new Error("Family not found");

  const [cats, members, exps, reimb, recurring] = await Promise.all([
    client.rpc("category_summary", { _family_id: familyId, _start: periodStart, _end: periodEnd }),
    client.rpc("member_summary", { _family_id: familyId, _start: periodStart, _end: periodEnd }),
    client.from("expenses").select("amount, type").eq("family_id", familyId)
      .gte("date", periodStart).lte("date", periodEnd).eq("type", "expense"),
    client.from("expenses").select("date, description, amount").eq("family_id", familyId)
      .eq("reimbursable", true).neq("reimbursement_status", "reimbursed").limit(20),
    client.from("recurring_expenses").select("item, amount, due_day").eq("family_id", familyId).eq("active", true),
  ]);

  const total = (exps.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  return {
    family: { id: fam.id, name: fam.name, currency: fam.currency },
    periodStart,
    periodEnd,
    total,
    topCategories: (cats.data ?? [])
      .filter((c: { total: number }) => Number(c.total) > 0)
      .slice(0, 6)
      .map((c: { category_name: string; total: number }) => ({ name: c.category_name, total: Number(c.total) })),
    topMembers: (members.data ?? [])
      .filter((m: { total: number }) => Number(m.total) > 0)
      .map((m: { member_name: string; total: number }) => ({ name: m.member_name, total: Number(m.total) })),
    reimbursable: (reimb.data ?? []).map((r) => ({ description: r.description, amount: Number(r.amount), date: r.date })),
    recurringUnpaid: (recurring.data ?? []).map((r) => ({ item: r.item, amount: Number(r.amount), due_day: r.due_day })),
  };
}

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Sanitize values used in email header fields (e.g. Subject). Strips CR/LF to
// prevent header injection and control characters that some clients render badly.
export const sanitizeEmailHeader = (s: unknown): string =>
  String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/[\x00-\x1F\x7F]/g, "").trim();

export function renderWeeklyReportHtml(r: WeeklyReport): string {
  const fmt = (n: number) => `${esc(r.family.currency)} ${Math.round(n).toLocaleString("en-IN")}`;
  const li = (rows: { l: string; v: string }[]) =>
    rows.map(({ l, v }) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${l}</td><td style="padding:6px 10px;text-align:right;border-bottom:1px solid #eee"><b>${v}</b></td></tr>`).join("");

  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:640px;margin:auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 4px">${esc(r.family.name)} — Weekly Report</h2>
    <div style="color:#64748b;font-size:14px;margin-bottom:16px">${esc(r.periodStart)} → ${esc(r.periodEnd)}</div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="font-size:12px;text-transform:uppercase;color:#64748b">Total spent</div>
      <div style="font-size:28px;font-weight:700">${fmt(r.total)}</div>
    </div>
    <h3 style="margin:16px 0 8px">Top categories</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>
      ${li(r.topCategories.map((c) => ({ l: esc(c.name), v: fmt(c.total) })))}
      ${r.topCategories.length === 0 ? '<tr><td style="padding:6px 10px;color:#64748b">No spending this period.</td></tr>' : ""}
    </tbody></table>
    <h3 style="margin:20px 0 8px">By member</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>
      ${li(r.topMembers.map((m) => ({ l: esc(m.name), v: fmt(m.total) })))}
    </tbody></table>
    ${r.reimbursable.length ? `<h3 style="margin:20px 0 8px">Pending reimbursements</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>
        ${li(r.reimbursable.slice(0, 10).map((x) => ({ l: `${esc(x.date)} — ${esc(x.description)}`, v: fmt(x.amount) })))}
      </tbody></table>` : ""}
    ${r.recurringUnpaid.length ? `<h3 style="margin:20px 0 8px">Recurring items</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>
        ${li(r.recurringUnpaid.slice(0, 10).map((x) => ({ l: `${esc(x.item)} (due day ${x.due_day})`, v: fmt(x.amount) })))}
      </tbody></table>` : ""}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">Family Expense Tracker · automatic weekly digest</p>
  </body></html>`;
}

export async function sendEmail(opts: { to: string[]; subject: string; html: string }): Promise<{ sent: boolean; provider: string; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const from = process.env.RESEND_FROM || "Family Expense Tracker <onboarding@resend.dev>";
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { sent: false, provider: "resend", error: `${resp.status}: ${t}` };
    }
    return { sent: true, provider: "resend" };
  }
  return { sent: false, provider: "none", error: "No email provider configured (set RESEND_API_KEY)" };
}
