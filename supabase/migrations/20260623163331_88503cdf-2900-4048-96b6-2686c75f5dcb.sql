
-- ============ ENUMS ============
CREATE TYPE public.family_role AS ENUM ('owner','admin','member','viewer');
CREATE TYPE public.expense_type AS ENUM ('expense','investment','reimbursement','income','transfer');
CREATE TYPE public.expense_source AS ENUM ('manual','text_import','excel_import','bank_statement','recurring');
CREATE TYPE public.reimbursement_status AS ENUM ('not_applicable','pending','reimbursed');
CREATE TYPE public.credit_card_status AS ENUM ('unpaid','paid','reimbursed','disputed');
CREATE TYPE public.recurring_frequency AS ENUM ('monthly','quarterly','yearly','weekly');
CREATE TYPE public.recurring_status AS ENUM ('due','paid','skipped','overdue');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT, full_name TEXT, avatar_url TEXT, default_family_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile upsert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ FAMILIES ============
CREATE TABLE public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'INR',
  date_format TEXT NOT NULL DEFAULT 'dd-MMM-yyyy',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated;
GRANT ALL ON public.families TO service_role;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_families_updated BEFORE UPDATE ON public.families FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ FAMILY USER ROLES ============
CREATE TABLE public.family_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.family_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, user_id)
);
CREATE INDEX idx_fur_user ON public.family_user_roles(user_id);
CREATE INDEX idx_fur_family ON public.family_user_roles(family_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_user_roles TO authenticated;
GRANT ALL ON public.family_user_roles TO service_role;
ALTER TABLE public.family_user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_family_member(_family_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.family_user_roles WHERE family_id = _family_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_family_role(_family_id UUID, _user_id UUID, _roles public.family_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.family_user_roles WHERE family_id = _family_id AND user_id = _user_id AND role = ANY(_roles));
$$;

CREATE POLICY "families members read" ON public.families FOR SELECT TO authenticated USING (public.is_family_member(id, auth.uid()));
CREATE POLICY "families auth create" ON public.families FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "families admin update" ON public.families FOR UPDATE TO authenticated USING (public.has_family_role(id, auth.uid(), ARRAY['owner','admin']::public.family_role[]));
CREATE POLICY "families owner delete" ON public.families FOR DELETE TO authenticated USING (public.has_family_role(id, auth.uid(), ARRAY['owner']::public.family_role[]));

CREATE POLICY "fur read" ON public.family_user_roles FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "fur add" ON public.family_user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin']::public.family_role[])
              OR NOT EXISTS (SELECT 1 FROM public.family_user_roles fur2 WHERE fur2.family_id = family_user_roles.family_id));
CREATE POLICY "fur update" ON public.family_user_roles FOR UPDATE TO authenticated USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin']::public.family_role[]));
CREATE POLICY "fur delete" ON public.family_user_roles FOR DELETE TO authenticated USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin']::public.family_role[]));

-- ============ FAMILY MEMBERS ============
CREATE TABLE public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  color TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fm_family ON public.family_members(family_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fm read" ON public.family_members FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "fm write" ON public.family_members FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));
CREATE TRIGGER trg_fm_updated BEFORE UPDATE ON public.family_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CATEGORIES ============
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL, icon TEXT, color TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE, sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, name)
);
CREATE INDEX idx_cat_family ON public.categories(family_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat read" ON public.categories FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "cat write" ON public.categories FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));
CREATE TRIGGER trg_cat_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.category_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL, priority INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rules_family ON public.category_rules(family_id);
CREATE INDEX idx_rules_keyword ON public.category_rules(lower(keyword));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_rules TO authenticated;
GRANT ALL ON public.category_rules TO service_role;
ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rules read" ON public.category_rules FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "rules write" ON public.category_rules FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));

-- ============ PAYMENT ACCOUNTS ============
CREATE TABLE public.payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'cash',
  masked_number TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pa_family ON public.payment_accounts(family_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_accounts TO authenticated;
GRANT ALL ON public.payment_accounts TO service_role;
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pa read" ON public.payment_accounts FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "pa write" ON public.payment_accounts FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));
CREATE TRIGGER trg_pa_updated BEFORE UPDATE ON public.payment_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TRIPS ============
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL, start_date DATE, end_date DATE, notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trips_family ON public.trips(family_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips read" ON public.trips FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "trips write" ON public.trips FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));
CREATE TRIGGER trg_trips_updated BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ IMPORT FILES ============
CREATE TABLE public.import_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  source public.expense_source NOT NULL,
  file_name TEXT, storage_path TEXT, mime_type TEXT,
  row_count INT NOT NULL DEFAULT 0, imported_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_if_family ON public.import_files(family_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_files TO authenticated;
GRANT ALL ON public.import_files TO service_role;
ALTER TABLE public.import_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "if read" ON public.import_files FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "if write" ON public.import_files FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));

-- ============ EXPENSES ============
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  date DATE NOT NULL, description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  paid_by UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  type public.expense_type NOT NULL DEFAULT 'expense', comments TEXT,
  source public.expense_source NOT NULL DEFAULT 'manual',
  reimbursable BOOLEAN NOT NULL DEFAULT FALSE,
  reimbursement_status public.reimbursement_status NOT NULL DEFAULT 'not_applicable',
  trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  receipt_path TEXT,
  import_file_id UUID REFERENCES public.import_files(id) ON DELETE SET NULL,
  dedupe_hash TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exp_family_date ON public.expenses(family_id, date DESC);
CREATE INDEX idx_exp_category ON public.expenses(category_id);
CREATE INDEX idx_exp_paid_by ON public.expenses(paid_by);
CREATE INDEX idx_exp_source ON public.expenses(source);
CREATE INDEX idx_exp_amount ON public.expenses(amount);
CREATE INDEX idx_exp_dedupe ON public.expenses(family_id, dedupe_hash);
CREATE INDEX idx_exp_trip ON public.expenses(trip_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exp read" ON public.expenses FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "exp write" ON public.expenses FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));
CREATE TRIGGER trg_exp_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RECURRING ============
CREATE TABLE public.recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  item TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL,
  paid_by UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  type public.expense_type NOT NULL DEFAULT 'expense',
  frequency public.recurring_frequency NOT NULL DEFAULT 'monthly',
  due_day INT NOT NULL DEFAULT 1, active BOOLEAN NOT NULL DEFAULT TRUE,
  auto_create BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_days INT NOT NULL DEFAULT 2, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rec_family ON public.recurring_expenses(family_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expenses TO authenticated;
GRANT ALL ON public.recurring_expenses TO service_role;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec read" ON public.recurring_expenses FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "rec write" ON public.recurring_expenses FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));
CREATE TRIGGER trg_rec_updated BEFORE UPDATE ON public.recurring_expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.recurring_payment_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  recurring_id UUID NOT NULL REFERENCES public.recurring_expenses(id) ON DELETE CASCADE,
  period_year INT NOT NULL, period_month INT NOT NULL,
  status public.recurring_status NOT NULL DEFAULT 'due',
  paid_on DATE, expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recurring_id, period_year, period_month)
);
CREATE INDEX idx_rps_family ON public.recurring_payment_status(family_id, period_year, period_month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_payment_status TO authenticated;
GRANT ALL ON public.recurring_payment_status TO service_role;
ALTER TABLE public.recurring_payment_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rps read" ON public.recurring_payment_status FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "rps write" ON public.recurring_payment_status FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));
CREATE TRIGGER trg_rps_updated BEFORE UPDATE ON public.recurring_payment_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CREDIT CARD ============
CREATE TABLE public.credit_card_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  item TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL, date DATE NOT NULL,
  status public.credit_card_status NOT NULL DEFAULT 'unpaid',
  linked_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cc_family ON public.credit_card_items(family_id, date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_card_items TO authenticated;
GRANT ALL ON public.credit_card_items TO service_role;
ALTER TABLE public.credit_card_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc read" ON public.credit_card_items FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "cc write" ON public.credit_card_items FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));
CREATE TRIGGER trg_cc_updated BEFORE UPDATE ON public.credit_card_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ IMPORT STAGING + BANK TXNS ============
CREATE TABLE public.import_staging_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  import_file_id UUID NOT NULL REFERENCES public.import_files(id) ON DELETE CASCADE,
  raw JSONB NOT NULL, parsed JSONB,
  is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  accepted BOOLEAN NOT NULL DEFAULT TRUE, error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_isr_file ON public.import_staging_rows(import_file_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_staging_rows TO authenticated;
GRANT ALL ON public.import_staging_rows TO service_role;
ALTER TABLE public.import_staging_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "isr read" ON public.import_staging_rows FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "isr write" ON public.import_staging_rows FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));

CREATE TABLE public.bank_statement_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  import_file_id UUID NOT NULL REFERENCES public.import_files(id) ON DELETE CASCADE,
  transaction_date DATE, description TEXT,
  debit_amount NUMERIC(14,2), credit_amount NUMERIC(14,2), amount NUMERIC(14,2),
  transaction_type TEXT, account_name TEXT, reference_number TEXT,
  suggested_category TEXT, confidence NUMERIC(4,3), raw_text TEXT,
  imported_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  accepted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bst_family ON public.bank_statement_transactions(family_id);
CREATE INDEX idx_bst_file ON public.bank_statement_transactions(import_file_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_transactions TO authenticated;
GRANT ALL ON public.bank_statement_transactions TO service_role;
ALTER TABLE public.bank_statement_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bst read" ON public.bank_statement_transactions FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "bst write" ON public.bank_statement_transactions FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));

-- ============ BUDGETS + GOALS ============
CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  period_year INT NOT NULL, period_month INT NOT NULL,
  amount NUMERIC(14,2) NOT NULL, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, category_id, period_year, period_month)
);
CREATE INDEX idx_budgets_family ON public.budgets(family_id, period_year, period_month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bud read" ON public.budgets FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "bud write" ON public.budgets FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));
CREATE TRIGGER trg_bud_updated BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL, target_amount NUMERIC(14,2) NOT NULL,
  current_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  target_date DATE, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_goals_family ON public.goals(family_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals read" ON public.goals FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "goals write" ON public.goals FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin','member']::public.family_role[]));
CREATE TRIGGER trg_goals_updated BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ WEEKLY REPORT ============
CREATE TABLE public.weekly_report_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  day_of_week INT NOT NULL DEFAULT 1, hour_of_day INT NOT NULL DEFAULT 9,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  include_charts BOOLEAN NOT NULL DEFAULT TRUE,
  include_top_categories BOOLEAN NOT NULL DEFAULT TRUE,
  include_reimbursable BOOLEAN NOT NULL DEFAULT TRUE,
  include_recurring_unpaid BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_report_settings TO authenticated;
GRANT ALL ON public.weekly_report_settings TO service_role;
ALTER TABLE public.weekly_report_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wrs read" ON public.weekly_report_settings FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "wrs write" ON public.weekly_report_settings FOR ALL TO authenticated
  USING (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin']::public.family_role[]))
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin']::public.family_role[]));
CREATE TRIGGER trg_wrs_updated BEFORE UPDATE ON public.weekly_report_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.weekly_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start DATE NOT NULL, period_end DATE NOT NULL,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sent', error TEXT
);
CREATE INDEX idx_wrr_family ON public.weekly_report_runs(family_id, ran_at DESC);
GRANT SELECT, INSERT ON public.weekly_report_runs TO authenticated;
GRANT ALL ON public.weekly_report_runs TO service_role;
ALTER TABLE public.weekly_report_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wrr read" ON public.weekly_report_runs FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "wrr insert" ON public.weekly_report_runs FOR INSERT TO authenticated
  WITH CHECK (public.has_family_role(family_id, auth.uid(), ARRAY['owner','admin']::public.family_role[]));

-- ============ CHAT ============
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL, metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cm_family_user ON public.chat_messages(family_id, user_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm read own" ON public.chat_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_family_member(family_id, auth.uid()));
CREATE POLICY "cm insert own" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_family_member(family_id, auth.uid()));
CREATE POLICY "cm delete own" ON public.chat_messages FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ AUDIT + USER SETTINGS ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL, entity TEXT, entity_id UUID, details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_family ON public.audit_logs(family_id, created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit read" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "audit insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_family_member(family_id, auth.uid()));

CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system',
  preferred_currency TEXT NOT NULL DEFAULT 'INR',
  date_format TEXT NOT NULL DEFAULT 'dd-MMM-yyyy',
  chatbot_collapsed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "us own" ON public.user_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_us_updated BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SEED FN ============
CREATE OR REPLACE FUNCTION public.seed_family_defaults(_family_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cat_groceries UUID; cat_outside UUID; cat_meat UUID; cat_fruit UUID;
  cat_health UUID; cat_fuel UUID; cat_bills UUID; cat_emi UUID;
  cat_ins UUID; cat_home UUID; cat_travel UUID; cat_shop UUID;
  cat_gift UUID; cat_invest UUID; cat_reimb UUID; cat_cc UUID; cat_misc UUID;
BEGIN
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Groceries',true,1) RETURNING id INTO cat_groceries;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Outside Food',true,2) RETURNING id INTO cat_outside;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Meat and Fish',true,3) RETURNING id INTO cat_meat;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Fruits and Vegetables',true,4) RETURNING id INTO cat_fruit;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Healthcare',true,5) RETURNING id INTO cat_health;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Fuel and Transport',true,6) RETURNING id INTO cat_fuel;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Bills and Utilities',true,7) RETURNING id INTO cat_bills;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'EMI and Loans',true,8) RETURNING id INTO cat_emi;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Insurance',true,9) RETURNING id INTO cat_ins;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Home Services',true,10) RETURNING id INTO cat_home;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Travel and Trip',true,11) RETURNING id INTO cat_travel;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Shopping',true,12) RETURNING id INTO cat_shop;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Gifts and Donation',true,13) RETURNING id INTO cat_gift;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Investment and Savings',true,14) RETURNING id INTO cat_invest;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Reimbursable',true,15) RETURNING id INTO cat_reimb;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Credit Card',true,16) RETURNING id INTO cat_cc;
  INSERT INTO public.categories(family_id,name,is_system,sort_order) VALUES (_family_id,'Miscellaneous',true,99) RETURNING id INTO cat_misc;

  INSERT INTO public.category_rules(family_id,category_id,keyword) VALUES
    (_family_id,cat_groceries,'grocery'),(_family_id,cat_groceries,'groceries'),
    (_family_id,cat_groceries,'blinkit'),(_family_id,cat_groceries,'instamart'),
    (_family_id,cat_groceries,'big basket'),(_family_id,cat_groceries,'bigbasket'),
    (_family_id,cat_groceries,'lulu'),(_family_id,cat_groceries,'reliance'),
    (_family_id,cat_meat,'chicken'),(_family_id,cat_meat,'fish'),(_family_id,cat_meat,'prawns'),
    (_family_id,cat_meat,'eggs'),(_family_id,cat_meat,'my chicken'),
    (_family_id,cat_outside,'coffee'),(_family_id,cat_outside,'tea'),(_family_id,cat_outside,'momo'),
    (_family_id,cat_outside,'samosa'),(_family_id,cat_outside,'dosa'),(_family_id,cat_outside,'swiggy'),
    (_family_id,cat_outside,'zomato'),(_family_id,cat_outside,'donuts'),(_family_id,cat_outside,'ice cream'),
    (_family_id,cat_outside,'fuchka'),
    (_family_id,cat_health,'doctor'),(_family_id,cat_health,'medicine'),(_family_id,cat_health,'pharmacy'),
    (_family_id,cat_health,'health checkup'),(_family_id,cat_health,'tests'),(_family_id,cat_health,'hospital'),
    (_family_id,cat_fuel,'fuel'),(_family_id,cat_fuel,'fastag'),(_family_id,cat_fuel,'toll'),
    (_family_id,cat_fuel,'uber'),(_family_id,cat_fuel,'auto'),(_family_id,cat_fuel,'ola'),
    (_family_id,cat_travel,'indigo'),(_family_id,cat_travel,'flight'),(_family_id,cat_travel,'hotel'),
    (_family_id,cat_emi,'emi'),(_family_id,cat_emi,'loan'),
    (_family_id,cat_ins,'insurance'),(_family_id,cat_ins,'term insurance'),
    (_family_id,cat_invest,'rd'),(_family_id,cat_invest,'sip'),(_family_id,cat_invest,'post office'),
    (_family_id,cat_invest,'mutual fund'),(_family_id,cat_invest,'recurring deposit'),
    (_family_id,cat_gift,'donation'),(_family_id,cat_gift,'gift'),
    (_family_id,cat_home,'door repair'),(_family_id,cat_home,'geyser'),(_family_id,cat_home,'uc bathroom'),
    (_family_id,cat_home,'cleaning'),(_family_id,cat_home,'urban company'),
    (_family_id,cat_bills,'electricity'),(_family_id,cat_bills,'water bill'),(_family_id,cat_bills,'gas'),
    (_family_id,cat_bills,'internet'),(_family_id,cat_bills,'broadband'),(_family_id,cat_bills,'mobile recharge');

  INSERT INTO public.recurring_expenses(family_id,item,amount,type,category_id,due_day) VALUES
    (_family_id,'Parents',0,'expense',cat_misc,1),
    (_family_id,'Parvathi Didi',0,'expense',cat_home,1),
    (_family_id,'Jitu Da',0,'expense',cat_home,1),
    (_family_id,'Term Insurance',0,'expense',cat_ins,1),
    (_family_id,'F-308 EMI',0,'expense',cat_emi,5),
    (_family_id,'E-205 EMI',0,'expense',cat_emi,5),
    (_family_id,'Recurring Deposit',0,'investment',cat_invest,10),
    (_family_id,'SIP',0,'investment',cat_invest,10),
    (_family_id,'News Paper',0,'expense',cat_bills,5),
    (_family_id,'Car Cleaning',0,'expense',cat_home,15),
    (_family_id,'Gym',0,'expense',cat_misc,1),
    (_family_id,'Post Office RD',0,'investment',cat_invest,10);
