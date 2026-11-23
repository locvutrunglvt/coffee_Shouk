import { createClient } from "@/lib/supabase/client";
import {
  formatMoney,
  getLocalCurrentMonthStr,
  getLocalMonthBoundsIso,
  getLocalTodayDateStr,
  getLocalTodayStartIso,
} from "@/lib/format";
import { translateText } from "@/lib/i18n/catalogTranslator";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { UserRole } from "@/lib/rbac";

export type GuideKey = Exclude<
  keyof Dictionary["guides"],
  "toggleOpen" | "toggleClose" | "tipLabel"
>;

export interface RolePermissionsSummary {
  canViewRevenue: boolean;
  canViewShift: boolean;
  canViewInventoryCosts: boolean;
  canViewLowStockNames: boolean;
  canViewExpenses: boolean;
  canViewPnl: boolean;
  canViewMenuCatalog: boolean;
  canViewAdminRbac: boolean;
  canCancelPaid: boolean;
}

export function getAiRolePermissions(role: UserRole): RolePermissionsSummary {
  const isHighAdmin = role === "developer" || role === "admin";
  const isManagement = isHighAdmin || role === "manager";
  const isCashierOrUp = isManagement || role === "cashier";
  return {
    canViewRevenue: isCashierOrUp,
    canViewShift: isCashierOrUp,
    canViewInventoryCosts: isManagement,
    canViewLowStockNames: isManagement || role === "barista",
    canViewExpenses: isManagement,
    canViewPnl: isManagement,
    canViewMenuCatalog: isManagement || role === "barista",
    canViewAdminRbac: isHighAdmin,
    canCancelPaid: isHighAdmin,
  };
}

export interface TaOiLiveContext {
  role: UserRole;
  shopName: string;
  currencyCode: string;
  fetchedAt: string;
  isOffline: boolean;
  // Bar / Queue (safe for all operational roles)
  barPendingCount: number;
  barPreparingCount: number;
  barReadyCount: number;
  todayUnpaidCount: number;
  soldOutProducts: string[];
  activeMenuCount: number;
  // Revenue (developer, admin, manager, cashier)
  todayRevenue: number | null;
  todayPaidCount: number | null;
  todayCashTotal: number | null;
  todayQrTotal: number | null;
  todayTopItems: Array<{ name: string; qty: number }>;
  // Shift (developer, admin, manager, cashier)
  openShift: {
    openingCash: number;
    cashSales: number;
    qrSales: number;
    pettyExpenses: number;
    expectedCash: number;
  } | null;
  // Inventory & Stock-take (names for manager+/barista; costs/imports/stock-take for manager+)
  lowStockIngredients: Array<{
    name: string;
    currentStock: number;
    minStock: number;
    baseUnit: string;
  }>;
  totalIngredientsCount: number;
  totalInventoryValue: number | null;
  todayImportsCount: number | null;
  todayImportsTotal: number | null;
  latestStockTake: {
    status: string;
    date: string;
    totalVarianceValue: number;
  } | null;
  // Expenses & Monthly P&L (developer, admin, manager)
  monthRevenueApprox: number | null;
  monthExpensesTotal: number | null;
  upcomingBills: Array<{ title: string; amount: number; nextDueDate: string }>;
  // Staff / RBAC (developer, admin)
  activeUsersCount: number | null;
  pendingUsersCount: number | null;
}

/**
 * Normalizes text across Vietnamese (accent-insensitive), English, and Lao scripts.
 */
