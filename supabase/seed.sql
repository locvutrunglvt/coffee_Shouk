-- ============================================================
-- TÀ ƠI COFFEE SHOP - SAMPLE SEED DATA (Optional)
-- Run this in Supabase SQL Editor AFTER running schema.sql
-- ============================================================

-- 1. Categories
INSERT INTO public.categories (name, sort_order) VALUES
  ('Cà phê', 1),
  ('Trà sữa', 2),
  ('Trà trái cây', 3),
  ('Đá xay & Khác', 4)
ON CONFLICT DO NOTHING;

-- 2. Dining Tables
INSERT INTO public.dining_tables (name, zone, sort_order) VALUES
  ('Bàn 1', 'Trong nhà', 1),
  ('Bàn 2', 'Trong nhà', 2),
  ('Bàn 3', 'Trong nhà', 3),
  ('Bàn 4', 'Trong nhà', 4),
  ('Sân vườn 1', 'Ngoài trời', 5),
  ('Sân vườn 2', 'Ngoài trời', 6)
ON CONFLICT DO NOTHING;

-- 3. Toppings
INSERT INTO public.toppings (name, price) VALUES
  ('Trân châu đen', 5000),
  ('Thạch dừa', 5000),
  ('Kem cheese', 8000),
  ('Thêm shot Espresso', 10000)
ON CONFLICT DO NOTHING;

-- 4. Ingredients (Kho nguyên liệu mẫu)
INSERT INTO public.ingredients (name, sku, purchase_unit, base_unit, conversion_rate, current_stock, min_stock_alert, avg_unit_cost) VALUES
  ('Cà phê hạt Robusta/Arabica', 'NL-CF01', 'Bịch 1kg', 'g', 1000, 5000, 1000, 220),
  ('Sữa đặc có đường', 'NL-SD01', 'Lon 380g', 'g', 380, 3800, 760, 60),
  ('Sữa tươi không đường', 'NL-ST01', 'Hộp 1L', 'ml', 1000, 6000, 2000, 35),
  ('Trà đen ủ', 'NL-TD01', 'Gói 500g', 'g', 500, 1500, 300, 180),
  ('Đường nước', 'NL-DN01', 'Can 5L', 'ml', 5000, 5000, 1000, 25),
  ('Ly nhựa 500ml + Nắp', 'NL-LY500', 'Lốc 50 cái', 'cái', 50, 250, 50, 1200)
ON CONFLICT DO NOTHING;

-- 5. Recurring expenses reminder samples (Tiền thuê mặt bằng, Internet)
INSERT INTO public.recurring_expenses (title, expense_group, amount, billing_cycle_months, next_due_date, reminder_days_before, note) VALUES
  ('Tiền thuê mặt bằng quán', 'rent', 8000000, 1, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date, 5, 'Thanh toán đầu mỗi tháng'),
  ('Internet Wifi quán', 'internet', 250000, 1, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date, 3, 'Gói cáp quang')
ON CONFLICT DO NOTHING;
