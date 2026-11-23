-- ============================================================
-- TA OI COFFEE SHOP (coffee_Shouk) - SUPABASE DATABASE SCHEMA
-- Covers: Auth/RBAC, Shop Settings, Menu/POS, Shifts/Cashflow,
--         Inventory/Import/Recipes/Stock-take, Expenses & P&L
-- ============================================================

-- 1. EXTENSIONS & ENUMS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('admin', 'manager', 'cashier', 'staff', 'barista');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_type AS ENUM ('dine_in', 'take_away', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('pending', 'preparing', 'ready', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'qr_transfer', 'card', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.movement_type AS ENUM ('import', 'sale_deduction', 'stock_take_adjust', 'waste', 'manual_adjust');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.expense_group AS ENUM (
    'rent',
    'electricity',
    'water',
    'internet',
    'payroll',
    'maintenance',
    'marketing',
    'shift_petty_cash',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. SHOP SETTINGS (Singleton config: currency LAK/VND, QR image, shop info)
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name TEXT NOT NULL DEFAULT 'Ta Oi Coffee',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  currency_code TEXT NOT NULL DEFAULT 'LAK',
  currency_symbol TEXT NOT NULL DEFAULT '₭',
  qr_image_url TEXT DEFAULT '',
  bank_info TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.shop_settings (id, shop_name, currency_code, currency_symbol)
VALUES (1, 'Ta Oi Coffee', 'LAK', '₭')
ON CONFLICT (id) DO NOTHING;

-- 3. PROFILES & RBAC
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  role public.user_role NOT NULL DEFAULT 'staff',
  pin_code TEXT DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE LIMIT 1;
$$;

-- Auto-create profile when user signs up; first user becomes 'admin'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_exists BOOLEAN;
  assigned_role public.user_role;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') INTO admin_exists;
  IF NOT admin_exists THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'staff');
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, ''),
    assigned_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. MENU & TABLES
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  base_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. 'S', 'M', 'L'
  price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.toppings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.dining_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT 'Trong nhà',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. SHIFTS & POS ORDERS
CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by UUID REFERENCES public.profiles(id),
  closed_by UUID REFERENCES public.profiles(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  opening_cash NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_cash_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_qr_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_other_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_petty_expenses NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expected_cash NUMERIC(14, 2) NOT NULL DEFAULT 0,
  actual_cash NUMERIC(14, 2),
  cash_difference NUMERIC(14, 2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number BIGSERIAL,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  table_id UUID REFERENCES public.dining_tables(id) ON DELETE SET NULL,
  order_type public.order_type NOT NULL DEFAULT 'dine_in',
  status public.order_status NOT NULL DEFAULT 'pending',
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_reason TEXT DEFAULT '',
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_method public.payment_method DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  cash_received NUMERIC(14, 2) DEFAULT 0,
  cash_change NUMERIC(14, 2) DEFAULT 0,
  note TEXT DEFAULT '',
  created_by UUID REFERENCES public.profiles(id),
  cancelled_by UUID REFERENCES public.profiles(id),
  cancel_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variant_name TEXT DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  toppings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  toppings_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready'))
);

-- 6. INVENTORY, IMPORTS, RECIPES & STOCK BALANCE (CÂN ĐỐI KHO)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  note TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT DEFAULT '',
  purchase_unit TEXT NOT NULL DEFAULT 'Kg',     -- Đơn vị nhập (Thùng, Bịch, Kg, Hộp)
  base_unit TEXT NOT NULL DEFAULT 'g',          -- Đơn vị định lượng (g, ml, cái)
  conversion_rate NUMERIC(14, 4) NOT NULL DEFAULT 1 CHECK (conversion_rate > 0),
  current_stock NUMERIC(14, 4) NOT NULL DEFAULT 0,
  min_stock_alert NUMERIC(14, 4) NOT NULL DEFAULT 0,
  avg_unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0, -- Giá vốn bình quân trên 1 base_unit
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  import_code TEXT DEFAULT '',
  import_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'unpaid')),
  payment_method public.payment_method DEFAULT 'cash',
  receipt_image_url TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.stock_imports(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  purchase_quantity NUMERIC(14, 4) NOT NULL CHECK (purchase_quantity > 0),
  purchase_unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  base_quantity NUMERIC(14, 4) NOT NULL CHECK (base_quantity > 0),
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
  topping_id UUID REFERENCES public.toppings(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity_required NUMERIC(14, 4) NOT NULL CHECK (quantity_required > 0)
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  movement_type public.movement_type NOT NULL,
  quantity_change NUMERIC(14, 4) NOT NULL,
  stock_after NUMERIC(14, 4) NOT NULL,
  unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  reference_id UUID,
  note TEXT DEFAULT '',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  take_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  total_variance_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  created_by UUID REFERENCES public.profiles(id),
  finalized_by UUID REFERENCES public.profiles(id),
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_take_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_take_id UUID NOT NULL REFERENCES public.stock_takes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  system_stock NUMERIC(14, 4) NOT NULL DEFAULT 0,
  actual_stock NUMERIC(14, 4) NOT NULL DEFAULT 0,
  difference NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  variance_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reason TEXT DEFAULT ''
);

-- 7. OPERATING EXPENSES (ĐIỆN, NƯỚC, MẶT BẰNG, LƯƠNG, CHI CA)
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  expense_group public.expense_group NOT NULL DEFAULT 'rent',
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  billing_cycle_months INTEGER NOT NULL DEFAULT 1 CHECK (billing_cycle_months > 0),
  next_due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reminder_days_before INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_group public.expense_group NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  billing_month TEXT NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  meter_old NUMERIC(14, 2),       -- Chỉ số cũ (Điện / Nước)
  meter_new NUMERIC(14, 2),       -- Chỉ số mới (Điện / Nước)
  unit_price NUMERIC(14, 2),      -- Đơn giá kWh / m3
  allocated_months INTEGER NOT NULL DEFAULT 1 CHECK (allocated_months > 0),
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  payment_method public.payment_method DEFAULT 'cash',
  receipt_image_url TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toppings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dining_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_take_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Shop settings: all authenticated read, admin write
CREATE POLICY "shop_settings_read" ON public.shop_settings FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "shop_settings_admin" ON public.shop_settings FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- Profiles: self read, admin full
CREATE POLICY "profiles_read_self_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.current_user_role() IN ('admin', 'manager'));
CREATE POLICY "profiles_admin_write" ON public.profiles FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- Menu & Tables: authenticated read, admin/manager manage
CREATE POLICY "categories_read" ON public.categories FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "categories_manage" ON public.categories FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "products_read" ON public.products FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "products_manage" ON public.products FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager', 'barista'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'barista'));

CREATE POLICY "variants_read" ON public.product_variants FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "variants_manage" ON public.product_variants FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "toppings_read" ON public.toppings FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "toppings_manage" ON public.toppings FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager', 'barista'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'barista'));

CREATE POLICY "tables_read" ON public.dining_tables FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "tables_manage" ON public.dining_tables FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

-- Shifts & Orders: authenticated staff/cashier/barista/manager/admin
CREATE POLICY "shifts_rw" ON public.shifts FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager', 'cashier'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'cashier'));

CREATE POLICY "orders_rw" ON public.orders FOR ALL TO authenticated
  USING (public.current_user_role() IS NOT NULL)
  WITH CHECK (public.current_user_role() IS NOT NULL);

CREATE POLICY "order_items_rw" ON public.order_items FOR ALL TO authenticated
  USING (public.current_user_role() IS NOT NULL)
  WITH CHECK (public.current_user_role() IS NOT NULL);

-- Inventory: admin & manager manage; cashier/staff/barista read basic stock
CREATE POLICY "suppliers_manage" ON public.suppliers FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "ingredients_read" ON public.ingredients FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "ingredients_manage" ON public.ingredients FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager', 'cashier'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'cashier'));

CREATE POLICY "stock_imports_manage" ON public.stock_imports FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "stock_import_items_manage" ON public.stock_import_items FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "recipes_read" ON public.recipes FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "recipes_manage" ON public.recipes FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "stock_movements_rw" ON public.stock_movements FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager', 'cashier'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'cashier'));

CREATE POLICY "stock_takes_manage" ON public.stock_takes FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "stock_take_items_manage" ON public.stock_take_items FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

-- Expenses: admin full; manager/cashier can insert & view shift_petty_cash
CREATE POLICY "recurring_expenses_admin" ON public.recurring_expenses FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "expenses_read" ON public.expenses FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() IN ('manager', 'cashier') AND expense_group = 'shift_petty_cash')
  );
CREATE POLICY "expenses_write" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() IN ('manager', 'cashier') AND expense_group = 'shift_petty_cash')
  );
CREATE POLICY "expenses_update_delete_admin" ON public.expenses FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY "expenses_delete_admin" ON public.expenses FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- Audit logs: authenticated insert, admin read
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "audit_read_admin" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

-- Enable Realtime for orders & order_items (for POS <-> Barista KDS)
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