export function normalizeAiText(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9\u0e80-\u0eff.\s/_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchTaOiLiveContext(
  locale: Locale,
  role: UserRole,
  defaultShopName = "Ta Oi Coffee",
  defaultCurrency = "LAK"
): Promise<TaOiLiveContext> {
  const perms = getAiRolePermissions(role);
  const todayStartIso = getLocalTodayStartIso();
  const todayDateStr = getLocalTodayDateStr();
  const currentMonth = getLocalCurrentMonthStr();
  const { startIso: monthStartIso, endIso: monthEndIso } =
    getLocalMonthBoundsIso(currentMonth);

  const fallback: TaOiLiveContext = {
    role,
    shopName: defaultShopName || "Ta Oi Coffee",
    currencyCode: defaultCurrency || "LAK",
    fetchedAt: new Date().toLocaleTimeString(
      locale === "lo" ? "lo-LA" : locale === "en" ? "en-US" : "vi-VN",
      { hour: "2-digit", minute: "2-digit" }
    ),
    isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
    barPendingCount: 0,
    barPreparingCount: 0,
    barReadyCount: 0,
    todayUnpaidCount: 0,
    soldOutProducts: [],
    activeMenuCount: 0,
    todayRevenue: perms.canViewRevenue ? 0 : null,
    todayPaidCount: perms.canViewRevenue ? 0 : null,
    todayCashTotal: perms.canViewRevenue ? 0 : null,
    todayQrTotal: perms.canViewRevenue ? 0 : null,
    todayTopItems: [],
    openShift: null,
    lowStockIngredients: [],
    totalIngredientsCount: 0,
    totalInventoryValue: perms.canViewInventoryCosts ? 0 : null,
    todayImportsCount: perms.canViewInventoryCosts ? 0 : null,
    todayImportsTotal: perms.canViewInventoryCosts ? 0 : null,
    latestStockTake: null,
    monthRevenueApprox: perms.canViewPnl ? 0 : null,
    monthExpensesTotal: perms.canViewExpenses ? 0 : null,
    upcomingBills: [],
    activeUsersCount: perms.canViewAdminRbac ? 0 : null,
    pendingUsersCount: perms.canViewAdminRbac ? 0 : null,
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return fallback;
  }

  try {
    const supabase = createClient();

    const [
      ordersRes,
      barQueueRes,
      prodRes,
      shiftRes,
      ingRes,
      importsRes,
      stockTakeRes,
      expRes,
      recRes,
      monthOrdersRes,
      profilesRes,
    ] = await Promise.allSettled([
      perms.canViewRevenue
        ? supabase
            .from("orders")
            .select(
              "total_amount, payment_status, payment_method, status, order_items(product_name, quantity)"
            )
            .gte("created_at", todayStartIso)
            .neq("status", "cancelled")
        : Promise.resolve({ data: null }),
      supabase
        .from("orders")
        .select("status, payment_status")
        .gte("created_at", todayStartIso)
        .neq("status", "cancelled"),
      supabase
        .from("products")
        .select("name, name_en, name_lo, is_available")
        .eq("is_active", true),
      perms.canViewShift
        ? supabase
            .from("shifts")
            .select(
              "opening_cash, total_cash_sales, total_qr_sales, total_petty_expenses, expected_cash"
            )
            .eq("status", "open")
            .order("opened_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      perms.canViewLowStockNames
        ? supabase
            .from("ingredients")
            .select(
              perms.canViewInventoryCosts
                ? "name, current_stock, min_stock, base_unit, avg_unit_cost"
                : "name, current_stock, min_stock, base_unit"
            )
            .eq("is_active", true)
        : Promise.resolve({ data: null }),
      perms.canViewInventoryCosts
        ? supabase
            .from("stock_imports")
            .select("total_amount")
            .eq("import_date", todayDateStr)
        : Promise.resolve({ data: null }),
      perms.canViewInventoryCosts
        ? supabase
            .from("stock_takes")
            .select("status, stock_take_date, total_variance_value")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      perms.canViewExpenses
        ? supabase
            .from("expenses")
            .select("amount, allocated_months")
            .eq("billing_month", currentMonth)
        : Promise.resolve({ data: null }),
      perms.canViewExpenses
        ? supabase
            .from("recurring_expenses")
            .select("title, amount, next_due_date")
            .eq("is_active", true)
            .order("next_due_date", { ascending: true })
            .limit(3)
        : Promise.resolve({ data: null }),
      perms.canViewPnl
        ? supabase
            .from("orders")
            .select("total_amount")
            .eq("payment_status", "paid")
            .neq("status", "cancelled")
            .gte("created_at", monthStartIso)
            .lt("created_at", monthEndIso)
        : Promise.resolve({ data: null }),
      perms.canViewAdminRbac
        ? supabase.from("profiles").select("role, is_active")
        : Promise.resolve({ data: null }),
    ]);

    const ctx: TaOiLiveContext = { ...fallback, isOffline: false };

    if (
      barQueueRes.status === "fulfilled" &&
      Array.isArray(barQueueRes.value.data)
    ) {
      for (const row of barQueueRes.value.data as Array<{
        status: string;
        payment_status: string;
      }>) {
        if (row.status === "pending") ctx.barPendingCount += 1;
        else if (row.status === "preparing") ctx.barPreparingCount += 1;
        else if (row.status === "ready") ctx.barReadyCount += 1;
        if (row.payment_status !== "paid") ctx.todayUnpaidCount += 1;
      }
    }

    if (
      perms.canViewRevenue &&
      ordersRes.status === "fulfilled" &&
      Array.isArray(ordersRes.value.data)
    ) {
      const topMap = new Map<string, number>();
      let rev = 0;
      let paidCnt = 0;
      let cashTot = 0;
      let qrTot = 0;
      for (const o of ordersRes.value.data as Array<{
        total_amount: number | string;
        payment_status: string;
        payment_method: string;
        order_items?: Array<{ product_name: string; quantity: number }>;
      }>) {
        const amt = Number(o.total_amount ?? 0);
        if (o.payment_status === "paid") {
          paidCnt += 1;
          rev += amt;
          if (o.payment_method === "cash") cashTot += amt;
          else if (o.payment_method === "qr_transfer") qrTot += amt;
        }
        for (const it of o.order_items ?? []) {
          const nm = translateText(it.product_name, locale);
          topMap.set(nm, (topMap.get(nm) ?? 0) + Number(it.quantity ?? 0));
        }
      }
      ctx.todayRevenue = rev;
      ctx.todayPaidCount = paidCnt;
      ctx.todayCashTotal = cashTot;
      ctx.todayQrTotal = qrTot;
      ctx.todayTopItems = Array.from(topMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, qty]) => ({ name, qty }));
    }

    if (prodRes.status === "fulfilled" && Array.isArray(prodRes.value.data)) {
      const prods = prodRes.value.data as Array<{
        name: string;
        name_en?: string;
        name_lo?: string;
        is_available: boolean;
      }>;
      ctx.activeMenuCount = prods.length;
      ctx.soldOutProducts = prods
        .filter((p) => !p.is_available)
        .map((p) =>
          locale === "lo" && p.name_lo
            ? p.name_lo
            : locale === "en" && p.name_en
            ? p.name_en
            : translateText(p.name, locale)
        )
        .slice(0, 8);
    }

    if (
      perms.canViewShift &&
      shiftRes.status === "fulfilled" &&
      shiftRes.value.data
    ) {
      const s = shiftRes.value.data;
      ctx.openShift = {
        openingCash: Number(s.opening_cash ?? 0),
        cashSales: Number(s.total_cash_sales ?? 0),
        qrSales: Number(s.total_qr_sales ?? 0),
        pettyExpenses: Number(s.total_petty_expenses ?? 0),
        expectedCash: Number(s.expected_cash ?? 0),
      };
    }

    if (
      perms.canViewLowStockNames &&
      ingRes.status === "fulfilled" &&
      Array.isArray(ingRes.value.data)
    ) {
      const rows = ingRes.value.data as unknown as Array<{
        name: string;
        current_stock: number;
        min_stock: number;
        base_unit: string;
        avg_unit_cost?: number;
      }>;
      ctx.totalIngredientsCount = rows.length;
      ctx.lowStockIngredients = rows
        .filter((i) => Number(i.current_stock) <= Number(i.min_stock))
        .slice(0, 8)
        .map((i) => ({
          name: i.name,
          currentStock: Number(i.current_stock),
          minStock: Number(i.min_stock),
          baseUnit: i.base_unit,
        }));
      if (perms.canViewInventoryCosts) {
        ctx.totalInventoryValue = rows.reduce(
          (acc, i) =>
            acc +
            Math.max(0, Number(i.current_stock ?? 0)) *
              Number(i.avg_unit_cost ?? 0),
          0
        );
      }
    }

    if (
      perms.canViewInventoryCosts &&
      importsRes.status === "fulfilled" &&
      Array.isArray(importsRes.value.data)
    ) {
      ctx.todayImportsCount = importsRes.value.data.length;
      ctx.todayImportsTotal = importsRes.value.data.reduce(
        (acc, r) => acc + Number(r.total_amount ?? 0),
        0
      );
    }

    if (
      perms.canViewInventoryCosts &&
      stockTakeRes.status === "fulfilled" &&
      stockTakeRes.value.data
    ) {
      const st = stockTakeRes.value.data as {
        status: string;
        stock_take_date: string;
        total_variance_value: number;
      };
      ctx.latestStockTake = {
        status: st.status,
        date: st.stock_take_date,
        totalVarianceValue: Number(st.total_variance_value ?? 0),
      };
    }

    if (
      perms.canViewExpenses &&
      expRes.status === "fulfilled" &&
      Array.isArray(expRes.value.data)
    ) {
      ctx.monthExpensesTotal = expRes.value.data.reduce((acc, r) => {
        const months = Math.max(1, Number(r.allocated_months ?? 1));
        return acc + Number(r.amount ?? 0) / months;
      }, 0);
    }

    if (
      perms.canViewExpenses &&
      recRes.status === "fulfilled" &&
      Array.isArray(recRes.value.data)
    ) {
      ctx.upcomingBills = (
        recRes.value.data as Array<{
          title: string;
          amount: number;
          next_due_date: string;
        }>
      ).map((b) => ({
        title: b.title,
        amount: Number(b.amount ?? 0),
        nextDueDate: b.next_due_date,
      }));
    }

    if (
      perms.canViewPnl &&
      monthOrdersRes.status === "fulfilled" &&
      Array.isArray(monthOrdersRes.value.data)
    ) {
      ctx.monthRevenueApprox = monthOrdersRes.value.data.reduce(
        (acc, o) => acc + Number(o.total_amount ?? 0),
        0
      );
    }

    if (
      perms.canViewAdminRbac &&
      profilesRes.status === "fulfilled" &&
      Array.isArray(profilesRes.value.data)
    ) {
      const profs = profilesRes.value.data as Array<{ is_active: boolean }>;
      ctx.activeUsersCount = profs.filter((p) => p.is_active).length;
      ctx.pendingUsersCount = profs.filter((p) => !p.is_active).length;
    }

    return ctx;
  } catch {
    return fallback;
  }
}

function buildRoleDeniedMsg(
  role: UserRole,
  requiredRoleText: { vi: string; en: string; lo: string },
  locale: Locale,
  t: Dictionary
): string {
  const roleName = t.roles[role];
  if (locale === "lo") {
    return `🔒 ຂໍ້ມູນນີ້ຖືກຈຳກັດຕາມສິດຜູ້ໃຊ້ (${roleName}).\nສະເພາະບົດບາດ ${requiredRoleText.lo} ຈຶ່ງສາມາດເບິ່ງ ແລະ ປະຕິບັດລາຍການນີ້ໄດ້.`;
  }
  if (locale === "en") {
    return `🔒 Restricted for your current role (${roleName}).\nOnly ${requiredRoleText.en} can view or perform this action.`;
  }
  return `🔒 Thông tin này bị giới hạn theo phân quyền của bạn (${roleName}).\nChỉ tài khoản ${requiredRoleText.vi} mới có quyền xem số liệu và thao tác mục này.`;
}

function formatGuideResponse(
  locale: Locale,
  guideKey: GuideKey,
  t: Dictionary
): string {
  const g = t.guides[guideKey];
  const numbered = g.steps.map((s, idx) => `${idx + 1}. ${s}`).join("\n");
  return `📘 ${g.title}\n\n${numbered}\n\n💡 ${t.guides.tipLabel}: ${g.tip}`;
}

export interface AiRule {
  id: string;
  keywords: string[];
  minScore?: number;
  answer: (
    ctx: TaOiLiveContext | null,
    locale: Locale,
    guideKey: GuideKey,
    t: Dictionary
  ) => string;
}

