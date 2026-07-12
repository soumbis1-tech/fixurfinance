
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Backfill dedupe_hash for existing expenses (matches client formula:
-- sha256 of `${family_id}|${iso_date}|${amount.toFixed(2)}|${lower(trim(description))}`)
UPDATE public.expenses
SET dedupe_hash = encode(
  digest(
    family_id::text || '|' ||
    to_char(date, 'YYYY-MM-DD') || '|' ||
    to_char(amount, 'FM999999999990.00') || '|' ||
    lower(btrim(COALESCE(description, ''))),
    'sha256'
  ),
  'hex'
)
WHERE dedupe_hash IS NULL;

-- Trigger to auto-populate on future inserts if missing
CREATE OR REPLACE FUNCTION public.set_expense_dedupe_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.dedupe_hash IS NULL OR NEW.dedupe_hash = '' THEN
    NEW.dedupe_hash := encode(
      digest(
        NEW.family_id::text || '|' ||
        to_char(NEW.date, 'YYYY-MM-DD') || '|' ||
        to_char(NEW.amount, 'FM999999999990.00') || '|' ||
        lower(btrim(COALESCE(NEW.description, ''))),
        'sha256'
      ),
      'hex'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_expense_dedupe_hash ON public.expenses;
CREATE TRIGGER trg_set_expense_dedupe_hash
BEFORE INSERT OR UPDATE OF date, amount, description, family_id
ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.set_expense_dedupe_hash();
