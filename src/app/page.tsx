import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  PackagePlus,
  Receipt,
  ShoppingBag,
  Wallet,
} from "lucide-react";

export default async function DashboardPage() {
  const { profile, settings } = await requireRouteAccess("/");
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [ordersRes, lowStockRes, recurringRes, openShiftRes] = supabase
    ? await Promise.all([
        supabase
          .from("orders")
          .select("total_amount, payment_status, status")
          .gte("created_at", todayStart.toISOString())
          .eq("payment_status", "paid")
          .neq("status", "cancelled"),
        supabase
          .from("ingredients")
          .select("id, name, current_stock, min_stock_alert, base_unit")
          .eq("is_active", true),
        supabase
          .from("recurring_expenses")
          .select("id, title, amount, next_due_date, expense_group")
          .eq("is_active", true)
          .order("next_due_date", { ascending: true })
          .limit(3),
        supabase
          .from("shifts")
          .select("id, opened_at, opening_cash")
          .eq("status", "open")
          .limit(1)
          .maybeSingle(),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: null }];

  const todayOrders = ordersRes.data ?? [];
  const todayRevenue = todayOrders.reduce(
    (sum, row) => sum + Number(row.total_amount ?? 0),
    0
  );

  const lowStockItems = (lowStockRes.data ?? []).filter(
    (item) => Number(item.current_stock) <= Number(item.min_stock_alert)
  );

  const recurringReminders = recurringRes.data ?? [];
  const openShift = openShiftRes.data;

  const quickActions = [
    {
      href: "/pos",
      title: "Bán hàng (POS)",
      desc: "Tạo đơn tại bàn / mang đi",
      icon: ShoppingBag,
    },
    {
      href: "/shifts",
      title: "Ca & Cân đối tiền",
      desc: openShift ? "Đang có ca mở" : "Chưa mở ca hôm nay",
      icon: Wallet,
    },
    {
      href: "/inventory",
      title: "Nhập & Tồn kho",
      desc: "Phiếu nhập, định lượng",
      icon: PackagePlus,
    },
    {
      href: "/stock-take",
      title: "Kiểm kê & Cân đối",
      desc: "Đối soát hao hụt kho",
      icon: ClipboardCheck,
    },
    {
      href: "/expenses",
      title: "Điện, Nước & Mặt bằng",
      desc: "Ghi nhận chi phí vận hành",
      icon: Receipt,
    },
  ];

  return (
    <AppShell profile={profile} settings={settings}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#4A2C18]">
              Xin chào, {profile.full_name}
            </h1>
            <p className="text-xs sm:text-sm text-[#7B6554]">
              Tổng quan vận hành hôm nay tại {settings.shop_name}
            </p>
          </div>
          <Link
            href="/pos"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A2C18] text-white text-sm font-semibold hover:bg-[#3A2212]"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Mở màn hình POS</span>
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
            <p className="text-xs text-[#7B6554]">Doanh thu hôm nay</p>
            <p className="text-2xl font-bold text-[#4A2C18] mt-1">
              {formatMoney(todayRevenue, settings.currency_code)}
            </p>
            <p className="text-xs text-[#7B6554] mt-1">
              {todayOrders.length} đơn đã thanh toán
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
            <p className="text-xs text-[#7B6554]">Trạng thái ca làm việc</p>
            <p className="text-lg font-bold mt-1 text-[#4A2C18]">
              {openShift ? "Đang mở ca" : "Chưa mở ca"}
            </p>
            <p className="text-xs text-[#7B6554] mt-1">
              {openShift
                ? `Tiền đầu ca: ${formatMoney(openShift.opening_cash, settings.currency_code)}`
                : "Vào mục Ca & Cân đối để mở ca"}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
            <p className="text-xs text-[#7B6554]">Cảnh báo tồn kho thấp</p>
            <p
              className={`text-2xl font-bold mt-1 ${
                lowStockItems.length > 0 ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {lowStockItems.length} nguyên liệu
            </p>
            <p className="text-xs text-[#7B6554] mt-1">
              {lowStockItems.length > 0 ? "Cần nhập bổ sung sớm" : "Kho đang ổn định"}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4">
            <p className="text-xs text-[#7B6554]">Chi phí định kỳ sắp tới</p>
            <p className="text-2xl font-bold text-[#4A2C18] mt-1">
              {recurringReminders.length} khoản
            </p>
            <p className="text-xs text-[#7B6554] mt-1">
              Mặt bằng, điện, nước, internet
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-bold text-[#4A2C18] mb-3">Truy cập nhanh</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickActions.map((act) => {
              const Icon = act.icon;
              return (
                <Link
                  key={act.href}
                  href={act.href}
                  className="group bg-white rounded-2xl border border-[#E7DDD0] p-4 flex items-center justify-between hover:border-[#C97B36] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F3ECE2] text-[#4A2C18] flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#4A2C18]">
                        {act.title}
                      </p>
                      <p className="text-xs text-[#7B6554]">{act.desc}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#8C7563] group-hover:translate-x-0.5 transition-transform" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Alerts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-[#4A2C18]">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Nguyên liệu dưới mức tối thiểu</span>
            </div>
            {lowStockItems.length === 0 ? (
              <p className="text-xs text-[#7B6554]">
                Chưa có nguyên liệu nào dưới mức cảnh báo.
              </p>
            ) : (
              <ul className="divide-y divide-[#F3ECE2] text-xs">
                {lowStockItems.map((item) => (
                  <li key={item.id} className="py-2 flex justify-between">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-red-700 font-semibold">
                      Còn {item.current_stock} {item.base_unit} (tối thiểu{" "}
                      {item.min_stock_alert})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#E7DDD0] p-4 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-[#4A2C18]">
              <CalendarClock className="w-4 h-4 text-[#C97B36]" />
              <span>Lịch thanh toán định kỳ (Mặt bằng / Điện / Nước)</span>
            </div>
            {recurringReminders.length === 0 ? (
              <p className="text-xs text-[#7B6554]">
                Chưa thiết lập lịch nhắc chi phí định kỳ.
              </p>
            ) : (
              <ul className="divide-y divide-[#F3ECE2] text-xs">
                {recurringReminders.map((r) => (
                  <li key={r.id} className="py-2 flex justify-between">
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-[#7B6554]">Hạn: {r.next_due_date}</p>
                    </div>
                    <span className="font-semibold text-[#4A2C18]">
                      {formatMoney(r.amount, settings.currency_code)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
