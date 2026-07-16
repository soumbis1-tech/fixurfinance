import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, resolveFamilyId, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_pending_reimbursements",
  title: "List pending reimbursements",
  description: "List expenses marked reimbursable whose reimbursement is still pending.",
  inputSchema: {
    family_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ family_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);
    try {
      const familyId = await resolveFamilyId(sb, ctx.getUserId()!, family_id);
      const { data, error } = await sb
        .from("expenses")
        .select("id, date, amount, description, paid_by")
        .eq("family_id", familyId)
        .eq("reimbursable", true)
        .eq("reimbursement_status", "pending")
        .order("date", { ascending: false })
        .limit(limit);
      if (error) return errorResult(error.message);
      const total = (data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      return textResult(
        `Found ${data?.length ?? 0} pending reimbursable expenses, total ${total}.`,
        data,
      );
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
