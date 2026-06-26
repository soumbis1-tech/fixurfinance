
-- =========================================
-- Family invitations
-- =========================================
CREATE TABLE IF NOT EXISTS public.family_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.family_role NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_invitations_family_idx ON public.family_invitations(family_id);
CREATE INDEX IF NOT EXISTS family_invitations_email_idx ON public.family_invitations(lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_invitations TO authenticated;
GRANT ALL ON public.family_invitations TO service_role;

ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;

-- Admins/owners of the family can manage invites
CREATE POLICY "Family admins manage invitations"
  ON public.family_invitations FOR ALL
  TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin']::public.family_role[]));

-- Signed-in invitee can read a pending invite addressed to their email
CREATE POLICY "Invitee can read own pending invite"
  ON public.family_invitations FOR SELECT
  TO authenticated
  USING (status = 'pending' AND lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), '')));

CREATE TRIGGER trg_family_invitations_updated
  BEFORE UPDATE ON public.family_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- Accept invitation RPC
-- =========================================
CREATE OR REPLACE FUNCTION public.accept_family_invitation(_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _email TEXT := lower(COALESCE(auth.jwt() ->> 'email', ''));
  _inv RECORD;
  _fname TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _inv FROM public.family_invitations WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF _inv.status <> 'pending' THEN RAISE EXCEPTION 'Invitation is %', _inv.status; END IF;
  IF _inv.expires_at < now() THEN
    UPDATE public.family_invitations SET status='expired' WHERE id = _inv.id;
    RAISE EXCEPTION 'Invitation expired';
  END IF;
  IF lower(_inv.email) <> _email THEN
    RAISE EXCEPTION 'This invitation was sent to %, but you are signed in as %', _inv.email, _email;
  END IF;

  -- Add role (idempotent on (family_id,user_id))
  INSERT INTO public.family_user_roles(family_id, user_id, role)
  VALUES (_inv.family_id, _uid, _inv.role)
  ON CONFLICT (family_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Add a linked family_member if none yet
  SELECT full_name INTO _fname FROM public.profiles WHERE id = _uid;
  IF NOT EXISTS (SELECT 1 FROM public.family_members WHERE family_id = _inv.family_id AND user_id = _uid) THEN
    INSERT INTO public.family_members(family_id, display_name, user_id)
    VALUES (_inv.family_id, COALESCE(_fname, split_part(_email, '@', 1), 'Member'), _uid);
  END IF;

  UPDATE public.family_invitations
     SET status='accepted', accepted_by=_uid, accepted_at=now()
   WHERE id = _inv.id;

  RETURN _inv.family_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.accept_family_invitation(TEXT) TO authenticated;

-- =========================================
-- Lookup pending invite by token (read-only, used by accept-invite page before sign-in check)
-- =========================================
CREATE OR REPLACE FUNCTION public.invitation_preview(_token TEXT)
RETURNS TABLE(family_name TEXT, email TEXT, role public.family_role, status TEXT, expires_at TIMESTAMPTZ)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.name, i.email, i.role, i.status, i.expires_at
  FROM public.family_invitations i
  JOIN public.families f ON f.id = i.family_id
  WHERE i.token = _token;
$$;

GRANT EXECUTE ON FUNCTION public.invitation_preview(TEXT) TO anon, authenticated;

-- =========================================
-- Sample data seeding (idempotent: skips if family already has expenses)
-- =========================================
CREATE OR REPLACE FUNCTION public.seed_family_sample_data(_family_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _count INT := 0;
  _existing INT;
  _member UUID;
  _categories UUID[];
  _cat UUID;
  _i INT;
  _day DATE;
  _amount NUMERIC;
  _descs TEXT[] := ARRAY[
    'Weekly groceries','Coffee shop','Dinner out','Uber ride','Fuel refill',
    'Electricity bill','Internet bill','Pharmacy','Vegetables','Fruits',
    'Chicken & fish','School snacks','Movie tickets','Online shopping','Gift for friend',
    'Mobile recharge','Doctor visit','Lunch with team','Ice cream','Bakery',
    'Home cleaning','Car wash','Newspaper','SIP investment','Donation'
  ];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_family_member(_family_id, _uid) THEN RAISE EXCEPTION 'Not a member of this family'; END IF;

  SELECT COUNT(*) INTO _existing FROM public.expenses WHERE family_id = _family_id;
  IF _existing > 0 THEN RETURN 0; END IF;

  SELECT id INTO _member FROM public.family_members WHERE family_id = _family_id AND user_id = _uid LIMIT 1;
  IF _member IS NULL THEN
    SELECT id INTO _member FROM public.family_members WHERE family_id = _family_id LIMIT 1;
  END IF;

  SELECT array_agg(id) INTO _categories FROM public.categories WHERE family_id = _family_id AND name <> 'Reimbursable';

  FOR _i IN 1..60 LOOP
    _day := (current_date - ((random() * 60)::INT));
    _amount := round((50 + random() * 1950)::numeric, 2);
    _cat := _categories[1 + floor(random() * array_length(_categories,1))::int];
    INSERT INTO public.expenses(family_id, date, amount, description, category_id, paid_by, type, created_by)
    VALUES (_family_id, _day, _amount, _descs[1 + floor(random() * array_length(_descs,1))::int], _cat, _member, 'expense', _uid);
    _count := _count + 1;
  END LOOP;

  -- Sample budgets for current month
  INSERT INTO public.budgets(family_id, category_id, year, month, amount, created_by)
  SELECT _family_id, c.id, EXTRACT(YEAR FROM current_date)::INT, EXTRACT(MONTH FROM current_date)::INT,
         (CASE c.name WHEN 'Groceries' THEN 15000 WHEN 'Outside Food' THEN 5000 WHEN 'Fuel and Transport' THEN 4000 ELSE 3000 END),
         _uid
  FROM public.categories c
  WHERE c.family_id = _family_id AND c.name IN ('Groceries','Outside Food','Fuel and Transport','Bills and Utilities')
  ON CONFLICT DO NOTHING;

  -- Sample goal
  INSERT INTO public.goals(family_id, name, target_amount, current_amount, target_date, created_by)
  VALUES (_family_id, 'Emergency Fund', 100000, 25000, current_date + interval '12 months', _uid)
  ON CONFLICT DO NOTHING;

  RETURN _count;
END; $$;

GRANT EXECUTE ON FUNCTION public.seed_family_sample_data(UUID) TO authenticated;
