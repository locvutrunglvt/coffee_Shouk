-- ============================================================
-- MIGRATION: Dynamic Payment QR + Public Table QR Ordering (/order)
-- Run this once in Supabase SQL Editor!
-- ============================================================

-- 1. Extend shop_settings for Dynamic Payment QR (VietQR + EMVCo LaoQR)
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS qr_mode TEXT NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS vietqr_bank_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS vietqr_account_no TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS vietqr_account_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS emvco_base_qr TEXT DEFAULT '';

-- 2. Allow anonymous (public customer) read-only access to menu & table catalog
DROP POLICY IF EXISTS "shop_settings_public_read" ON public.shop_settings;
CREATE POLICY "shop_settings_public_read" ON public.shop_settings
  FOR SELECT TO anon USING (TRUE);

DROP POLICY IF EXISTS "categories_public_read" ON public.categories;
CREATE POLICY "categories_public_read" ON public.categories
  FOR SELECT TO anon USING (is_active = TRUE);

DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read" ON public.products
  FOR SELECT TO anon USING (is_active = TRUE);

DROP POLICY IF EXISTS "variants_public_read" ON public.product_variants;
CREATE POLICY "variants_public_read" ON public.product_variants
  FOR SELECT TO anon USING (is_active = TRUE);

DROP POLICY IF EXISTS "toppings_public_read" ON public.toppings;
CREATE POLICY "toppings_public_read" ON public.toppings
  FOR SELECT TO anon USING (is_active = TRUE);

DROP POLICY IF EXISTS "tables_public_read" ON public.dining_tables;
CREATE POLICY "tables_public_read" ON public.dining_tables
  FOR SELECT TO anon USING (is_active = TRUE);

-- 3. Secure RPC for public customers at tables to submit unpaid orders
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
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least 1 item';
  END IF;

  INSERT INTO public.orders (
    table_id,
    order_type,
    status,
    subtotal,
    total_amount,
    payment_status,
    note
  )
  VALUES (
    p_table_id,
    CASE WHEN p_table_id IS NOT NULL THEN 'dine_in'::public.order_type ELSE 'take_away'::public.order_type END,
    'pending'::public.order_status,
    0,
    0,
    'unpaid',
    COALESCE(p_note, '')
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::INTEGER, 1));

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
      order_id,
      product_id,
      variant_id,
      product_name,
      variant_name,
      quantity,
      unit_price,
      toppings_json,
      toppings_total,
      line_total,
      note,
      status
    )
    VALUES (
      v_order_id,
      v_product.id,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_product.name,
      v_variant_name,
      v_qty,
      v_unit_price,
      v_toppings_json,
      v_toppings_total,
      v_line_total,
      COALESCE(v_item->>'note', ''),
      'pending'
    );
  END LOOP;

  UPDATE public.orders
  SET subtotal = v_subtotal,
      total_amount = v_subtotal
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_subtotal
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_qr_order(UUID, TEXT, JSONB) TO anon, authenticated;

-- 4. Public Storage Bucket for fast drink/QR/receipt photos (replaces heavy base64 in DB)
INSERT INTO storage.buckets (id, name, public)
VALUES ('taoi-images', 'taoi-images', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "taoi_images_public_read" ON storage.objects;
CREATE POLICY "taoi_images_public_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'taoi-images');

DROP POLICY IF EXISTS "taoi_images_auth_upload" ON storage.objects;
CREATE POLICY "taoi_images_auth_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'taoi-images');
