-- ============================================================
-- HIERARCHY RBAC & ORDER CANCELLATION MIGRATION
-- Hierarchy:
--   1. developer (Trung - root, immutable by others, sole appointer of admin)
--   2. admin     (Soukthavy Seechaleunxay - sole head manager, manages staff,
--                 approves signups, edits/deletes records, cancels PAID orders)
--   3. manager / cashier / barista / staff:
--        - self-signups start inactive (is_active = FALSE) pending approval
--        - cannot delete/edit master records
--        - CAN cancel UNPAID orders, CANNOT cancel PAID orders
-- ============================================================

-- Step 1: Add 'developer' enum value and commit immediately (required by PostgreSQL)
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'developer';
COMMIT;

BEGIN;

-- Step 2: Promote Developer (locvutrunglvt@gmail.com or oldest admin) to 'developer'
UPDATE public.profiles
SET role = 'developer', is_active = TRUE, updated_at = NOW()
WHERE LOWER(email) = 'locvutrunglvt@gmail.com';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'developer') THEN
    UPDATE public.profiles
    SET role = 'developer', is_active = TRUE, updated_at = NOW()
    WHERE id = (
      SELECT id FROM public.profiles
      WHERE role = 'admin'
      ORDER BY created_at ASC
      LIMIT 1
    );
  END IF;
END $$;

-- If Soukthavy has already registered, promote to sole 'admin'
UPDATE public.profiles
SET
  full_name = CASE WHEN COALESCE(full_name, '') = '' THEN 'Soukthavy Seechaleunxay' ELSE full_name END,
  role = 'admin',
  is_active = TRUE,
  updated_at = NOW()
WHERE LOWER(email) = 'soukthavy.seechaleunxay@gmail.com';

-- Enforce at most ONE 'admin' account at database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_admin_role
  ON public.profiles ((role))
  WHERE role = 'admin';

-- Step 3: Secure handle_new_user() trigger
--   - First ever user becomes 'developer' (active)
--   - soukthavy.seechaleunxay@gmail.com becomes 'admin' (active) if no admin exists yet
--   - Every other self-signup starts as 'staff' + is_active = FALSE (pending approval)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dev_exists BOOLEAN;
  admin_exists BOOLEAN;
  assigned_role public.user_role;
  initial_active BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'developer') INTO dev_exists;
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') INTO admin_exists;

  IF NOT dev_exists OR LOWER(COALESCE(NEW.email, '')) = 'locvutrunglvt@gmail.com' THEN
    assigned_role := 'developer';
    initial_active := TRUE;
  ELSIF LOWER(COALESCE(NEW.email, '')) = 'soukthavy.seechaleunxay@gmail.com' AND NOT admin_exists THEN
    assigned_role := 'admin';
    initial_active := TRUE;
  ELSE
    assigned_role := 'staff';
    initial_active := FALSE;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, ''),
    assigned_role,
    initial_active
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Step 4: Protect hierarchy on profiles UPDATE
CREATE OR REPLACE FUNCTION public.enforce_profile_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role;
BEGIN
  -- Allow direct SQL Editor / postgres service executions where auth.uid() is null
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid() LIMIT 1;

  -- Nobody can modify or lock a developer account except developer itself keeping active
  IF OLD.role = 'developer' THEN
    IF auth.uid() <> OLD.id OR NEW.role <> 'developer' OR NEW.is_active = FALSE THEN
      RAISE EXCEPTION 'Developer account is protected';
    END IF;
    RETURN NEW;
  END IF;

  -- Only developer can promote to/demote from 'developer' or 'admin'
  IF (NEW.role IN ('developer', 'admin') OR OLD.role = 'admin') AND actor_role <> 'developer' THEN
    RAISE EXCEPTION 'Only Developer can assign or modify Admin';
  END IF;

  -- Admin cannot edit self status/role
  IF actor_role = 'admin' AND OLD.id = auth.uid() AND (NEW.role <> OLD.role OR NEW.is_active <> OLD.is_active) THEN
    RAISE EXCEPTION 'Cannot lock or change own role';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_hierarchy ON public.profiles;
CREATE TRIGGER trg_enforce_profile_hierarchy
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_hierarchy();

-- Step 5: Order cancellation rule
--   - Any POS user can cancel UNPAID orders
--   - Only 'developer' or 'admin' can cancel PAID orders
CREATE OR REPLACE FUNCTION public.enforce_paid_order_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.payment_status = 'paid' AND NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    actor_role := public.current_user_role();
    IF actor_role NOT IN ('developer', 'admin') THEN
      RAISE EXCEPTION 'Only Head Manager (Admin) can cancel a paid order';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_paid_order_cancel ON public.orders;
