ALTER TABLE public.payment_accounts
  ADD COLUMN IF NOT EXISTS beneficiary_name text;