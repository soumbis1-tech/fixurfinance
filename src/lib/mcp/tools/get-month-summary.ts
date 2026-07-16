import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, resolveFamilyId, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "get_month_summary",
  title: "Get month summary",
  description:
    "Return total, expense, investment, and pending-reimbursable amounts for the family for a given year and month.",
  inputSchema: {
    year: z.number().int().min(2000).max(2100).describe("4-digit year, e.g. 2026."),
    month: z.number().int().min(1).max(12).describe("Month 1-12."),
    family_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ year, month, family_id }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);
    try {
      const familyId = await resolveFamilyId(sb, ctx.getUserId()!, family_id);
      const { data, error } = await sb.rpc("monthly_summary", {
        _family_id: familyId,
        _year: year,
        _month: month,
      });
      if (error) return errorResult(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return textResult(
        `Summary for ${year}-${String(month).padStart(2, "0")}: total ${row?.total ?? 0}, expense ${row?.expense_total ?? 0}, investment ${row?.investment_total ?? 0}, pending reimbursable ${row?.reimbursable_total ?? 0}.`,
        row,
      );
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
