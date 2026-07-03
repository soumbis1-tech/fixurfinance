
ALTER TABLE public.recurring_payment_status ADD COLUMN IF NOT EXISTS period_index integer NOT NULL DEFAULT 1;
ALTER TABLE public.recurring_payment_status DROP CONSTRAINT IF EXISTS recurring_payment_status_recurring_id_period_year_period_mo_key;
ALTER TABLE public.recurring_payment_status ADD CONSTRAINT recurring_payment_status_recurring_period_idx_key UNIQUE (recurring_id, period_year, period_month, period_index);
