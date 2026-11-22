# Hướng dẫn cài đặt & đưa lên mạng (GitHub + Supabase + Vercel)

## Bước 1: Tạo Database trên Supabase (Miễn phí)
1. Truy cập https://supabase.com → Đăng nhập và bấm **New project** (tạo dự án mới, đặt mật khẩu DB và chọn Region gần nhất như Singapore).
2. Vào menu bên trái chọn **SQL Editor** → **New query**:
   - Copy toàn bộ nội dung file `supabase/schema.sql` dán vào và bấm **Run**.
   - (Tùy chọn) Copy tiếp nội dung file `supabase/seed.sql` dán vào và bấm **Run** để có sẵn bàn, nhóm món, nguyên liệu mẫu.
3. (Khuyên dùng) Vào **Authentication → Providers → Email** → tắt **Confirm email** nếu muốn nhân viên tạo tài khoản là đăng nhập được ngay mà không cần chờ xác thực email.
4. Vào **Project Settings → API**, copy 2 giá trị:
   - `Project URL` → dùng cho `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → dùng cho `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Bước 2: Đẩy code lên GitHub (`coffee_Shouk`)
Mở Terminal tại thư mục dự án và chạy lần lượt:

```bash
git init
git add .
git commit -m "Phase 1: Khoi tao nen tang POS, Phan quyen & Schema Supabase"
git branch -M main
git remote add origin https://github.com/locvutrunglvt/coffee_Shouk.git
git push -u origin main
```

---

## Bước 3: Deploy lên Vercel (Không cần VPS / Domain)
1. Truy cập https://vercel.com → Đăng nhập bằng GitHub (`locvutrunglvt@gmail.com`).
2. Bấm **Add New... → Project** → chọn repo `coffee_Shouk` → bấm **Import**.
3. Tại mục **Environment Variables**, thêm 2 biến:
   - `NEXT_PUBLIC_SUPABASE_URL` = *(dán Project URL của Supabase)*
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = *(dán anon public key của Supabase)*
4. Bấm **Deploy**. Sau ~1 phút Vercel sẽ cấp link `https://coffee-shouk.vercel.app` (hoặc tương tự).

---

## Bước 4: Cài lên điện thoại (PWA) & Tài khoản đầu tiên
1. Mở link Vercel vừa tạo trên trình duyệt:
   - Trên **iPhone (Safari)**: Bấm nút Chia sẻ (Share) → **Thêm vào MH chính (Add to Home Screen)**.
   - Trên **Android (Chrome)**: Bấm menu `⋮` → **Cài đặt ứng dụng / Thêm vào màn hình chính**.
2. Vào mục **Tạo tài khoản** để đăng ký tài khoản đầu tiên → hệ thống tự gán quyền **Chủ quán (Admin)**.
3. Vào **Cài đặt & Phân quyền** để chọn tiền tệ (`LAK ₭` hoặc `VND ₫`), nhập thông tin tài khoản QR của quán và gán vai trò cho nhân viên.