const RULES: AiRule[] = [
  {
    id: "current_guide",
    keywords: [
      "huong dan",
      "chi dan",
      "man hinh nay",
      "trang nay",
      "cach dung",
      "guide",
      "how to use",
      "this page",
      "this screen",
      "help",
      "ຄູ່ມື",
      "ແນະນຳ",
      "ວິທີໃຊ້",
      "ໜ້ານີ້",
    ],
    answer: (_ctx, locale, guideKey, t) =>
      formatGuideResponse(locale, guideKey, t),
  },
  {
    id: "today_sales",
    keywords: [
      "hom nay",
      "ban hang",
      "doanh thu",
      "ban duoc",
      "ban chay",
      "mua ban",
      "don hang",
      "today",
      "sales",
      "revenue",
      "top",
      "best seller",
      "ມື້ນີ້",
      "ຍອດຂາຍ",
      "ຂາຍໄດ້",
      "ຂາຍດີ",
    ],
    answer: (ctx, locale, _gk, t) => {
      const role = ctx?.role ?? "staff";
      const perms = getAiRolePermissions(role);
      if (!perms.canViewRevenue) {
        return buildRoleDeniedMsg(
          role,
          {
            vi: "Thu ngân / Quản lý ca / Quản lý cao nhất (Admin)",
            en: "Cashier / Shift Manager / Head Manager (Admin)",
            lo: "ແຄສເຊຍ / ຜູ້ຈັດການກະ / ຜູ້ຈັດການສູງສຸດ (Admin)",
          },
          locale,
          t
        );
      }
      if (!ctx) return t.common.loading;
      const cur = ctx.currencyCode;
      const rev = formatMoney(ctx.todayRevenue ?? 0, cur);
      const cash = formatMoney(ctx.todayCashTotal ?? 0, cur);
      const qr = formatMoney(ctx.todayQrTotal ?? 0, cur);
      const topText = ctx.todayTopItems.length
        ? ctx.todayTopItems.map((x) => `${x.name} (${x.qty})`).join(", ")
        : locale === "lo"
        ? "ຍັງບໍ່ມີ"
        : locale === "en"
        ? "None yet"
        : "Chưa có món bán hôm nay";

      if (locale === "lo") {
        return (
          `☕ ສະຫຼຸບການຂາຍມື້ນີ້ (${ctx.shopName}):\n` +
          `• ລາຍຮັບທີ່ເກັບເງິນແລ້ວ: ${rev} (${ctx.todayPaidCount ?? 0} ບິນ)\n` +
          `• ເງິນສົດ: ${cash} | ໂອນ QR: ${qr}\n` +
          `• ບິນລໍຖ້າເກັບເງິນ: ${ctx.todayUnpaidCount} ບິນ\n` +
          `• ເມນູຂາຍດີ: ${topText}`
        );
      }
      if (locale === "en") {
        return (
          `☕ Today's Sales Summary (${ctx.shopName}):\n` +
          `• Paid revenue: ${rev} (${ctx.todayPaidCount ?? 0} orders)\n` +
          `• Cash: ${cash} | QR Transfer: ${qr}\n` +
          `• Unpaid waiting collection: ${ctx.todayUnpaidCount}\n` +
          `• Top drinks: ${topText}`
        );
      }
      return (
        `☕ Tổng kết bán hàng hôm nay (${ctx.shopName}):\n` +
        `• Doanh thu đã thu: ${rev} (${ctx.todayPaidCount ?? 0} đơn đã thanh toán)\n` +
        `• Tiền mặt: ${cash} | Chuyển khoản QR: ${qr}\n` +
        `• Đơn đang chờ thu tiền: ${ctx.todayUnpaidCount} đơn\n` +
        `• Món bán chạy nhất hôm nay: ${topText}`
      );
    },
  },
  {
    id: "bar_queue",
    keywords: [
      "pha che",
      "hang cho",
      "kds",
      "cho pha",
      "dang pha",
      "xong mon",
      "tam het",
      "mon het",
      "barista",
      "bar",
      "queue",
      "sold out",
      "preparing",
      "ready",
      "ບາ",
      "ຄິວ",
      "ລໍຖ້າຊົງ",
      "ໝົດຊົ່ວຄາວ",
      "ກຳລັງຊົງ",
    ],
    answer: (ctx, locale) => {
      const pending = ctx?.barPendingCount ?? 0;
      const preparing = ctx?.barPreparingCount ?? 0;
      const ready = ctx?.barReadyCount ?? 0;
      const soldOut = ctx?.soldOutProducts ?? [];
      const soldOutText = soldOut.length
        ? soldOut.join(", ")
        : locale === "lo"
        ? "ບໍ່ມີ"
        : locale === "en"
        ? "None"
        : "Không có";

      if (locale === "lo") {
        return (
          `🍹 ສະຖານະໜ້າຈໍບາ (Bar KDS) ປັດຈຸບັນ:\n` +
          `• ລໍຖ້າຊົງ (Pending): ${pending} ອໍເດີ\n` +
          `• ກຳລັງຊົງ (Preparing): ${preparing} ອໍເດີ\n` +
          `• ພ້ອມເສີບ (Ready): ${ready} ອໍເດີ\n` +
          `• ເມນູກຳລັງປິດ/ໝົດຊົ່ວຄາວ (${soldOut.length}): ${soldOutText}\n\n` +
          `👉 ຂັ້ນຕອນບາ: ກົດ 'ເລີ່ມຊົງ' → 'ຊົງແລ້ວ' → 'ສົ່ງລູກຄ້າແລ້ວ'. ຖ້າວັດຖຸດິບໝົດ ເຂົ້າໜ້າ 'ເມນູ' (/menu) ເພື່ອກົດປິດຊົ່ວຄາວໄດ້ທັນທີ.`
        );
      }
      if (locale === "en") {
        return (
          `🍹 Live Bar Display (KDS) Status:\n` +
          `• Pending orders: ${pending} | Preparing: ${preparing} | Ready to serve: ${ready}\n` +
          `• Sold-out items (${soldOut.length}): ${soldOutText}\n\n` +
          `👉 Bar workflow (/bar): tap 'Start making' → 'Mark ready' → 'Served / Done'. Baristas can toggle 'Sold out' on Menu (/menu) if an ingredient runs out.`
        );
      }
      return (
        `🍹 Tình trạng quầy Pha chế (Bar KDS) hiện tại:\n` +
        `• Chờ pha (Pending): ${pending} đơn | Đang pha: ${preparing} đơn | Xong chờ bưng: ${ready} đơn\n` +
        `• Món đang báo tạm hết (${soldOut.length}): ${soldOutText}\n\n` +
        `👉 Quy trình quầy Bar (/bar): Bấm 'Bắt đầu làm' → 'Xong món' → 'Đã giao khách'. Chú ý các dòng ghi chú màu vàng và Topping; có thể vào Thực đơn (/menu) để bật/tắt 'Tạm hết'.`
      );
    },
  },
  {
    id: "shift_cash",
    keywords: [
      "ca lam",
      "mo ca",
      "ket ca",
      "dong ca",
      "ket tien",
      "tien mat",
      "chi lat vat",
      "shift",
      "drawer",
      "cash float",
      "petty",
      "expected cash",
      "ກະ",
      "ເປີດກະ",
      "ປິດກະ",
      "ລິ້ນຊັກ",
      "ຈ່າຍຍ່ອຍ",
    ],
    answer: (ctx, locale, _gk, t) => {
      const role = ctx?.role ?? "staff";
      const perms = getAiRolePermissions(role);
      if (!perms.canViewShift) {
        return buildRoleDeniedMsg(
          role,
          {
            vi: "Thu ngân / Quản lý ca / Quản lý cao nhất (Admin)",
            en: "Cashier / Shift Manager / Head Manager (Admin)",
            lo: "ແຄສເຊຍ / ຜູ້ຈັດການກະ / ຜູ້ຈັດການສູງສຸດ (Admin)",
          },
          locale,
          t
        );
      }

      const cur = ctx?.currencyCode || "LAK";
      if (!ctx?.openShift) {
        if (locale === "lo") {
          return (
            "💼 ສະຖານະກະ: ຍັງບໍ່ມີກະເປີດຢູ່.\n" +
            "• ເຂົ້າ 'ກະ & ດຸ່ນດ່ຽງເງິນ' (/shifts) ໃສ່ເງິນທອນຕົ້ນກະ ແລ້ວກົດ 'ເປີດກະເຮັດວຽກໃໝ່'.\n" +
            "• ລະບົບອະນຸຍາດໃຫ້ເປີດໄດ້ພຽງ 1 ກະຕໍ່ຄັ້ງ (ປ້ອງກັນເປີດກະຊ້ຳຊ້ອນ)."
          );
        }
        if (locale === "en") {
          return (
            "💼 Shift Status: No shift currently open.\n" +
            "• Open 'Shifts & Cash Balance' (/shifts), enter opening float, and click 'Open new shift'.\n" +
            "• Only 1 shift can be open at a time (database enforced)."
          );
        }
        return (
          "💼 Tình trạng ca: Hiện chưa có ca nào đang mở.\n" +
          "• Vào 'Ca & Cân đối tiền' (/shifts), nhập số tiền lẻ đầu ca rồi bấm 'Mở ca làm việc mới'.\n" +
          "• Hệ thống khóa chặt tối đa 1 ca mở tại một thời điểm để tránh lệch két."
        );
      }

      const s = ctx.openShift;
      if (locale === "lo") {
        return (
          `💼 ກະເຮັດວຽກປັດຈຸບັນ (ກຳລັງເປີດ):\n` +
          `• ເງິນທອນຕົ້ນກະ: ${formatMoney(s.openingCash, cur)}\n` +
          `• ຂາຍເງິນສົດ: ${formatMoney(s.cashSales, cur)} | ໂອນ QR: ${formatMoney(s.qrSales, cur)}\n` +
          `• ຈ່າຍຍ່ອຍໃນກະ: ${formatMoney(s.pettyExpenses, cur)}\n` +
          `• ເງິນສົດຄາດວ່າໃນລິ້ນຊັກ: ${formatMoney(s.expectedCash, cur)}\n` +
          `👉 ເມື່ອປິດກະ, ນັບເງິນສົດຕົວຈິງໃສ່ຊ່ອງກວດສອບ — ຍອດ QR ແຍກຕ່າງຫາກບໍ່ປົນເງິນສົດ.`
        );
      }
      if (locale === "en") {
        return (
          `💼 Current Open Shift:\n` +
          `• Opening float: ${formatMoney(s.openingCash, cur)}\n` +
          `• Cash sales: ${formatMoney(s.cashSales, cur)} | QR sales: ${formatMoney(s.qrSales, cur)}\n` +
          `• Petty cash out: ${formatMoney(s.pettyExpenses, cur)}\n` +
          `• Expected drawer cash: ${formatMoney(s.expectedCash, cur)}\n` +
          `👉 At shift close, count physical cash in the drawer; QR sales stay separate.`
        );
      }
      return (
        `💼 Ca đang mở hiện tại:\n` +
        `• Tiền đầu ca: ${formatMoney(s.openingCash, cur)}\n` +
        `• Doanh thu tiền mặt: ${formatMoney(s.cashSales, cur)} | Doanh thu QR: ${formatMoney(s.qrSales, cur)}\n` +
        `• Chi lặt vặt trong ca: ${formatMoney(s.pettyExpenses, cur)}\n` +
        `• Tiền mặt lý thuyết trong két: ${formatMoney(s.expectedCash, cur)}\n` +
        `👉 Cuối ca đếm tiền mặt thực tế để chốt; doanh thu QR tách riêng không cộng vào két tiền mặt.`
      );
    },
  },
  {
    id: "pos_checkout_cancel",
    keywords: [
      "thu tien",
      "thanh toan",
      "huy don",
      "chuyen khoan",
      "qr",
      "dat mon",
      "quet ma",
      "pos",
      "phuc vu",
      "pay",
      "collect",
      "cancel",
      "order",
      "vietqr",
      "laoqr",
      "ເກັບເງິນ",
      "ຊຳລະ",
      "ຍົກເລີກ",
      "ສັ່ງອາຫານ",
    ],
    answer: (ctx, locale, _gk, t) => {
      const role = ctx?.role ?? "staff";
      const perms = getAiRolePermissions(role);
      const roleName = t.roles[role];
      const unpaid = ctx?.todayUnpaidCount ?? 0;

      if (locale === "lo") {
        const cancelNote = perms.canCancelPaid
          ? "ໃນຖານະ Admin/Developer, ທ່ານສາມາດຍົກເລີກໄດ້ທັງບິນຍັງບໍ່ຈ່າຍ ແລະ ບິນຊຳລະແລ້ວ (ລະບົບຈະຄືນຍອດກະ & ຄືນສາງອັດຕະໂນມັດ)."
          : `ສິດປັດຈຸບັນ (${roleName}): ສາມາດຍົກເລີກໄດ້ສະເພາະບິນ "ຍັງບໍ່ຈ່າຍ". ຖ້າຕ້ອງການຍົກເລີກບິນທີ່ຊຳລະແລ້ວ ຕ້ອງໃຫ້ Admin ດຳເນີນການ.`;
        const collectNote =
          role === "staff"
            ? "ພະນັກງານເສີບສ້າງອໍເດີ 'ຍັງບໍ່ຈ່າຍ' ໃຫ້ບາຊົງກ່ອນ ແລ້ວແຄສເຊຍເປັນຜູ້ກົດເກັບເງິນ."
            : "ສາມາດກົດ 'ຊຳລະ & ສົ່ງບາ' ຫຼື ກົດ 'ເກັບເງິນ' ຢູ່ລາຍການອໍເດີລໍຖ້າຊຳລະ.";

        return (
          `🧾 ຂັ້ນຕອນຂາຍ POS, ຈ່າຍ QR & ຍົກເລີກບິນ (ບິນລໍຖ້າເກັບເງິນມື້ນີ້: ${unpaid}):\n` +
          `1. ອໍເດີໂຕະ (/pos) & ລູກຄ້າສະແກນ QR ໂຕະ (/order): ອໍເດີເຂົ້າບາທັນທີ (ຈຳກັດອັດຕາປ້ອງກັນ Spam ອໍເດີປອມ).\n` +
          `2. ${collectNote}\n` +
          `3. QR ໂອນເງິນອັດຕະໂນມັດ: ຮອງຮັບທັງຮູບ QR ນິ່ງ, VietQR ແລະ LaoQR/EMVCo ໃສ່ຈຳນວນເງິນບິນອັດຕະໂນມັດ.\n` +
          `4. ສິດຍົກເລີກບິນ: ${cancelNote}`
        );
      }

      if (locale === "en") {
        const cancelNote = perms.canCancelPaid
          ? "As Admin/Developer, you can cancel both Unpaid AND Paid orders (automatically reverses shift sales & restores stock)."
          : `Your role (${roleName}) can ONLY cancel Unpaid orders. Paid orders require Head Manager (Admin) approval.`;
        const collectNote =
          role === "staff"
            ? "Waitstaff send Unpaid orders to Bar; Cashier collects payment at counter."
            : "Cashiers & Managers can Pay immediately or click 'Collect' on pending unpaid orders.";

        return (
          `🧾 POS Checkout, Dynamic QR & Cancellation Rules (Today unpaid: ${unpaid}):\n` +
          `1. Orders (/pos) & Customer Table QR (/order): protected by server pricing RPC & anti-spam rate limiting.\n` +
          `2. Payment collection: ${collectNote}\n` +
          `3. Dynamic QR: supports uploaded QR image, VietQR, and EMVCo/LaoQR with exact order total embedded.\n` +
          `4. Order Cancellation: ${cancelNote}`
        );
      }

      const cancelNote = perms.canCancelPaid
        ? "Với quyền Quản lý cao nhất (Admin) / Lập trình viên, bạn hủy được cả đơn CHƯA thu và ĐÃ thu tiền (tự động hoàn tiền ca & hoàn kho nguyên liệu)."
        : `Với quyền hiện tại (${roleName}), bạn chỉ được hủy đơn CHƯA thanh toán. Đơn ĐÃ thanh toán bắt buộc phải do Quản lý cao nhất (Admin) hủy.`;
      const collectNote =
        role === "staff"
          ? "Phục vụ lên đơn 'Gửi order (Chưa thu tiền)' để Bar pha trước; khi khách thanh toán, Thu ngân bấm 'Thu tiền'."
          : "Thu ngân/Quản lý chọn Tiền mặt hoặc QR (hỗ trợ LaoQR/EMVCo động tự chèn số tiền) → bấm 'Thanh toán & Gửi Bar' hoặc 'Thu tiền'.";

      return (
        `🧾 Quy trình POS, Khách quét QR & Hủy đơn (Đơn chờ thu hôm nay: ${unpaid}):\n` +
        `1. Tạo đơn (/pos) & Khách đặt tại bàn (/order): giá được tính bảo mật từ máy chủ và có chống spam đơn ảo.\n` +
        `2. Thu tiền: ${collectNote}\n` +
        `3. Quyền hủy đơn: ${cancelNote}`
      );
    },
  },
  {
    id: "inventory_buying",
    keywords: [
      "nhap kho",
      "nhap hang",
      "mua hang",
      "mua nguyen lieu",
      "sap het",
      "ton kho",
      "gia von",
      "dinh luong",
      "cong thuc",
      "nha cung cap",
      "low stock",
      "ingredient",
      "import",
      "inventory",
      "buy",
      "recipe",
      "cogs",
      "supplier",
      "ວັດຖຸດິບ",
      "ໃກ້ໝົດ",
      "ນຳເຂົ້າ",
      "ສາງ",
      "ຊື້ເຂົ້າ",
      "ສູດ",
      "ຕົ້ນທຶນ",
    ],
    answer: (ctx, locale, _gk, t) => {
      const role = ctx?.role ?? "staff";
      const perms = getAiRolePermissions(role);

      if (!perms.canViewLowStockNames) {
        return buildRoleDeniedMsg(
          role,
          {
            vi: "Pha chế (xem cảnh báo hết hàng) hoặc Quản lý ca / Admin (nhập kho & giá vốn)",
            en: "Barista (stock alerts) or Shift Manager / Admin (imports & COGS)",
            lo: "ບາຣິສຕ້າ (ເບິ່ງແຈ້ງເຕືອນ) ຫຼື ຜູ້ຈັດການກະ / Admin (ນຳເຂົ້າ & ຕົ້ນທຶນ)",
          },
          locale,
          t
        );
      }

      const low = ctx?.lowStockIngredients ?? [];
      const lowList = low.length
        ? low
            .map(
              (i) =>
                `- ${i.name}: ${i.currentStock} / min ${i.minStock} ${i.baseUnit}`
            )
            .join("\n")
        : locale === "lo"
        ? "✅ ວັດຖຸດິບທັງໝົດຢູ່ໃນລະດັບປອດໄພ."
        : locale === "en"
        ? "✅ All ingredients are above minimum alert level."
        : "✅ Tất cả nguyên liệu đang trên mức cảnh báo.";

      if (!perms.canViewInventoryCosts) {
        // Barista: operational stock alerts + recipes only, NO purchase costs / inventory value
        if (locale === "lo") {
          return (
            `📦 ແຈ້ງເຕືອນວັດຖຸດິບສຳລັບບາ (${ctx?.totalIngredientsCount ?? 0} ລາຍການ):\n` +
            `• ໃກ້ໝົດ (${low.length}):\n${lowList}\n\n` +
            `👉 ຖ້າວັດຖຸດິບໃດໝົດກະທັນຫັນ ໃຫ້ແຈ້ງຜູ້ຈັດການເພື່ອນຳເຂົ້າສາງ ແລະ ປິດເມນູຊົ່ວຄາວໃນໜ້າ /menu.`
          );
        }
        if (locale === "en") {
          return (
            `📦 Ingredient Alerts for Bar (${ctx?.totalIngredientsCount ?? 0} items):\n` +
            `• Low stock (${low.length}):\n${lowList}\n\n` +
            `👉 Let your Shift Manager know to restock, and toggle Sold Out on /menu if needed.`
          );
        }
        return (
          `📦 Cảnh báo nguyên liệu tại quầy Bar (${ctx?.totalIngredientsCount ?? 0} loại):\n` +
          `• Nguyên liệu sắp hết (${low.length}):\n${lowList}\n\n` +
          `👉 Báo Quản lý ca nhập thêm hàng; nếu hết đột xuất có thể gạt 'Tạm hết' món ở mục Thực đơn (/menu).`
        );
      }

      const cur = ctx?.currencyCode || "LAK";
      const invVal = formatMoney(ctx?.totalInventoryValue ?? 0, cur);
      const impTot = formatMoney(ctx?.todayImportsTotal ?? 0, cur);
      const impCnt = ctx?.todayImportsCount ?? 0;

      if (locale === "lo") {
        return (
          `📦 ສາງ, ນຳເຂົ້າສິນຄ້າ & ຕົ້ນທຶນ (/inventory):\n` +
          `• ມູນຄ່າສາງຄົງເຫຼືອປະມານ: ${invVal} (${ctx?.totalIngredientsCount ?? 0} ວັດຖຸດິບ)\n` +
          `• ໃບນຳເຂົ້າສາງມື້ນີ້: ${impCnt} ໃບ (${impTot})\n` +
          `• ວັດຖຸດິບໃກ້ໝົດ (${low.length}):\n${lowList}\n\n` +
          `👉 ວິທີໃຊ້: ຕັ້ງຄ່າໜ່ວຍຊື້ → ໜ່ວຍຕັດສູດ (g/ml), ສ້າງໃບນຳເຂົ້າເພື່ອອັບເດດຕົ້ນທຶນສະເລ່ຍ, ແລະ ຕິດສູດຕາມ Size (S/M/L) + Topping ເພື່ອຕັດສາງອັດຕະໂນມັດເວລາຂາຍ.`
        );
      }
      if (locale === "en") {
        return (
          `📦 Inventory, Daily Buying & Recipes (/inventory):\n` +
          `• Total stock value: ${invVal} (${ctx?.totalIngredientsCount ?? 0} items)\n` +
          `• Stock imports today: ${impCnt} slips (${impTot})\n` +
          `• Low-stock alerts (${low.length}):\n${lowList}\n\n` +
          `👉 Workflow: convert Purchase Units into Recipe Units (g/ml), log imports to update weighted average cost, and link Size + Topping recipes for automatic POS deduction.`
        );
      }
      return (
        `📦 Kho nguyên liệu, Nhập hàng & Định lượng (/inventory):\n` +
        `• Tổng giá trị tồn kho hiện tại: ${invVal} (${ctx?.totalIngredientsCount ?? 0} nguyên liệu)\n` +
        `• Phiếu nhập kho hôm nay: ${impCnt} phiếu (${impTot})\n` +
        `• Nguyên liệu dưới mức tối thiểu (${low.length}):\n${lowList}\n\n` +
        `👉 Quy trình: Khai báo ĐV nhập → ĐV định lượng (g/ml/cái), lập Phiếu nhập kho để tự tính Giá vốn bình quân gia quyền, và gắn công thức theo từng Size + Topping để tự trừ kho khi bán POS.`
      );
    },
  },
  {
    id: "stock_take",
    keywords: [
      "kiem ke",
      "can doi kho",
      "hao hut",
      "chenh lech",
      "kiem kho",
      "stock take",
      "stock-take",
      "variance",
      "physical count",
      "shrinkage",
      "ກວດນັບ",
      "ດຸ່ນດ່ຽງສາງ",
      "ສ່ວນຕ່າງ",
      "ສູນເສຍ",
    ],
    answer: (ctx, locale, _gk, t) => {
      const role = ctx?.role ?? "staff";
      const perms = getAiRolePermissions(role);
      if (!perms.canViewInventoryCosts) {
        return buildRoleDeniedMsg(
          role,
          {
            vi: "Quản lý ca / Quản lý cao nhất (Admin)",
            en: "Shift Manager / Head Manager (Admin)",
            lo: "ຜູ້ຈັດການກະ / ຜູ້ຈັດການສູງສຸດ (Admin)",
          },
          locale,
          t
        );
      }
      const cur = ctx?.currencyCode || "LAK";
      const st = ctx?.latestStockTake;
      const latestLine = st
        ? locale === "lo"
          ? `• ໃບກວດນັບຫຼ້າສຸດ (${st.date} • ${st.status}): ມູນຄ່າສ່ວນຕ່າງ ${formatMoney(st.totalVarianceValue, cur)}`
          : locale === "en"
          ? `• Latest stock-take (${st.date} • ${st.status}): variance value ${formatMoney(st.totalVarianceValue, cur)}`
          : `• Phiếu kiểm kê gần nhất (${st.date} • ${st.status}): chênh lệch ${formatMoney(st.totalVarianceValue, cur)}`
        : locale === "lo"
        ? "• ຍັງບໍ່ມີໃບກວດນັບສາງ."
        : locale === "en"
        ? "• No stock-take recorded yet."
        : "• Chưa có phiếu kiểm kê nào.";

      if (locale === "lo") {
        return (
          `📋 ກວດນັບ & ດຸ່ນດ່ຽງສາງ (/stock-take):\n${latestLine}\n\n` +
          `1. ກົດ 'ສ້າງໃບກວດນັບໃໝ່' ເພື່ອບັນທຶກຍອດຕາມລະບົບ.\n` +
          `2. ຊັ່ງນ້ຳໜັກ/ນັບຈິງ ແລະ ປ້ອນ 'ຍອດຕົວຈິງ' ພ້ອມໝາຍເຫດ (ເຊັ່ນ: ເຮ່ຍ, ຊົງເສຍ).\n` +
          `3. ກົດ 'ຢືນຢັນດຸ່ນດ່ຽງສາງ' ເພື່ອປັບຍອດ ແລະ ນຳຄ່າສູນເສຍເຂົ້າລາຍງານ P&L ເດືອນນັ້ນ.`
        );
      }
      if (locale === "en") {
        return (
          `📋 Stock-take & Variance Balance (/stock-take):\n${latestLine}\n\n` +
          `1. Tap 'Start new stock-take' to snapshot theoretical stock.\n` +
          `2. Weigh/count actual shelf stock and add variance notes (spillage, testing).\n` +
          `3. Finalize to sync inventory to physical count and post shrinkage to monthly P&L.`
        );
      }
      return (
        `📋 Kiểm kê & Cân đối kho (/stock-take):\n${latestLine}\n\n` +
        `1. Bấm 'Tạo phiếu kiểm kê mới' để chụp số tồn lý thuyết trên máy.\n` +
        `2. Cân/đếm thực tế từng nguyên liệu, nhập số thực tế và lý do nếu hao hụt (pha thử, đổ vỡ).\n` +
        `3. Bấm 'Chốt cân đối kho' để cập nhật tồn thực tế và tự đưa giá trị hao hụt vào Báo cáo P&L tháng.`
      );
    },
  },
  {
    id: "menu_qr",
    keywords: [
      "thuc don",
      "menu",
      "size",
      "topping",
      "so do ban",
      "in qr",
      "ma qr ban",
      "da ngon ngu",
      "name_lo",
      "name_en",
      "catalog",
      "table qr",
      "ເມນູ",
      "ໝວດໝູ່",
      "ພິມ qr",
      "ໂຕະ",
    ],
    answer: (ctx, locale, _gk, t) => {
      const role = ctx?.role ?? "staff";
      const perms = getAiRolePermissions(role);
      if (!perms.canViewMenuCatalog) {
        return buildRoleDeniedMsg(
          role,
          {
            vi: "Pha chế (bật/tắt hết món) hoặc Quản lý ca / Admin (chỉnh giá, Size, bàn & QR)",
            en: "Barista (sold-out toggle) or Shift Manager / Admin (catalog & table QR)",
            lo: "ບາຣິສຕ້າ (ປິດເມນູຊົ່ວຄາວ) ຫຼື ຜູ້ຈັດການກະ / Admin (ແກ້ໄຂເມນູ & QR ໂຕະ)",
          },
          locale,
          t
        );
      }
      const total = ctx?.activeMenuCount ?? 0;
      const soldOut = ctx?.soldOutProducts.length ?? 0;

      if (locale === "lo") {
        return (
          `📖 ການຈັດການເມນູ & QR ໂຕະ (/menu — ${total} ເມນູ • ໝົດຊົ່ວຄາວ ${soldOut}):\n` +
          `• ແຖບ ໝວດໝູ່ & ເມນູ: ເພີ່ມຮູບ (ບີບອັດອັດຕະໂນມັດ), ຕັ້ງຊື່ພາສາລາວ/ອັງກິດ (name_lo/name_en) ແລະ ຕັ້ງລາຄາຕາມ Size S/M/L.\n` +
          `• ແຖບ Topping & ໂຕະນັ່ງ: ສ້າງໂຕະ ແລະ ກົດ 'ພິມ QR ໂຕະ' ເພື່ອຕິດໄວ້ໃຫ້ລູກຄ້າສະແກນສັ່ງເອງ (/order).\n` +
          `• ບາຣິສຕ້າສາມາດກົດສະຫຼັບສະຖານະ 'ໝົດຊົ່ວຄາວ' ໄດ້ທັນທີ.`
        );
      }
      if (locale === "en") {
        return (
          `📖 Menu, Sizes, Toppings & Table QR (/menu — ${total} items • ${soldOut} sold out):\n` +
          `• Categories & Drinks: upload compressed drink photos, set custom English/Lao names (name_en/name_lo), and add S/M/L variant prices.\n` +
          `• Tables & Toppings: create tables and print Table QR cards pointing to /order for customer self-ordering.\n` +
          `• Baristas can toggle 'Sold out' directly during service.`
        );
      }
      return (
        `📖 Quản lý Thực đơn, Size, Topping & QR bàn (/menu — ${total} món • ${soldOut} tạm hết):\n` +
        `• Tab Danh mục & Món: tải ảnh (tự nén nhẹ), nhập tên tùy chỉnh tiếng Anh/Lào (name_en / name_lo) và cài giá riêng cho Size S/M/L.\n` +
        `• Tab Topping & Sơ đồ bàn: tạo bàn và bấm in phiếu QR từng bàn dẫn tới trang /order để khách tự quét gọi món.\n` +
        `• Lưu ý phân quyền: Barista được gạt Tạm hết/Còn món; sửa giá, thêm món và xóa bản ghi dành cho Quản lý/Admin.`
      );
    },
  },
  {
    id: "expenses_pnl",
    keywords: [
      "chi phi",
      "dien",
      "nuoc",
      "mat bang",
      "thue",
      "lai lo",
      "loi nhuan",
      "p&l",
      "excel",
      "bao cao",
      "hoa von",
      "dinh ky",
      "expense",
      "electric",
      "water",
      "rent",
      "profit",
      "loss",
      "report",
      "break even",
      "ຄ່າໃຊ້ຈ່າຍ",
      "ຄ່າໄຟ",
      "ຄ່ານ້ຳ",
      "ຄ່າເຊົ່າ",
      "ກຳໄລ",
      "ລາຍງານ",
    ],
    answer: (ctx, locale, _gk, t) => {
      const role = ctx?.role ?? "staff";
      const perms = getAiRolePermissions(role);

      if (!perms.canViewExpenses && !perms.canViewPnl) {
        return buildRoleDeniedMsg(
          role,
          {
            vi: "Quản lý ca / Quản lý cao nhất (Admin) (Thu ngân chỉ ghi nhận Chi lặt vặt trong ca ở /shifts)",
            en: "Shift Manager / Head Manager (Admin) (Cashier only logs shift petty cash)",
            lo: "ຜູ້ຈັດການກະ / Admin (ແຄສເຊຍບັນທຶກສະເພາະຈ່າຍຍ່ອຍໃນກະ)",
          },
          locale,
          t
        );
      }

      const cur = ctx?.currencyCode || "LAK";
      const monthRev = formatMoney(ctx?.monthRevenueApprox ?? 0, cur);
      const expMonth = formatMoney(ctx?.monthExpensesTotal ?? 0, cur);
      const bills = ctx?.upcomingBills ?? [];
      const billsText = bills.length
        ? bills
            .map(
              (b) => `- ${b.title}: ${formatMoney(b.amount, cur)} (${b.nextDueDate})`
            )
            .join("\n")
        : locale === "lo"
        ? "ບໍ່ມີບິນໃກ້ຄົບກຳນົດ"
        : locale === "en"
        ? "No upcoming recurring bills"
        : "Không có lịch nhắc sắp tới";

      if (locale === "lo") {
        return (
          `📊 ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ & ກຳໄລ/ຂາດທຶນເດືອນນີ້:\n` +
          `• ລາຍຮັບທັງໝົດເດືອນນີ້: ${monthRev}\n` +
          `• ຄ່າໃຊ້ຈ່າຍດຳເນີນງານແບ່ງປັນເດືອນນີ້: ${expMonth}\n` +
          `• ຕາຕະລາງບິນປະຈຳໃກ້ຄົບກຳນົດ:\n${billsText}\n\n` +
          `👉 ເຂົ້າ /expenses ເພື່ອຄິດໄລ່ຄ່າໄຟ/ນ້ຳຕາມເລກກົງເຕີ ຫຼື ແບ່ງປັນຄ່າເຊົ່າຫຼາຍເດືອນ, ແລະ ເຂົ້າ /reports ເພື່ອເບິ່ງກຳໄລສຸດທິ (ລວມຕົ້ນທຶນ & ສ່ວນຕ່າງສາງ) ແລະ ສົ່ງອອກ Excel 4 sheet ພ້ອມສູດ.`
        );
      }
      if (locale === "en") {
        return (
          `📊 Operating Expenses & Monthly P&L:\n` +
          `• Month-to-date paid revenue: ${monthRev}\n` +
          `• Allocated operating expenses this month: ${expMonth}\n` +
          `• Upcoming recurring bills:\n${billsText}\n\n` +
          `👉 Use /expenses for meter-based electricity/water & multi-month rent allocation, and /reports for full Net Profit (including COGS & stock-take variance) plus 4-sheet formula Excel export.`
        );
      }
      return (
        `📊 Chi phí vận hành & Báo cáo Lãi/Lỗ (P&L) tháng này:\n` +
        `• Doanh thu đã thu lũy kế trong tháng: ${monthRev}\n` +
        `• Chi phí vận hành phân bổ tháng này: ${expMonth}\n` +
        `• Lịch nhắc chi phí định kỳ sắp tới hạn:\n${billsText}\n\n` +
        `👉 Vào /expenses để tính Điện/Nước theo chỉ số công-tơ hoặc phân bổ tiền thuê nhà nhiều tháng, và vào /reports để xem Lợi nhuận ròng đầy đủ (trừ Giá vốn COGS + Hao hụt kiểm kê) và xuất Excel 4 sheet có công thức SUM/SUMIF.`
      );
    },
  },
  {
    id: "rbac_settings",
    keywords: [
      "phan quyen",
      "tai khoan",
      "duyet",
      "admin",
      "developer",
      "mat khau",
      "cai dat",
      "nhan vien",
      "khoa tai khoan",
      "role",
      "permission",
      "approve",
      "password",
      "setting",
      "staff account",
      "ແບ່ງສິດ",
      "ບັນຊີ",
      "ອະນຸມັດ",
      "ລະຫັດຜ່ານ",
      "ຕັ້ງຄ່າ",
      "ພະນັກງານ",
    ],
    answer: (ctx, locale, _gk, t) => {
      const role = ctx?.role ?? "staff";
      const perms = getAiRolePermissions(role);
      const roleName = t.roles[role];

      if (!perms.canViewAdminRbac) {
        if (locale === "lo") {
          return (
            `🛡️ ໂຄງສ້າງສິດ & ການປ່ຽນລະຫັດຜ່ານ:\n` +
            `• ສິດປັດຈຸບັນຂອງທ່ານ: ${roleName}.\n` +
            `• ທ່ານສາມາດປ່ຽນລະຫັດຜ່ານສ່ວນຕົວໄດ້ທຸກເວລາຜ່ານປຸ່ມ 'ປ່ຽນລະຫັດຜ່ານ' ຢູ່ແຖບເມນູ.\n` +
            `• ການອະນຸມັດພະນັກງານໃໝ່, ແບ່ງສິດ, ລຶບຂໍ້ມູນຫຼັກ ຫຼື ຕັ້ງຄ່າຮ້ານ ແມ່ນສະເພາະ ຜູ້ຈັດການສູງສຸດ (Admin) ຫຼື Developer.`
          );
        }
        if (locale === "en") {
          return (
            `🛡️ Access Hierarchy & Your Account:\n` +
            `• Your current role: ${roleName}.\n` +
            `• You can change your own password anytime from the sidebar 'Change password' button.\n` +
            `• Staff approvals, role changes, master record deletes, and shop settings (/settings) are restricted to Head Manager (Admin) & Developer.`
          );
        }
        return (
          `🛡️ Cơ cấu phân quyền & Tài khoản của bạn:\n` +
          `• Vai trò hiện tại của bạn: ${roleName}.\n` +
          `• Bạn tự đổi mật khẩu cá nhân bất cứ lúc nào ở nút 'Đổi mật khẩu' trên thanh menu.\n` +
          `• Duyệt tài khoản mới, phân quyền nhân viên, xóa bản ghi và cài đặt quán (/settings) chỉ dành cho Quản lý cao nhất (Admin) và Lập trình viên.`
        );
      }

      const activeCnt = ctx?.activeUsersCount ?? 0;
      const pendingCnt = ctx?.pendingUsersCount ?? 0;

      if (locale === "lo") {
        return (
          `🛡️ ການຕັ້ງຄ່າ & ແບ່ງສິດ 3 ລະດັບ (/settings):\n` +
          `• ບັນຊີພະນັກງານ: ${activeCnt} ກຳລັງໃຊ້ງານ | ${pendingCnt} ລໍຖ້າອະນຸມັດ/ຖືກລັອກ.\n` +
          `• ໂຄງສ້າງ: 1) Developer (ສູງສຸດ, ປ້ອງກັນບໍ່ໃຫ້ຄົນອື່ນແກ້) → 2) Admin ຜູ້ດຽວ (Soukthavy: ອະນຸມັດພະນັກງານ, ແບ່ງສິດ, ຍົກເລີກບິນຈ່າຍແລ້ວ) → 3) Manager / Cashier / Barista / Staff.\n` +
          `👉 ໃນ /settings ທ່ານສາມາດສ້າງບັນຊີໃຫ້ພະນັກງານໃຊ້ງານທັນທີ, ຕັ້ງຄ່າຊື່ຮ້ານ/ສະກຸນເງິນ ແລະ ອັບໂຫຼດ LaoQR / VietQR.`
        );
      }
      if (locale === "en") {
        return (
          `🛡️ 3-Tier RBAC & Shop Settings (/settings):\n` +
          `• Team accounts: ${activeCnt} active | ${pendingCnt} pending/locked.\n` +
          `• Hierarchy: 1) Developer (root, protected) → 2) Sole Head Manager Admin (approves signups, assigns staff roles, cancels paid orders) → 3) Manager / Cashier / Barista / Staff.\n` +
          `👉 In /settings you can create ready-to-use staff accounts, configure shop currency/name, and set up LaoQR/VietQR.`
        );
      }
      return (
        `🛡️ Phân quyền 3 tầng & Cài đặt quán (/settings):\n` +
        `• Tài khoản hệ thống: ${activeCnt} đang hoạt động | ${pendingCnt} chờ duyệt hoặc đang khóa.\n` +
        `• Tầng quyền: (1) Lập trình viên tối cao → (2) Duy nhất 1 Quản lý cao nhất (Admin — duyệt tài khoản tự đăng ký, phân quyền nhân viên, xóa/sửa & hủy đơn đã thu tiền) → (3) Quản lý ca / Thu ngân / Pha chế / Phục vụ.\n` +
        `👉 Vào /settings để tạo tài khoản nhân sự cấp sẵn mật khẩu, đổi tên quán/tiền tệ và cấu hình ảnh/chuỗi QR thanh toán.`
      );
    },
  },
  {
    id: "offline_pwa",
    keywords: [
      "offline",
      "pwa",
      "mat mang",
      "khong co mang",
      "cai app",
      "dien thoai",
      "apk",
      "mang yeu",
      "proxy",
      "dong bo",
      "sync",
      "install",
      "ອອບໄລ",
      "ຕິດຕັ້ງ",
      "ບໍ່ມີເນັດ",
      "ມືຖື",
    ],
    answer: (_ctx, locale) => {
      if (locale === "lo") {
        return (
          `📱 ການຕິດຕັ້ງແອັບ (PWA) & ໃຊ້ງານຍາມເນັດອ່ອນ:\n` +
          `1. ຕິດຕັ້ງເປັນແອັບ: ເປີດເວັບໃນ Chrome (Android) ຫຼື Safari (iPhone) → ກົດ 'Add to Home Screen / Install App' ເພື່ອເປີດເຕັມຈໍຄືແອັບ APK ແລະ ອັບເດດເວີຊັນໃໝ່ອັດຕະໂນມັດ.\n` +
          `2. ຍາມເນັດຂັດຂ້ອງ: ໜ້າຈໍ POS & ຜູ້ຊ່ວຍ Local AI ຍັງເປີດເບິ່ງໄດ້ 0 ວິນາທີ (PWA Cache); ຂໍ້ມູນຂາຍຕົວຈິງຈະຊິງຂຶ້ນ Supabase ເມື່ອສັນຍານເນັດກັບມາ.`
        );
      }
      if (locale === "en") {
        return (
          `📱 Installing PWA & Handling Weak Network:\n` +
          `1. Install as App: open in Chrome (Android/PC) or Safari (iOS) → tap 'Install App / Add to Home Screen' for a full-screen app that auto-updates whenever new code deploys.\n` +
          `2. Offline resilience: Local AI Guidance works instantly at 0s offline; POS/Supabase actions require active internet to commit securely without double-charging.`
        );
      }
      return (
        `📱 Cài đặt thành App (PWA) & Vận hành khi mạng yếu:\n` +
        `1. Cài đặt như App gốc (không cần APK): mở bằng Chrome (Android/PC) hoặc Safari (iPhone) → chọn 'Cài đặt ứng dụng / Thêm vào Màn hình chính'. Mỗi lần cập nhật phần mềm trên Cloudflare, App tự nâng cấp mà không cần cài lại file.\n` +
        `2. Khi mạng yếu / mất sóng: Giao diện PWA & Trợ lý AI nội bộ vẫn chạy tức thì 0 giây (không cần Proxy); khi có sóng lại hệ thống tự kết nối Supabase để đồng bộ đơn hàng và kho chính xác.`
      );
    },
  },
];

