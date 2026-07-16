import { auth, defineMcp } from "@lovable.dev/mcp-js";
import addExpense from "./tools/add-expense";
import getMonthSummary from "./tools/get-month-summary";
import listCategories from "./tools/list-categories";
import listPendingReimbursements from "./tools/list-pending-reimbursements";
import listRecentExpenses from "./tools/list-recent-expenses";

// The OAuth issuer MUST be the direct Supabase host. On publish, SUPABASE_URL
// is rewritten to the `.lovable.cloud` proxy which mcp-js rejects (RFC 8414
// issuer mismatch). The project ref survives publish unchanged.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "family-expense-tracker-mcp",
  title: "Family Expense Tracker",
  version: "0.1.0",
  instructions:
    "Tools for a household expense tracker. Use list_recent_expenses and get_month_summary to answer spending questions, list_categories to see valid categories, add_expense to record a new expense as the signed-in user, and list_pending_reimbursements to find unpaid reimbursables. Every tool acts as the authenticated app user; row-level security scopes results to their families.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listRecentExpenses,
    getMonthSummary,
    listCategories,
    addExpense,
    listPendingReimbursements,
  ],
});