CREATE TRIGGER trg_enforce_paid_order_cancel
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_paid_order_cancel();

-- Step 6: Update RLS policies so 'developer' & 'admin' hold full management,
--         while lower staff cannot delete/edit master records.

DROP POLICY IF EXISTS "shop_settings_admin" ON public.shop_settings;
CREATE POLICY "shop_settings_admin" ON public.shop_settings FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "profiles_read_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_read_self_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.current_user_role() IN ('developer', 'admin', 'manager'));

DROP POLICY IF EXISTS "profiles_admin_write" ON public.profiles;
CREATE POLICY "profiles_admin_write" ON public.profiles FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "categories_manage" ON public.categories;
CREATE POLICY "categories_manage" ON public.categories FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "products_manage" ON public.products;
CREATE POLICY "products_manage" ON public.products FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "products_availability_staff" ON public.products;
CREATE POLICY "products_availability_staff" ON public.products FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('manager', 'barista'))
  WITH CHECK (public.current_user_role() IN ('manager', 'barista'));

DROP POLICY IF EXISTS "variants_manage" ON public.product_variants;
CREATE POLICY "variants_manage" ON public.product_variants FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "toppings_manage" ON public.toppings;
CREATE POLICY "toppings_manage" ON public.toppings FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "toppings_availability_staff" ON public.toppings;
CREATE POLICY "toppings_availability_staff" ON public.toppings FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('manager', 'barista'))
  WITH CHECK (public.current_user_role() IN ('manager', 'barista'));

DROP POLICY IF EXISTS "tables_manage" ON public.dining_tables;
CREATE POLICY "tables_manage" ON public.dining_tables FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "shifts_rw" ON public.shifts;
CREATE POLICY "shifts_rw" ON public.shifts FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin', 'manager', 'cashier'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager', 'cashier'));

DROP POLICY IF EXISTS "suppliers_manage" ON public.suppliers;
CREATE POLICY "suppliers_manage" ON public.suppliers FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager'));

DROP POLICY IF EXISTS "ingredients_manage" ON public.ingredients;
CREATE POLICY "ingredients_manage" ON public.ingredients FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin', 'manager', 'cashier'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager', 'cashier'));

DROP POLICY IF EXISTS "stock_imports_manage" ON public.stock_imports;
CREATE POLICY "stock_imports_manage" ON public.stock_imports FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager'));

DROP POLICY IF EXISTS "stock_import_items_manage" ON public.stock_import_items;
CREATE POLICY "stock_import_items_manage" ON public.stock_import_items FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager'));

DROP POLICY IF EXISTS "recipes_manage" ON public.recipes;
CREATE POLICY "recipes_manage" ON public.recipes FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager'));

DROP POLICY IF EXISTS "recipes_admin_modify" ON public.recipes;
CREATE POLICY "recipes_admin_modify" ON public.recipes FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "recipes_admin_delete" ON public.recipes;
CREATE POLICY "recipes_admin_delete" ON public.recipes FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "stock_movements_rw" ON public.stock_movements;
CREATE POLICY "stock_movements_rw" ON public.stock_movements FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin', 'manager', 'cashier'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager', 'cashier'));

DROP POLICY IF EXISTS "stock_takes_manage" ON public.stock_takes;
CREATE POLICY "stock_takes_manage" ON public.stock_takes FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager'));

DROP POLICY IF EXISTS "stock_take_items_manage" ON public.stock_take_items;
CREATE POLICY "stock_take_items_manage" ON public.stock_take_items FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager'));

DROP POLICY IF EXISTS "recurring_expenses_admin" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_admin" ON public.recurring_expenses FOR ALL TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "expenses_read" ON public.expenses;
CREATE POLICY "expenses_read" ON public.expenses FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('developer', 'admin')
    OR (public.current_user_role() IN ('manager', 'cashier') AND expense_group = 'shift_petty_cash')
  );

DROP POLICY IF EXISTS "expenses_write" ON public.expenses;
CREATE POLICY "expenses_write" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('developer', 'admin')
    OR (public.current_user_role() IN ('manager', 'cashier') AND expense_group = 'shift_petty_cash')
  );

DROP POLICY IF EXISTS "expenses_update_delete_admin" ON public.expenses;
CREATE POLICY "expenses_update_delete_admin" ON public.expenses FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "expenses_delete_admin" ON public.expenses;
CREATE POLICY "expenses_delete_admin" ON public.expenses FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "audit_read_admin" ON public.audit_logs;
CREATE POLICY "audit_read_admin" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'));

COMMIT;