export function getTaOiQuickQuestions(t: Dictionary, role: UserRole) {
  const perms = getAiRolePermissions(role);
  const chips: Array<{ id: string; label: string; q: string }> = [];

  if (perms.canViewRevenue) {
    chips.push({ id: "today", label: t.ai.quickPromptToday, q: t.ai.quickPromptToday });
  }
  if (perms.canViewShift) {
    chips.push({ id: "shift", label: t.ai.quickPromptShift, q: t.ai.quickPromptShift });
  }
  chips.push({ id: "pos", label: t.ai.quickPromptPos, q: t.ai.quickPromptPos });
  chips.push({ id: "bar", label: t.ai.quickPromptBar, q: t.ai.quickPromptBar });

  if (perms.canViewLowStockNames) {
    chips.push({ id: "stock", label: t.ai.quickPromptStock, q: t.ai.quickPromptStock });
  }
  if (perms.canViewMenuCatalog) {
    chips.push({ id: "menu", label: t.ai.quickPromptMenu, q: t.ai.quickPromptMenu });
  }
  if (perms.canViewInventoryCosts) {
    chips.push({
      id: "stocktake",
      label: t.ai.quickPromptStockTake,
      q: t.ai.quickPromptStockTake,
    });
  }
  if (perms.canViewPnl) {
    chips.push({ id: "pnl", label: t.ai.quickPromptPnl, q: t.ai.quickPromptPnl });
  }
  if (perms.canViewAdminRbac) {
    chips.push({ id: "rbac", label: t.ai.quickPromptRbac, q: t.ai.quickPromptRbac });
  }

  chips.push({ id: "pwa", label: t.ai.quickPromptPwa, q: t.ai.quickPromptPwa });
  chips.push({ id: "guide", label: t.ai.quickPromptGuide, q: t.ai.quickPromptGuide });

  return chips;
}

