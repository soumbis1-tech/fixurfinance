import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, resolveFamilyId, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "add_expense",
  title: "Add an expense",
  description:
    "Add an expense to the family. If category_id or paid_by are omitted, sensible defaults are chosen from the family (Miscellaneous / the caller's linked member).",
  inputSchema: {
    date: z.string().describe("Expense date in YYYY-MM-DD."),
    amount: z.number().positive().describe("Amount in the family currency."),
    description: z.string().min(1).describe("Short description of the expense."),
    type: z.enum(["expense", "investment"]).default("expense"),
    reimbursable: z.boolean().default(false),
    comments: z.string().optional(),
    category_id: z.string().uuid().optional(),
    paid_by: z.string().uuid().optional().describe("family_members.id"),
    payment_account_id: z.string().uuid().optional(),
    family_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;
    try {
      const familyId = await resolveFamilyId(sb, userId, input.family_id);

      let categoryId = input.category_id;
      if (!categoryId) {
        const { data: cat } = await sb
          .from("categories")
          .select("id")
          .eq("family_id", familyId)
          .ilike("name", "Miscellaneous")
          .maybeSingle();
        categoryId = cat?.id;
      }

      let paidBy = input.paid_by;
      if (!paidBy) {
        const { data: mem } = await sb
          .from("family_members")
          .select("id")
          .eq("family_id", familyId)
          .eq("user_id", userId)
          .maybeSingle();
        paidBy = mem?.id;
      }

      if (!categoryId || !paidBy) {
        return errorResult("Could not resolve default category or member. Pass category_id and paid_by explicitly.");
      }

      const { data, error } = await sb
        .from("expenses")
        .insert({
          family_id: familyId,
          date: input.date,
          amount: input.amount,
          description: input.description,
          type: input.type,
          reimbursable: input.reimbursable,
          comments: input.comments ?? null,
          category_id: categoryId,
          paid_by: paidBy,
          payment_account_id: input.payment_account_id ?? null,
          created_by: userId,
        })
        .select("id, date, amount, description")
        .single();
      if (error) return errorResult(error.message);
      return textResult(`Added expense of ${data.amount} on ${data.date}.`, data);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