END; $$;

CREATE OR REPLACE FUNCTION public.create_family(_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _fid UUID; _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.families(name,created_by) VALUES (_name,_uid) RETURNING id INTO _fid;
  INSERT INTO public.family_user_roles(family_id,user_id,role) VALUES (_fid,_uid,'owner');
  INSERT INTO public.family_members(family_id,display_name,user_id)
    VALUES (_fid, COALESCE((SELECT full_name FROM public.profiles WHERE id=_uid), split_part((SELECT email FROM public.profiles WHERE id=_uid),'@',1), 'Me'), _uid);
  PERFORM public.seed_family_defaults(_fid);
  UPDATE public.profiles SET default_family_id = COALESCE(default_family_id, _fid) WHERE id = _uid;
  RETURN _fid;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_family(TEXT) TO authenticated;

-- ============ SUMMARY RPCs (aliased) ============
CREATE OR REPLACE FUNCTION public.monthly_summary(_family_id UUID, _year INT, _month INT)
RETURNS TABLE(total NUMERIC, expense_total NUMERIC, investment_total NUMERIC, reimbursable_total NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(amount),0) AS total,
    COALESCE(SUM(amount) FILTER (WHERE type='expense'),0) AS expense_total,
    COALESCE(SUM(amount) FILTER (WHERE type='investment'),0) AS investment_total,
    COALESCE(SUM(amount) FILTER (WHERE reimbursable AND reimbursement_status='pending'),0) AS reimbursable_total
  FROM public.expenses
  WHERE family_id = _family_id
    AND public.is_family_member(_family_id, auth.uid())
    AND EXTRACT(YEAR FROM date)::INT = _year
    AND EXTRACT(MONTH FROM date)::INT = _month;
$$;
GRANT EXECUTE ON FUNCTION public.monthly_summary(UUID,INT,INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.category_summary(_family_id UUID, _start DATE, _end DATE)
RETURNS TABLE(category_id UUID, category_name TEXT, total NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id AS category_id, c.name AS category_name, COALESCE(SUM(e.amount),0) AS total
  FROM public.categories c
  LEFT JOIN public.expenses e ON e.category_id = c.id AND e.date BETWEEN _start AND _end AND e.type='expense'
  WHERE c.family_id = _family_id AND public.is_family_member(_family_id, auth.uid())
  GROUP BY c.id, c.name
  ORDER BY 3 DESC;
$$;
GRANT EXECUTE ON FUNCTION public.category_summary(UUID,DATE,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.member_summary(_family_id UUID, _start DATE, _end DATE)
RETURNS TABLE(member_id UUID, member_name TEXT, total NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id AS member_id, m.display_name AS member_name, COALESCE(SUM(e.amount),0) AS total
  FROM public.family_members m
  LEFT JOIN public.expenses e ON e.paid_by = m.id AND e.date BETWEEN _start AND _end AND e.type='expense'
  WHERE m.family_id = _family_id AND public.is_family_member(_family_id, auth.uid())
  GROUP BY m.id, m.display_name
  ORDER BY 3 DESC;
$$;
GRANT EXECUTE ON FUNCTION public.member_summary(UUID,DATE,DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.daily_summary(_family_id UUID, _start DATE, _end DATE)
RETURNS TABLE(day DATE, total NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date AS day, COALESCE(SUM(amount),0) AS total
  FROM public.expenses
  WHERE family_id = _family_id AND public.is_family_member(_family_id, auth.uid())
    AND date BETWEEN _start AND _end AND type='expense'
  GROUP BY date ORDER BY date;
$$;
GRANT EXECUTE ON FUNCTION public.daily_summary(UUID,DATE,DATE) TO authenticated;