export function answerTaOiQuestion(
  question: string,
  context: TaOiLiveContext | null,
  locale: Locale,
  guideKey: GuideKey,
  t: Dictionary
): string {
  const normQ = normalizeAiText(question);
  let bestRule: AiRule | null = null;
  let bestScore = 0;

  for (const rule of RULES) {
    let score = 0;
    for (const rawKw of rule.keywords) {
      const kw = normalizeAiText(rawKw);
      if (kw && normQ.includes(kw)) {
        score += kw.includes(" ") ? 2 : 1;
      }
    }
    const minScore = rule.minScore ?? 1;
    if (score >= minScore && score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  if (bestRule) {
    return bestRule.answer(context, locale, guideKey, t);
  }

  const role = context?.role ?? "staff";
  const perms = getAiRolePermissions(role);
  const roleLabel = t.roles[role];
  const cur = context?.currencyCode || "LAK";

  if (locale === "lo") {
    const snap = perms.canViewRevenue
      ? `• ລາຍຮັບມື້ນີ້: ${formatMoney(context?.todayRevenue ?? 0, cur)} (${context?.todayPaidCount ?? 0} ບິນ) | ລໍຖ້າເກັບ: ${context?.todayUnpaidCount ?? 0}`
      : `• ຄິວບາມື້ນີ້: ລໍຖ້າ ${context?.barPendingCount ?? 0} • ກຳລັງຊົງ ${context?.barPreparingCount ?? 0} • ພ້ອມເສີບ ${context?.barReadyCount ?? 0}`;
    return (
      `🤖 ຜູ້ຊ່ວຍ AI Ta Oi (${roleLabel})\n${snap}\n\n` +
      `ກະລຸນາກົດປຸ່ມຄຳຖາມໄວດ້ານເທິງ ຫຼື ຖາມກ່ຽວກັບໜ້າວຽກທີ່ຢູ່ໃນຂອບເຂດສິດຂອງທ່ານ.`
    );
  }
  if (locale === "en") {
    const snap = perms.canViewRevenue
      ? `• Today's revenue: ${formatMoney(context?.todayRevenue ?? 0, cur)} (${context?.todayPaidCount ?? 0} paid) | Unpaid: ${context?.todayUnpaidCount ?? 0}`
      : `• Live Bar queue: ${context?.barPendingCount ?? 0} pending • ${context?.barPreparingCount ?? 0} preparing • ${context?.barReadyCount ?? 0} ready`;
    return (
      `🤖 Ta Oi AI Assistant (${roleLabel})\n${snap}\n\n` +
      `Tap any role-enabled quick chip above or ask about tasks within your access level.`
    );
  }
  const snap = perms.canViewRevenue
    ? `• Doanh thu hôm nay: ${formatMoney(context?.todayRevenue ?? 0, cur)} (${context?.todayPaidCount ?? 0} đơn đã thu) | Chờ thu: ${context?.todayUnpaidCount ?? 0}`
    : `• Hàng chờ Bar: ${context?.barPendingCount ?? 0} chờ pha • ${context?.barPreparingCount ?? 0} đang làm • ${context?.barReadyCount ?? 0} sẵn sàng`;
  return (
    `🤖 Trợ lý AI Ta Oi (${roleLabel})\n${snap}\n\n` +
    `Bạn hãy bấm các nút câu hỏi gợi ý bên trên hoặc hỏi về bất kỳ nghiệp vụ nào thuộc quyền hạn của mình.`
  );
}

export function buildWelcomeGuideMessage(
  context: TaOiLiveContext | null,
  locale: Locale,
  guideKey: GuideKey,
  t: Dictionary,
  role: UserRole = "staff"
): string {
  const effectiveRole = context?.role ?? role;
  const perms = getAiRolePermissions(effectiveRole);
  const roleLabel = t.roles[effectiveRole];
  const guideText = formatGuideResponse(locale, guideKey, t);

  if (!context) {
    const prefix =
      locale === "lo"
        ? `🔐 ${t.ai.roleScopedNote}: ${roleLabel}`
        : locale === "en"
        ? `🔐 ${t.ai.roleScopedNote}: ${roleLabel}`
        : `🔐 ${t.ai.roleScopedNote}: ${roleLabel}`;
    return `${prefix}\n\n${guideText}`;
  }

  const cur = context.currencyCode;
  let snapLine = "";
  if (perms.canViewRevenue) {
    const rev = formatMoney(context.todayRevenue ?? 0, cur);
    const lowPart = perms.canViewInventoryCosts
      ? locale === "lo"
        ? ` • ວັດຖຸດິບໃກ້ໝົດ: ${context.lowStockIngredients.length}`
        : locale === "en"
        ? ` • Low stock: ${context.lowStockIngredients.length}`
        : ` • Sắp hết kho: ${context.lowStockIngredients.length}`
      : "";
    const pendingUserPart =
      perms.canViewAdminRbac && (context.pendingUsersCount ?? 0) > 0
        ? locale === "lo"
          ? ` • ບັນຊີລໍຖ້າອະນຸມັດ: ${context.pendingUsersCount}`
          : locale === "en"
          ? ` • Pending users: ${context.pendingUsersCount}`
          : ` • TK chờ duyệt: ${context.pendingUsersCount}`
        : "";
    snapLine =
      locale === "lo"
        ? `📊 ${roleLabel}: ລາຍຮັບມື້ນີ້ ${rev} (${context.todayPaidCount ?? 0} ບິນ)${lowPart}${pendingUserPart}`
        : locale === "en"
        ? `📊 ${roleLabel}: Today ${rev} (${context.todayPaidCount ?? 0} paid)${lowPart}${pendingUserPart}`
        : `📊 ${roleLabel}: Hôm nay ${rev} (${context.todayPaidCount ?? 0} đơn)${lowPart}${pendingUserPart}`;
  } else {
    snapLine =
      locale === "lo"
        ? `📊 ${roleLabel}: ຄິວບາ ${context.barPendingCount} ລໍຖ້າ / ${context.barReadyCount} ພ້ອມເສີບ • ໝົດຊົ່ວຄາວ ${context.soldOutProducts.length}`
        : locale === "en"
        ? `📊 ${roleLabel}: Bar queue ${context.barPendingCount} pending / ${context.barReadyCount} ready • Sold out ${context.soldOutProducts.length}`
        : `📊 ${roleLabel}: Quầy Bar ${context.barPendingCount} chờ pha / ${context.barReadyCount} sẵn sàng • Hết món ${context.soldOutProducts.length}`;
  }

  return `${snapLine}\n\n${guideText}`;
}
