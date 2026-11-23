-- ============================================================
-- PRODUCTION HARDENING MIGRATION:
--   1. Atomic shift & stock RPCs (no Read-Modify-Write race conditions)
--   2. Server-verified POS order pricing RPC (submit_pos_order)
--   3. Atomic order cancellation + PAID order shift & stock reversal
--   4. Single open shift constraint (idx_single_open_shift)
--   5. Anti-spam throttle & bounds on public submit_qr_order
--   6. Strict DELETE locks on orders / order_items / shifts
-- ============================================================

BEGIN;

-- 1. Ensure at most 1 open shift at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_open_shift
  ON public.shifts ((status))
  WHERE status = 'open';

-- 2. Atomic ingredient stock adjustment
CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock(
  p_ingredient_id UUID,
  p_delta NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next NUMERIC(14, 3);
BEGIN
  IF public.current_user_role() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.ingredients
  SET
    current_stock = current_stock + COALESCE(p_delta, 0),
    updated_at = NOW()
  WHERE id = p_ingredient_id
  RETURNING current_stock INTO v_next;

  RETURN COALESCE(v_next, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_ingredient_stock(UUID, NUMERIC) TO authenticated;

-- 3. Atomic shift sales / petty expense totals adjustment
CREATE OR REPLACE FUNCTION public.adjust_shift_totals(
  p_shift_id UUID,
  p_cash_delta NUMERIC DEFAULT 0,
  p_qr_delta NUMERIC DEFAULT 0,
  p_other_delta NUMERIC DEFAULT 0,
  p_petty_delta NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.shifts%ROWTYPE;
  v_cash NUMERIC(14, 2);
  v_qr NUMERIC(14, 2);
  v_other NUMERIC(14, 2);
  v_petty NUMERIC(14, 2);
  v_expected NUMERIC(14, 2);
BEGIN
  IF public.current_user_role() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_cash := GREATEST(0, COALESCE(v_shift.total_cash_sales, 0) + COALESCE(p_cash_delta, 0));
  v_qr := GREATEST(0, COALESCE(v_shift.total_qr_sales, 0) + COALESCE(p_qr_delta, 0));
  v_other := GREATEST(0, COALESCE(v_shift.total_other_sales, 0) + COALESCE(p_other_delta, 0));
  v_petty := GREATEST(0, COALESCE(v_shift.total_petty_expenses, 0) + COALESCE(p_petty_delta, 0));
  v_expected := COALESCE(v_shift.opening_cash, 0) + v_cash - v_petty;

  UPDATE public.shifts
  SET
    total_cash_sales = v_cash,
    total_qr_sales = v_qr,
    total_other_sales = v_other,
    total_petty_expenses = v_petty,
    expected_cash = v_expected
  WHERE id = v_shift.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_shift_totals(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

-- 4. Server-verified POS order creation (prevents DevTools price tampering)
CREATE OR REPLACE FUNCTION public.submit_pos_order(
  p_shift_id UUID DEFAULT NULL,
  p_table_id UUID DEFAULT NULL,
  p_order_type public.order_type DEFAULT 'dine_in',
  p_payment_method public.payment_method DEFAULT 'cash',
  p_payment_status TEXT DEFAULT 'paid',
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_reason TEXT DEFAULT '',
  p_cash_received NUMERIC DEFAULT 0,
  p_note TEXT DEFAULT '',
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_order_id UUID;
  v_order_number BIGINT;
  v_subtotal NUMERIC(14, 2) := 0;
  v_discount NUMERIC(14, 2) := 0;
  v_total NUMERIC(14, 2) := 0;
  v_cash_recv NUMERIC(14, 2) := 0;
  v_cash_chg NUMERIC(14, 2) := 0;
  v_pay_status TEXT := 'unpaid';
  v_item JSONB;
  v_product RECORD;
  v_variant RECORD;
  v_topping RECORD;
  v_qty INTEGER;
  v_unit_price NUMERIC(14, 2);
  v_variant_name TEXT;
  v_toppings_json JSONB;
  v_toppings_total NUMERIC(14, 2);
  v_line_total NUMERIC(14, 2);
  v_top_id UUID;
BEGIN
  v_role := public.current_user_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_payment_status = 'paid' THEN
    IF v_role = 'staff' THEN
      RAISE EXCEPTION 'Waitstaff cannot finalize paid orders';
    END IF;
    v_pay_status := 'paid';
  ELSE
    v_pay_status := 'unpaid';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least 1 item';
  END IF;

  INSERT INTO public.orders (
    shift_id,
    table_id,
    order_type,
    status,
    subtotal,
    discount_amount,
    discount_reason,
    total_amount,
    payment_method,
    payment_status,
    note,
    created_by
  )
  VALUES (
    p_shift_id,
    CASE WHEN p_order_type = 'dine_in' THEN p_table_id ELSE NULL END,
    COALESCE(p_order_type, 'dine_in'),
    'pending'::public.order_status,
    0,
    0,
    COALESCE(p_discount_reason, ''),
    0,
    COALESCE(p_payment_method, 'cash'),
    v_pay_status,
    COALESCE(p_note, ''),
    auth.uid()
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := LEAST(100, GREATEST(1, COALESCE((v_item->>'quantity')::INTEGER, 1)));

    SELECT id, name, base_price INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND is_active = TRUE
      AND is_available = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not available';
    END IF;

    v_unit_price := v_product.base_price;
    v_variant_name := '';

    IF NULLIF(v_item->>'variant_id', '') IS NOT NULL THEN
      SELECT id, name, price INTO v_variant
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::UUID
        AND product_id = v_product.id
        AND is_active = TRUE;
      IF FOUND THEN
        v_unit_price := v_variant.price;
        v_variant_name := v_variant.name;
      END IF;
    END IF;

    v_toppings_json := '[]'::jsonb;
    v_toppings_total := 0;

    IF jsonb_typeof(v_item->'topping_ids') = 'array' THEN
      FOR v_top_id IN SELECT (value #>> '{}')::UUID FROM jsonb_array_elements(v_item->'topping_ids')
      LOOP
        SELECT id, name, price INTO v_topping
        FROM public.toppings
        WHERE id = v_top_id AND is_active = TRUE AND is_available = TRUE;
        IF FOUND THEN
          v_toppings_total := v_toppings_total + v_topping.price;
          v_toppings_json := v_toppings_json || jsonb_build_array(
            jsonb_build_object('id', v_topping.id, 'name', v_topping.name, 'price', v_topping.price)
          );
        END IF;
      END LOOP;
    END IF;

    v_line_total := (v_unit_price + v_toppings_total) * v_qty;
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name, variant_name,
      quantity, unit_price, toppings_json, toppings_total, line_total, note, status
    )
    VALUES (
      v_order_id, v_product.id, NULLIF(v_item->>'variant_id', '')::UUID, v_product.name, v_variant_name,
      v_qty, v_unit_price, v_toppings_json, v_toppings_total, v_line_total,
      COALESCE(v_item->>'note', ''), 'pending'
    );
  END LOOP;

  v_discount := LEAST(v_subtotal, GREATEST(0, COALESCE(p_discount_amount, 0)));
  v_total := GREATEST(0, v_subtotal - v_discount);

  IF v_pay_status = 'paid' AND p_payment_method = 'cash' THEN
    v_cash_recv := CASE WHEN COALESCE(p_cash_received, 0) > 0 THEN p_cash_received ELSE v_total END;
    v_cash_chg := GREATEST(0, v_cash_recv - v_total);
  END IF;

  UPDATE public.orders
  SET
    subtotal = v_subtotal,
    discount_amount = v_discount,
    total_amount = v_total,
    cash_received = v_cash_recv,
    cash_change = v_cash_chg
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_pos_order(
  UUID, UUID, public.order_type, public.payment_method, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, JSONB
) TO authenticated;

-- 5. Atomic order cancel + PAID order shift & recipe stock reversal
CREATE OR REPLACE FUNCTION public.cancel_order_atomic(
  p_order_id UUID,
  p_reason TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_order public.orders%ROWTYPE;
  v_item RECORD;
  v_ing RECORD;
  v_top JSONB;
  v_top_id UUID;
  v_has_variant_recipe BOOLEAN;
  v_next_stock NUMERIC(14, 3);
  v_cash_rev NUMERIC(14, 2) := 0;
  v_qr_rev NUMERIC(14, 2) := 0;
  v_other_rev NUMERIC(14, 2) := 0;
BEGIN
  v_role := public.current_user_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.status = 'cancelled' THEN
    RETURN FALSE;
  END IF;

  IF v_order.payment_status = 'paid' AND v_role NOT IN ('developer', 'admin') THEN
    RAISE EXCEPTION 'Only Head Manager (Admin) can cancel a paid order';
  END IF;

  UPDATE public.orders
  SET
    status = 'cancelled'::public.order_status,
    cancelled_by = auth.uid(),
    cancel_reason = COALESCE(p_reason, '')
  WHERE id = v_order.id;

  IF v_order.payment_status = 'paid' THEN
    -- Reverse shift sales if linked to a shift
    IF v_order.shift_id IS NOT NULL AND v_order.total_amount > 0 THEN
      IF v_order.payment_method = 'cash' THEN
        v_cash_rev := -v_order.total_amount;
      ELSIF v_order.payment_method = 'qr_transfer' THEN
        v_qr_rev := -v_order.total_amount;
      ELSE
        v_other_rev := -v_order.total_amount;
      END IF;
      PERFORM public.adjust_shift_totals(v_order.shift_id, v_cash_rev, v_qr_rev, v_other_rev, 0);
    END IF;

    -- Restore ingredient stock consumed by each order_item
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = v_order.id
    LOOP
      IF v_item.product_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM public.recipes
          WHERE product_id = v_item.product_id AND variant_id = v_item.variant_id
        ) INTO v_has_variant_recipe;

        FOR v_ing IN
          SELECT r.ingredient_id, (r.quantity_required * v_item.quantity) AS restore_qty, i.avg_unit_cost
          FROM public.recipes r
          JOIN public.ingredients i ON i.id = r.ingredient_id
          WHERE r.product_id = v_item.product_id
            AND ((v_has_variant_recipe AND r.variant_id = v_item.variant_id)
                 OR (NOT v_has_variant_recipe AND r.variant_id IS NULL))
        LOOP
          v_next_stock := public.adjust_ingredient_stock(v_ing.ingredient_id, v_ing.restore_qty);
          INSERT INTO public.stock_movements (
            ingredient_id, movement_type, quantity_change, stock_after,
            unit_cost, reference_id, note, created_by
          ) VALUES (
            v_ing.ingredient_id, 'manual_adjust', v_ing.restore_qty, v_next_stock,
            COALESCE(v_ing.avg_unit_cost, 0), v_order.id,
            'Cancel Order #' || v_order.order_number::TEXT, auth.uid()
          );
        END LOOP;
      END IF;

      IF jsonb_typeof(v_item.toppings_json) = 'array' THEN
        FOR v_top IN SELECT * FROM jsonb_array_elements(v_item.toppings_json)
        LOOP
          v_top_id := NULLIF(v_top->>'id', '')::UUID;
          IF v_top_id IS NOT NULL THEN
            FOR v_ing IN
              SELECT r.ingredient_id, (r.quantity_required * v_item.quantity) AS restore_qty, i.avg_unit_cost
              FROM public.recipes r
              JOIN public.ingredients i ON i.id = r.ingredient_id
              WHERE r.topping_id = v_top_id
            LOOP
              v_next_stock := public.adjust_ingredient_stock(v_ing.ingredient_id, v_ing.restore_qty);
              INSERT INTO public.stock_movements (
                ingredient_id, movement_type, quantity_change, stock_after,
                unit_cost, reference_id, note, created_by
              ) VALUES (
                v_ing.ingredient_id, 'manual_adjust', v_ing.restore_qty, v_next_stock,
                COALESCE(v_ing.avg_unit_cost, 0), v_order.id,
                'Cancel Order #' || v_order.order_number::TEXT, auth.uid()
              );
            END LOOP;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'cancel_order',
    'orders',
    v_order.id::TEXT,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'payment_status', v_order.payment_status,
      'reason', COALESCE(p_reason, '')
    )
  );

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, TEXT) TO authenticated;

-- 6. Harden submit_qr_order against anonymous order spam
CREATE OR REPLACE FUNCTION public.submit_qr_order(
  p_table_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT '',
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_order_number BIGINT;
  v_subtotal NUMERIC(14, 2) := 0;
  v_item JSONB;
  v_product RECORD;
  v_variant RECORD;
  v_topping RECORD;
  v_qty INTEGER;
  v_unit_price NUMERIC(14, 2);
  v_variant_name TEXT;
  v_toppings_json JSONB;
  v_toppings_total NUMERIC(14, 2);
  v_line_total NUMERIC(14, 2);
  v_top_id UUID;
  v_recent_anon_count INTEGER := 0;
  v_table_pending_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least 1 item';
  END IF;

  IF jsonb_array_length(p_items) > 25 THEN
    RAISE EXCEPTION 'Too many items in a single order';
  END IF;

  -- Global & per-table anti-spam throttle for anonymous QR orders
  SELECT COUNT(*) INTO v_recent_anon_count
  FROM public.orders
  WHERE created_by IS NULL
    AND status = 'pending'
    AND created_at >= NOW() - INTERVAL '2 minutes';

  IF v_recent_anon_count >= 10 THEN
    RAISE EXCEPTION 'Too many pending QR orders, please wait a moment';
  END IF;

  IF p_table_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_table_pending_count
    FROM public.orders
    WHERE table_id = p_table_id
      AND created_by IS NULL
      AND status = 'pending'
      AND created_at >= NOW() - INTERVAL '5 minutes';

    IF v_table_pending_count >= 5 THEN
      RAISE EXCEPTION 'Table already has multiple pending orders';
    END IF;
  END IF;

  INSERT INTO public.orders (
    table_id, order_type, status, subtotal, total_amount, payment_status, note
  )
  VALUES (
    p_table_id,
    CASE WHEN p_table_id IS NOT NULL THEN 'dine_in'::public.order_type ELSE 'take_away'::public.order_type END,
    'pending'::public.order_status,
    0, 0, 'unpaid', LEFT(COALESCE(p_note, ''), 300)
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := LEAST(50, GREATEST(1, COALESCE((v_item->>'quantity')::INTEGER, 1)));

    SELECT id, name, base_price INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND is_active = TRUE
      AND is_available = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not available';
    END IF;

    v_unit_price := v_product.base_price;
    v_variant_name := '';

    IF NULLIF(v_item->>'variant_id', '') IS NOT NULL THEN
      SELECT id, name, price INTO v_variant
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::UUID
        AND product_id = v_product.id
        AND is_active = TRUE;
      IF FOUND THEN
        v_unit_price := v_variant.price;
        v_variant_name := v_variant.name;
      END IF;
    END IF;

    v_toppings_json := '[]'::jsonb;
    v_toppings_total := 0;

    IF jsonb_typeof(v_item->'topping_ids') = 'array' THEN
      FOR v_top_id IN SELECT (value #>> '{}')::UUID FROM jsonb_array_elements(v_item->'topping_ids')
      LOOP
        SELECT id, name, price INTO v_topping
        FROM public.toppings
        WHERE id = v_top_id AND is_active = TRUE AND is_available = TRUE;
        IF FOUND THEN
          v_toppings_total := v_toppings_total + v_topping.price;
          v_toppings_json := v_toppings_json || jsonb_build_array(
            jsonb_build_object('id', v_topping.id, 'name', v_topping.name, 'price', v_topping.price)
          );
        END IF;
      END LOOP;
    END IF;

    v_line_total := (v_unit_price + v_toppings_total) * v_qty;
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name, variant_name,
      quantity, unit_price, toppings_json, toppings_total, line_total, note, status
    )
    VALUES (
      v_order_id, v_product.id, NULLIF(v_item->>'variant_id', '')::UUID, v_product.name, v_variant_name,
      v_qty, v_unit_price, v_toppings_json, v_toppings_total, v_line_total,
      LEFT(COALESCE(v_item->>'note', ''), 200), 'pending'
    );
  END LOOP;

  UPDATE public.orders
  SET subtotal = v_subtotal, total_amount = v_subtotal
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_subtotal
  );
END;
$$;

-- 7. Prevent lower staff from DELETE on orders / order_items / shifts
DROP POLICY IF EXISTS "orders_rw" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (public.current_user_role() IS NOT NULL);
CREATE POLICY "orders_insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IS NOT NULL);
CREATE POLICY "orders_update" ON public.orders FOR UPDATE TO authenticated
  USING (public.current_user_role() IS NOT NULL)
  WITH CHECK (public.current_user_role() IS NOT NULL);
CREATE POLICY "orders_delete_admin" ON public.orders FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "order_items_rw" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated
  USING (public.current_user_role() IS NOT NULL);
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IS NOT NULL);
CREATE POLICY "order_items_update" ON public.order_items FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin', 'manager', 'barista', 'cashier'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager', 'barista', 'cashier'));
CREATE POLICY "order_items_delete_admin" ON public.order_items FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'));

DROP POLICY IF EXISTS "shifts_rw" ON public.shifts;
CREATE POLICY "shifts_rw_no_delete" ON public.shifts FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin', 'manager', 'cashier'));
CREATE POLICY "shifts_insert_staff" ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager', 'cashier'));
CREATE POLICY "shifts_update_staff" ON public.shifts FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin', 'manager', 'cashier'))
  WITH CHECK (public.current_user_role() IN ('developer', 'admin', 'manager', 'cashier'));
CREATE POLICY "shifts_delete_admin" ON public.shifts FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('developer', 'admin'));

-- 8. Update default shop name to 'Ta Oi Coffee'
UPDATE public.shop_settings
SET shop_name = 'Ta Oi Coffee'
WHERE id = 1 AND shop_name = 'Tà Ơi Coffee';

COMMIT;
