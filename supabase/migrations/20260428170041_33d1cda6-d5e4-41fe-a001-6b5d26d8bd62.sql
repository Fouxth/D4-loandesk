
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');
CREATE TYPE public.payment_type AS ENUM ('daily', 'weekly', 'monthly');
CREATE TYPE public.loan_status AS ENUM ('active', 'completed', 'overdue', 'cancelled');
CREATE TYPE public.risk_level AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.expense_category AS ENUM ('fuel', 'staff', 'calls', 'documents', 'other');
CREATE TYPE public.payment_method AS ENUM ('cash', 'bank_transfer', 'mobile', 'other');

CREATE SEQUENCE public.loans_seq START 1000;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','staff'));
$$;

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  id_card TEXT,
  address TEXT,
  notes TEXT,
  risk_level public.risk_level NOT NULL DEFAULT 'low',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_customers_name ON public.customers(full_name);
CREATE INDEX idx_customers_phone ON public.customers(phone);

CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_number TEXT NOT NULL UNIQUE DEFAULT 'LN-' || lpad(nextval('public.loans_seq'::regclass)::text, 6, '0'),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  principal NUMERIC(14,2) NOT NULL,
  interest_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  interest_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_payable NUMERIC(14,2) NOT NULL,
  installments_count INTEGER NOT NULL,
  installment_amount NUMERIC(14,2) NOT NULL,
  payment_type public.payment_type NOT NULL DEFAULT 'daily',
  start_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status public.loan_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_loans_customer ON public.loans(customer_id);
CREATE INDEX idx_loans_status ON public.loans(status);
CREATE INDEX idx_loans_due ON public.loans(due_date);

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  installment_number INTEGER,
  method public.payment_method NOT NULL DEFAULT 'cash',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payments_loan ON public.payments(loan_id);
CREATE INDEX idx_payments_date ON public.payments(payment_date);

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.expense_category NOT NULL DEFAULT 'other',
  amount NUMERIC(14,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_expenses_date ON public.expenses(expense_date);

CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES public.loans(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  label TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_activity_created ON public.activity_logs(created_at DESC);

-- RLS
CREATE POLICY "profiles_view_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "roles_view_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "customers_staff_all" ON public.customers FOR ALL TO authenticated USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "loans_staff_all" ON public.loans FOR ALL TO authenticated USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "payments_staff_all" ON public.payments FOR ALL TO authenticated USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "expenses_staff_all" ON public.expenses FOR ALL TO authenticated USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "attachments_staff_all" ON public.attachments FOR ALL TO authenticated USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "logs_staff_view" ON public.activity_logs FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "logs_staff_insert" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff_or_admin(auth.uid()));

-- triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_customers_touch BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_loans_touch BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.recalc_loan_status(_loan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _total_paid NUMERIC; _total_payable NUMERIC; _due DATE; _status loan_status;
BEGIN
  SELECT total_payable, due_date, status INTO _total_payable, _due, _status FROM loans WHERE id = _loan_id;
  IF _status = 'cancelled' THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount),0) INTO _total_paid FROM payments WHERE loan_id = _loan_id;
  IF _total_paid >= _total_payable THEN
    UPDATE loans SET status = 'completed' WHERE id = _loan_id;
  ELSIF _due < CURRENT_DATE THEN
    UPDATE loans SET status = 'overdue' WHERE id = _loan_id;
  ELSE
    UPDATE loans SET status = 'active' WHERE id = _loan_id;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.payments_after_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recalc_loan_status(COALESCE(NEW.loan_id, OLD.loan_id));
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_payments_status AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.payments_after_change();

-- storage
INSERT INTO storage.buckets (id, name, public) VALUES ('loan-attachments', 'loan-attachments', false);

CREATE POLICY "attachments_staff_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'loan-attachments' AND public.is_staff_or_admin(auth.uid()));
CREATE POLICY "attachments_staff_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'loan-attachments' AND public.is_staff_or_admin(auth.uid()));
CREATE POLICY "attachments_staff_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'loan-attachments' AND public.is_staff_or_admin(auth.uid()));
CREATE POLICY "attachments_staff_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'loan-attachments' AND public.is_staff_or_admin(auth.uid()));
