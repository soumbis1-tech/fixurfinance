CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.set_expense_dedupe_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.dedupe_hash IS NULL OR NEW.dedupe_hash = '' THEN
    NEW.dedupe_hash := encode(
      extensions.digest(
        (NEW.family_id::text || '|' ||
         to_char(NEW.date, 'YYYY-MM-DD') || '|' ||
         to_char(NEW.amount, 'FM999999999990.00') || '|' ||
         lower(btrim(COALESCE(NEW.description, ''))))::bytea,
        'sha256'
      ),
      'hex'
    );
  END IF;
  RETURN NEW;
END;
$function$;