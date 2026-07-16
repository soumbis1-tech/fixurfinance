import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, resolveFamilyId, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_recent_expenses",
  title: "List recent expenses",
  description:
    "List the most recent expenses in the signed-in user's family. Optionally filter by number of days back and result limit.",
  inputSchema: {
    days: z.number().int().min(1).max(365).default(30).describe("Number of days back to include."),
    limit: z.number().int().min(1).max(200).default(50).describe("Max rows to return."),
    family_id: z.string().uuid().optional().describe("Family ID (defaults to your default family)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ days, limit, family_id }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);
    try {
      const familyId = await resolveFamilyId(sb, ctx.getUserId()!, family_id);
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await sb
        .from("expenses")
        .select("id, date, amount, description, type, reimbursable, category_id, paid_by")
        .eq("family_id", familyId)
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: false })
        .limit(limit);
      if (error) return errorResult(error.message);
      return textResult(
        `Found ${data?.length ?? 0} expenses in the last ${days} days.`,
        data,
      );
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
