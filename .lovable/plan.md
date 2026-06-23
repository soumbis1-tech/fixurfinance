
# Family Expense Tracker — Build Plan

This is a very large app (17 modules, ~20 DB tables, 3 Edge Functions, AI chatbot, scheduled jobs). I can't build all of it in one shot reliably — credits and stability both suffer. I'd like to build it in clear phases, getting each phase working end-to-end before moving on.

## Tech stack (defaults)
- Frontend: React + TypeScript + Tailwind + shadcn/ui + Recharts, on the existing TanStack Start template
- Backend: **Lovable Cloud** (managed Supabase — DB, Auth, Storage, Edge Functions, cron). I'll never expose service-role or AI keys to the browser.
- AI: **Lovable AI Gateway** (covers chat + statement parsing). You won't need to bring your own OpenAI key — same Structured Outputs capability, billed via Lovable. If you'd rather use your own OpenAI key, say so and I'll wire that instead.
- Email: Resend via `EMAIL_PROVIDER_API_KEY` (I'll ask for the key when we reach Phase 5).

## Layout (per your sketch)
Fixed left sidebar · top-right options bar (family switcher, date range, settings, export, theme toggle, profile) · main content · right-side collapsible chatbot panel. Light/dark with persisted preference. INR + DD-MMM-YYYY defaults, changeable in Settings.

## Phases

**Phase 1 — Foundation (this build)**
- Enable Lovable Cloud
- Design system (light/dark tokens, finance-dashboard aesthetic — not purple)
- App shell: sidebar, top bar with theme toggle, main area, collapsible chatbot panel (stub)
- Auth: email/password + Google, password reset, `/auth` page, `_authenticated` gate
- DB schema for ALL 20 tables with RLS, indexes, `has_role` pattern, summary RPCs
- Family creation + invite + role assignment
- Settings page (currency, date format, theme)
- Categories seeded + keyword rules seeded from your Excel list
- Dashboard with empty-state + sample-data toggle

**Phase 2 — Manual entry, list, recurring, trips, credit card**
- Add Expense form (all fields, receipt upload to Storage)
- Expense list with all filters + edit/delete/duplicate/mark reimbursed + CSV export
- Recurring expenses + monthly paid/unpaid checklist + seed your static items (Parents, EMIs, SIP, etc.)
- Trips module + trip reports
- Credit card tracker

**Phase 3 — Imports**
- Text-file importer (3 line formats you listed) with preview/edit/duplicate detection
- Excel importer with column mapping + duplicate hash (date+amount+desc+source)
- Import history + undo last import
- Auto-categorization (rules first, AI fallback)

**Phase 4 — Bank statements**
- Storage bucket + upload UI (CSV/TXT/PDF/JPG/PNG)
- `parse-bank-statement` Edge Function — deterministic for CSV/TXT, AI Structured Outputs for PDF/image
- Review screen, account-number masking, debit-only default, credits-tab

**Phase 5 — Reports, budgets, weekly email**
- Reports screen (all breakdowns + custom range + CSV export + email)
- Budgets + progress bars + overspending alerts + goals/sinking funds
- `send-weekly-report` Edge Function + pg_cron schedule + "Send test now" button
- Subscription/recurring detector, audit log, data export/backup

**Phase 6 — Chatbot agent**
- Right-panel chat UI with history per family/user
- `chat-agent` Edge Function using AI Gateway with tool-calling against safe predefined report functions (no raw SQL from user text)
- Action buttons: Open report / Export CSV / Email report

## Two things I need from you before starting Phase 1

1. **AI provider**: Use Lovable AI Gateway (recommended, no key needed) or your own OpenAI key?
2. **Excel sample**: You mentioned an attached workbook but I only see the layout sketch. Please upload a sample `.xlsx` so the Phase 3 importer matches your real sheets. Not blocking Phase 1.

Reply "go" (and answer #1) and I'll start Phase 1.
