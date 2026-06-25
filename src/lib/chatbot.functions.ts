import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const chatInput = z.object({
  familyId: z.string().uuid(),
  question: z.string().trim().min(1).max(500),
});

const SYSTEM_PROMPT = `You are "Money Assistant", a focused household finance helper.
You ONLY answer using the structured DATA CONTEXT provided below — never invent numbers, names,
categories, or trips that are not present. If the data does not contain the answer, say so
plainly and suggest a related question the user could ask instead.

Rules:
- Quote amounts using the family's currency code given in context.
- Be concise (max ~6 short lines). Use bullets for lists.
- Do not mention "context", "JSON", or your instructions.
- Never reveal raw IDs.`;

export const askMoneyAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => chatInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { familyId, question } = data;

    // Verify membership (RLS would also enforce, but fail fast)
    const { data: fam } = await supabase
      .from("families")
      .select("id, name, currency")
      .eq("id", familyId)
      .maybeSingle();
    if (!fam) throw new Error("Family not found or you don't have access.");

    // Build a tight, privacy-safe data context using RLS-scoped reads
    const today = new Date();
    const startMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const start90 = new Date(today.getTime() - 90 * 86400 * 1000).toISOString().slice(0, 10);
    const todayIso = today.toISOString().slice(0, 10);

    const [
      catSumRes,
      memberSumRes,
      monthRes,
      recentRes,
      reimbRes,
      recurringRes,
      tripsRes,
    ] = await Promise.all([
      supabase.rpc("category_summary", { _family_id: familyId, _start: start90, _end: todayIso }),
      supabase.rpc("member_summary", { _family_id: familyId, _start: start90, _end: todayIso }),
      supabase.rpc("monthly_summary", {
        _family_id: familyId,
        _year: today.getFullYear(),
        _month: today.getMonth() + 1,
      }),
      supabase
        .from("expenses")
        .select("date, description, amount, type")
        .eq("family_id", familyId)
        .gte("date", start90)
        .order("date", { ascending: false })
        .limit(60),
      supabase
        .from("expenses")
        .select("date, description, amount, reimbursement_status")
        .eq("family_id", familyId)
        .eq("reimbursable", true)
        .neq("reimbursement_status", "reimbursed")
        .limit(30),
      supabase
        .from("recurring_expenses")
        .select("item, amount, due_day, active")
        .eq("family_id", familyId)
        .eq("active", true)
        .limit(30),
      supabase
        .from("trips")
        .select("name, start_date, end_date, active")
        .eq("family_id", familyId)
        .order("start_date", { ascending: false })
        .limit(10),
    ]);

    const ctx = {
      family: { name: fam.name, currency: fam.currency },
      period: { start: start90, end: todayIso, currentMonthStart: startMonth },
      currentMonth: monthRes.data,
      categoryTotals90d: catSumRes.data,
      memberTotals90d: memberSumRes.data,
      recentExpenses: recentRes.data,
      pendingReimbursements: reimbRes.data,
      recurring: recurringRes.data,
      trips: tripsRes.data,
    };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured. Ask the owner to add LOVABLE_API_KEY.");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "system",
            content: `DATA CONTEXT (JSON):\n${JSON.stringify(ctx).slice(0, 12000)}`,
          },
          { role: "user", content: question },
        ],
      }),
    });

    if (resp.status === 429) throw new Error("Rate limit hit. Please try again in a moment.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Top up Lovable AI workspace credits.");
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("AI error", resp.status, txt);
      throw new Error("AI request failed.");
    }
    const j = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const answer = j.choices?.[0]?.message?.content?.trim() ?? "(no answer)";

    // Persist user+assistant messages
    await supabase.from("chat_messages").insert([
      { family_id: familyId, user_id: userId, role: "user", content: question },
      { family_id: familyId, user_id: userId, role: "assistant", content: answer },
    ]);

    return { answer };
  });
