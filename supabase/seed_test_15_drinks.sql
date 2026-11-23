-- ============================================================
-- TA OI COFFEE - 15 TEST DRINKS & FULL OPERATION SEED DATA
-- Run in Supabase SQL Editor (or use the 1-click button in /settings)
-- ============================================================

DO $$
DECLARE
  c_coffee UUID;
  c_tea UUID;
  c_fruit UUID;
  c_other UUID;
  ing_coffee UUID;
  ing_cond_milk UUID;
  ing_fresh_milk UUID;
  ing_matcha UUID;
  ing_black_tea UUID;
  ing_syrup UUID;
  ing_cup UUID;
  p_id UUID;
BEGIN
  -- 1. Categories
  INSERT INTO public.categories (name, sort_order) VALUES ('Cà phê', 1) RETURNING id INTO c_coffee;
  INSERT INTO public.categories (name, sort_order) VALUES ('Trà sữa & Matcha', 2) RETURNING id INTO c_tea;
  INSERT INTO public.categories (name, sort_order) VALUES ('Trà trái cây & Ép', 3) RETURNING id INTO c_fruit;
  INSERT INTO public.categories (name, sort_order) VALUES ('Đá xay & Bánh', 4) RETURNING id INTO c_other;

  -- 2. Tables
  INSERT INTO public.dining_tables (name, zone, sort_order) VALUES
    ('Bàn 1', 'Trong nhà', 1),
    ('Bàn 2', 'Trong nhà', 2),
    ('Bàn 3', 'Trong nhà', 3),
    ('Bàn 4', 'Trong nhà', 4),
    ('Sân vườn 1', 'Ngoài trời', 5),
    ('Sân vườn 2', 'Ngoài trời', 6);

  -- 3. Toppings
  INSERT INTO public.toppings (name, price) VALUES
    ('Trân châu đường đen', 7000),
    ('Kem cheese / Foam milk', 9000),
    ('Thạch đào / Vải', 7000),
    ('Thêm shot Espresso', 10000);

  -- 4. Ingredients
  INSERT INTO public.ingredients (name, sku, purchase_unit, base_unit, conversion_rate, current_stock, min_stock_alert, avg_unit_cost)
  VALUES ('Cà phê hạt rang xay', 'NL-CF01', 'Bịch 1kg', 'g', 1000, 5000, 1000, 220) RETURNING id INTO ing_coffee;

  INSERT INTO public.ingredients (name, sku, purchase_unit, base_unit, conversion_rate, current_stock, min_stock_alert, avg_unit_cost)
  VALUES ('Sữa đặc có đường', 'NL-SD01', 'Lon 380g', 'g', 380, 3800, 760, 65) RETURNING id INTO ing_cond_milk;

  INSERT INTO public.ingredients (name, sku, purchase_unit, base_unit, conversion_rate, current_stock, min_stock_alert, avg_unit_cost)
  VALUES ('Sữa tươi không đường', 'NL-ST01', 'Hộp 1L', 'ml', 1000, 8000, 2000, 36) RETURNING id INTO ing_fresh_milk;

  INSERT INTO public.ingredients (name, sku, purchase_unit, base_unit, conversion_rate, current_stock, min_stock_alert, avg_unit_cost)
  VALUES ('Bột Matcha Nhật', 'NL-MC01', 'Gói 500g', 'g', 500, 1000, 200, 700) RETURNING id INTO ing_matcha;

  INSERT INTO public.ingredients (name, sku, purchase_unit, base_unit, conversion_rate, current_stock, min_stock_alert, avg_unit_cost)
  VALUES ('Trà đen / Hồng trà', 'NL-TR01', 'Gói 500g', 'g', 500, 2000, 400, 180) RETURNING id INTO ing_black_tea;

  INSERT INTO public.ingredients (name, sku, purchase_unit, base_unit, conversion_rate, current_stock, min_stock_alert, avg_unit_cost)
  VALUES ('Syrup đường / Trái cây', 'NL-SY01', 'Chai 1L', 'ml', 1000, 4000, 800, 120) RETURNING id INTO ing_syrup;

  INSERT INTO public.ingredients (name, sku, purchase_unit, base_unit, conversion_rate, current_stock, min_stock_alert, avg_unit_cost)
  VALUES ('Ly nhựa + Nắp + Ống hút', 'NL-LY01', 'Lốc 50 cái', 'cái', 50, 300, 50, 1200) RETURNING id INTO ing_cup;

  -- 5. 15 Drinks with local photos in /drinks/
  -- 1
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_coffee, 'Cà phê đen đá', 'Đậm vị cà phê rang mộc truyền thống', '/drinks/01_ca_phe_den_da.jpg', 22000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 22000, true), (p_id, 'L', 28000, false);
  INSERT INTO public.recipes (product_id, ingredient_id, quantity_required) VALUES (p_id, ing_coffee, 22), (p_id, ing_cup, 1);

  -- 2
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_coffee, 'Cà phê sữa đá', 'Cà phê phin hòa quyện sữa đặc béo thơm', '/drinks/02_ca_phe_sua_da.jpg', 25000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 25000, true), (p_id, 'L', 32000, false);
  INSERT INTO public.recipes (product_id, ingredient_id, quantity_required) VALUES (p_id, ing_coffee, 20), (p_id, ing_cond_milk, 35), (p_id, ing_cup, 1);

  -- 3
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_coffee, 'Bạc xỉu 3 tầng', 'Sữa tươi nhiều, ngọt dịu nhẹ nhàng', '/drinks/03_bac_xiu.jpg', 29000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 29000, true), (p_id, 'L', 35000, false);
  INSERT INTO public.recipes (product_id, ingredient_id, quantity_required) VALUES (p_id, ing_coffee, 15), (p_id, ing_cond_milk, 30), (p_id, ing_fresh_milk, 120), (p_id, ing_cup, 1);

  -- 4
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_coffee, 'Americano đá', 'Espresso pha loãng mát lạnh thanh nhẹ', '/drinks/04_americano_da.jpg', 30000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 30000, true), (p_id, 'L', 36000, false);
  INSERT INTO public.recipes (product_id, ingredient_id, quantity_required) VALUES (p_id, ing_coffee, 18), (p_id, ing_cup, 1);

  -- 5
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_coffee, 'Latte nóng', 'Espresso cùng bọt sữa mịn nghệ thuật', '/drinks/05_latte_nong.jpg', 38000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 38000, true), (p_id, 'L', 45000, false);
  INSERT INTO public.recipes (product_id, ingredient_id, quantity_required) VALUES (p_id, ing_coffee, 18), (p_id, ing_fresh_milk, 180);

  -- 6
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_tea, 'Matcha Latte đá', 'Trà xanh Nhật Bản thơm mát béo dịu', '/drinks/06_matcha_latte.jpg', 43000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 43000, true), (p_id, 'L', 49000, false);
  INSERT INTO public.recipes (product_id, ingredient_id, quantity_required) VALUES (p_id, ing_matcha, 6), (p_id, ing_fresh_milk, 160), (p_id, ing_syrup, 20), (p_id, ing_cup, 1);

  -- 7
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_tea, 'Trà sữa trân châu đường đen', 'Hồng trà sữa kèm trân châu dai mềm', '/drinks/07_tra_sua_tran_chau.jpg', 37000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 37000, true), (p_id, 'L', 45000, false);
  INSERT INTO public.recipes (product_id, ingredient_id, quantity_required) VALUES (p_id, ing_black_tea, 8), (p_id, ing_fresh_milk, 120), (p_id, ing_syrup, 30), (p_id, ing_cup, 1);

  -- 8
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_fruit, 'Trà đào cam sả', 'Trà đào thanh mát hương cam sả tự nhiên', '/drinks/08_tra_dao_cam_sa.jpg', 35000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 35000, true), (p_id, 'L', 42000, false);
  INSERT INTO public.recipes (product_id, ingredient_id, quantity_required) VALUES (p_id, ing_black_tea, 6), (p_id, ing_syrup, 35), (p_id, ing_cup, 1);

  -- 9
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_fruit, 'Trà vải hoa hồng', 'Vị vải ngọt thanh kết hợp hương hoa hồng', '/drinks/09_tra_vai.jpg', 35000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 35000, true), (p_id, 'L', 42000, false);
  INSERT INTO public.recipes (product_id, ingredient_id, quantity_required) VALUES (p_id, ing_black_tea, 6), (p_id, ing_syrup, 35), (p_id, ing_cup, 1);

  -- 10
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_fruit, 'Trà chanh sả tắc', 'Giải nhiệt sảng khoái chua ngọt dịu', '/drinks/10_tra_chanh_sa_tac.jpg', 25000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 25000, true), (p_id, 'L', 30000, false);
  INSERT INTO public.recipes (product_id, ingredient_id, quantity_required) VALUES (p_id, ing_black_tea, 5), (p_id, ing_syrup, 30), (p_id, ing_cup, 1);

  -- 11
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_other, 'Sinh tố xoài', 'Xoài chín xay mịn mát lạnh tự nhiên', '/drinks/11_sinh_to_xoai.jpg', 39000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 39000, true), (p_id, 'L', 46000, false);

  -- 12
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_other, 'Đá xay Socola kem tươi', 'Socola đậm vị phủ kem tươi béo ngậy', '/drinks/12_da_xay_socola.jpg', 45000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 45000, true), (p_id, 'L', 52000, false);

  -- 13
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_fruit, 'Soda việt quất bạc hà', 'Soda có ga mát lạnh hương việt quất', '/drinks/13_soda_viet_quat.jpg', 32000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 32000, true), (p_id, 'L', 38000, false);

  -- 14
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_fruit, 'Nước cam ép tươi', 'Cam tươi vắt 100% bổ sung vitamin C', '/drinks/14_nuoc_cam_ep.jpg', 35000) RETURNING id INTO p_id;
  INSERT INTO public.product_variants (product_id, name, price, is_default) VALUES (p_id, 'M', 35000, true), (p_id, 'L', 42000, false);

  -- 15
  INSERT INTO public.products (category_id, name, description, image_url, base_price)
  VALUES (c_other, 'Bánh Croissant bơ', 'Bánh sừng bò nướng giòn thơm bơ Pháp', '/drinks/15_croissant.jpg', 28000) RETURNING id INTO p_id;

  -- 6. Sample operating expenses (Rent, Electricity, Water) for current month
  INSERT INTO public.expenses (expense_group, title, amount, expense_date, billing_month, allocated_months)
  VALUES
    ('rent', 'Tiền thuê mặt bằng tháng này', 8000000, CURRENT_DATE, to_char(CURRENT_DATE, 'YYYY-MM'), 1),
    ('electricity', 'Tiền điện quán (1420 -> 1850 kWh)', 1505000, CURRENT_DATE, to_char(CURRENT_DATE, 'YYYY-MM'), 1),
    ('water', 'Tiền nước sinh hoạt tháng', 220000, CURRENT_DATE, to_char(CURRENT_DATE, 'YYYY-MM'), 1);

  INSERT INTO public.recurring_expenses (title, expense_group, amount, billing_cycle_months, next_due_date, reminder_days_before, note)
  VALUES
    ('Tiền thuê mặt bằng quán', 'rent', 8000000, 1, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date, 5, 'Đóng đầu mỗi tháng'),
    ('Internet Wifi quán', 'internet', 250000, 1, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date, 3, 'Gói cáp quang');
END $$;
