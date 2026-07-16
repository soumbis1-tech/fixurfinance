import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, resolveFamilyId, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_categories",
  title: "List categories",
  description: "List all expense categories for the family.",
  inputSchema: {
    family_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ family_id }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);
    try {
      const familyId = await resolveFamilyId(sb, ctx.getUserId()!, family_id);
      const { data, error } = await sb
        .from("categories")
        .select("id, name, sort_order")
        .eq("family_id", familyId)
        .order("sort_order")
        .order("name");
      if (error) return errorResult(error.message);
      return textResult(`Found ${data?.length ?? 0} categories.`, data);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
