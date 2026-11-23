import { createClient } from "@/lib/supabase/client";
import {
  formatMoney,
  getLocalCurrentMonthStr,
  getLocalTodayDateStr,
  getLocalTodayStartIso,
} from "@/lib/format";
import { translateText } from "@/lib/i18n/catalogTranslator";
import type { Dictionary, Locale } from "@/lib/i18n";

export type GuideKey = Exclude<
  keyof Dictionary["guides"],
  "toggleOpen" | "toggleClose" | "tipLabel"
>;

export interface TaOiLiveContext {
  shopName: string;
  currencyCode: string;
  fetchedAt: string;
  isOffline: boolean;
  todayRevenue: number;
  todayPaidCount: number;
  todayUnpaidCount: number;
  todayCashTotal: number;
  todayQrTotal: number;
  todayTopItems: Array<{ name: string; qty: number }>;
  openShift: {
    openingCash: number;
    cashSales: number;
    qrSales: number;
    pettyExpenses: number;
    expectedCash: number;
  } | null;
  lowStockIngredients: Array<{
    name: string;
    currentStock: number;
    minStock: number;
    baseUnit: string;
  }>;
  totalIngredientsCount: number;
  soldOutProducts: string[];
  todayImportsCount: number;
  todayImportsTotal: number;
  monthExpensesTotal: number;
  upcomingBills: Array<{ title: string; amount: number; nextDueDate: string }>;
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
  locale: Locale
): Promise<TaOiLiveContext> {
  const todayStartIso = getLocalTodayStartIso();
  const todayDateStr = getLocalTodayDateStr();
  const currentMonth = getLocalCurrentMonthStr();

  const fallback: TaOiLiveContext = {
    shopName: "Ta Oi Coffee",
    currencyCode: "LAK",
    fetchedAt: new Date().toLocaleTimeString(locale === "lo" ? "lo-LA" : locale === "en" ? "en-US" : "vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
    todayRevenue: 0,
    todayPaidCount: 0,
    todayUnpaidCount: 0,
    todayCashTotal: 0,
    todayQrTotal: 0,
    todayTopItems: [],
    openShift: null,
    lowStockIngredients: [],
    totalIngredientsCount: 0,
    soldOutProducts: [],
    todayImportsCount: 0,
    todayImportsTotal: 0,
    monthExpensesTotal: 0,
    upcomingBills: [],
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return fallback;
  }

  try {
    const supabase = createClient();

    const [
      shopRes,
      ordersRes,
      shiftRes,
      ingRes,
      prodRes,
      importsRes,
      expRes,
      recRes,
    ] = await Promise.allSettled([
      supabase
        .from("shop_settings")
        .select("shop_name, currency_code")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("orders")
        .select(
          "id, total_amount, payment_status, payment_method, status, order_items(product_name, quantity)"
        )
        .gte("created_at", todayStartIso)
        .neq("status", "cancelled"),
      supabase
        .from("shifts")
        .select(
          "opening_cash, total_cash_sales, total_qr_sales, total_petty_expenses, expected_cash"
        )
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("ingredients")
        .select("name, current_stock, min_stock, base_unit")
        .eq("is_active", true),
      supabase
        .from("products")
        .select("name, name_en, name_lo, is_available")
        .eq("is_active", true),
      supabase
        .from("stock_imports")
        .select("total_amount")
        .eq("import_date", todayDateStr),
      supabase
        .from("expenses")
        .select("amount")
        .eq("billing_month", currentMonth),
      supabase
        .from("recurring_expenses")
        .select("title, amount, next_due_date")
        .eq("is_active", true)
        .order("next_due_date", { ascending: true })
        .limit(3),
    ]);

    const ctx: TaOiLiveContext = { ...fallback, isOffline: false };

    if (shopRes.status === "fulfilled" && shopRes.value.data) {
      const rawName = shopRes.value.data.shop_name as string | undefined;
      ctx.shopName =
        !rawName || rawName === "Tà Ơi Coffee" ? "Ta Oi Coffee" : rawName;
      ctx.currencyCode =
        (shopRes.value.data.currency_code as string | undefined) || "LAK";
    }

    if (ordersRes.status === "fulfilled" && Array.isArray(ordersRes.value.data)) {
      const topMap = new Map<string, number>();
      for (const o of ordersRes.value.data as Array<{
        total_amount: number | string;
        payment_status: string;
        payment_method: string;
        order_items?: Array<{ product_name: string; quantity: number }>;
      }>) {
        const amt = Number(o.total_amount ?? 0);
        if (o.payment_status === "paid") {
          ctx.todayPaidCount += 1;
          ctx.todayRevenue += amt;
          if (o.payment_method === "cash") ctx.todayCashTotal += amt;
          else if (o.payment_method === "qr_transfer") ctx.todayQrTotal += amt;
        } else {
          ctx.todayUnpaidCount += 1;
        }
        for (const it of o.order_items ?? []) {
          const nm = translateText(it.product_name, locale);
          topMap.set(nm, (topMap.get(nm) ?? 0) + Number(it.quantity ?? 0));
        }
      }
      ctx.todayTopItems = Array.from(topMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, qty]) => ({ name, qty }));
    }

    if (shiftRes.status === "fulfilled" && shiftRes.value.data) {
      const s = shiftRes.value.data;
      ctx.openShift = {
        openingCash: Number(s.opening_cash ?? 0),
        cashSales: Number(s.total_cash_sales ?? 0),
        qrSales: Number(s.total_qr_sales ?? 0),
        pettyExpenses: Number(s.total_petty_expenses ?? 0),
        expectedCash: Number(s.expected_cash ?? 0),
      };
    }

    if (ingRes.status === "fulfilled" && Array.isArray(ingRes.value.data)) {
      const rows = ingRes.value.data as Array<{
        name: string;
        current_stock: number;
        min_stock: number;
        base_unit: string;
      }>;
      ctx.totalIngredientsCount = rows.length;
      ctx.lowStockIngredients = rows
        .filter((i) => Number(i.current_stock) <= Number(i.min_stock))
        .slice(0, 6)
        .map((i) => ({
          name: i.name,
          currentStock: Number(i.current_stock),
          minStock: Number(i.min_stock),
          baseUnit: i.base_unit,
        }));
    }

    if (prodRes.status === "fulfilled" && Array.isArray(prodRes.value.data)) {
      ctx.soldOutProducts = (
        prodRes.value.data as Array<{
          name: string;
          name_en?: string;
          name_lo?: string;
          is_available: boolean;
        }>
      )
        .filter((p) => !p.is_available)
        .map((p) =>
          locale === "lo" && p.name_lo
            ? p.name_lo
            : locale === "en" && p.name_en
            ? p.name_en
            : translateText(p.name, locale)
        )
        .slice(0, 5);
    }

    if (
      importsRes.status === "fulfilled" &&
      Array.isArray(importsRes.value.data)
    ) {
      ctx.todayImportsCount = importsRes.value.data.length;
      ctx.todayImportsTotal = importsRes.value.data.reduce(
        (acc, r) => acc + Number(r.total_amount ?? 0),
        0
      );
    }

    if (expRes.status === "fulfilled" && Array.isArray(expRes.value.data)) {
      ctx.monthExpensesTotal = expRes.value.data.reduce(
        (acc, r) => acc + Number(r.amount ?? 0),
        0
      );
    }

    if (recRes.status === "fulfilled" && Array.isArray(recRes.value.data)) {
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

    return ctx;
  } catch {
    return fallback;
  }
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

function formatGuideResponse(
  locale: Locale,
  guideKey: GuideKey,
  t: Dictionary
): string {
  const g = t.guides[guideKey];
  const header =
    locale === "lo"
      ? `📘 ${g.title}`
      : locale === "en"
      ? `📘 ${g.title}`
      : `📘 ${g.title}`;
  const numbered = g.steps.map((s, idx) => `${idx + 1}. ${s}`).join("\n");
  return `${header}\n\n${numbered}\n\n💡 ${t.guides.tipLabel}: ${g.tip}`;
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
      "orders",
      "ມື້ນີ້",
      "ຍອດຂາຍ",
      "ຂາຍໄດ້",
      "ອໍເດີ",
      "ຂາຍດີ",
    ],
    answer: (ctx, locale) => {
      if (!ctx) {
        return locale === "lo"
          ? "ກຳລັງໂຫຼດຂໍ້ມູນຍອດຂາຍມື້ນີ້..."
          : locale === "en"
          ? "Loading today's sales summary..."
          : "Đang tải số liệu bán hàng hôm nay...";
      }
      const cur = ctx.currencyCode;
      const rev = formatMoney(ctx.todayRevenue, cur);
      const cash = formatMoney(ctx.todayCashTotal, cur);
      const qr = formatMoney(ctx.todayQrTotal, cur);
      const topText = ctx.todayTopItems.length
        ? ctx.todayTopItems.map((x) => `${x.name} (${x.qty})`).join(", ")
        : locale === "lo"
        ? "ຍັງບໍ່ມີຂໍ້ມູນ"
        : locale === "en"
        ? "No items yet"
        : "Chưa có món bán hôm nay";

      if (locale === "lo") {
        return (
          `☕ ສະຫຼຸບການຂາຍມື້ນີ້ (${ctx.shopName}):\n` +
          `• ລາຍຮັບລວມ (ຊຳລະແລ້ວ): ${rev} (${ctx.todayPaidCount} ບິນ)\n` +
          `• ເງິນສົດ: ${cash} | ໂອນ QR: ${qr}\n` +
          `• ບິນລໍຖ້າເກັບເງິນ: ${ctx.todayUnpaidCount} ບິນ\n` +
          `• ເມນູຂາຍດີມື້ນີ້: ${topText}`
        );
      }
      if (locale === "en") {
        return (
          `☕ Today's Sales Summary (${ctx.shopName}):\n` +
          `• Total Paid Revenue: ${rev} (${ctx.todayPaidCount} paid orders)\n` +
          `• Cash: ${cash} | QR Transfer: ${qr}\n` +
          `• Unpaid / Waiting collection: ${ctx.todayUnpaidCount} orders\n` +
          `• Top drinks today: ${topText}`
        );
      }
      return (
        `☕ Tổng kết bán hàng hôm nay (${ctx.shopName}):\n` +
        `• Doanh thu đã thu: ${rev} (${ctx.todayPaidCount} đơn đã thanh toán)\n` +
        `• Tiền mặt: ${cash} | Chuyển khoản QR: ${qr}\n` +
        `• Đơn đang chờ thu tiền: ${ctx.todayUnpaidCount} đơn\n` +
        `• Món bán chạy hôm nay: ${topText}`
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
      "ເງິນສົດ",
      "ຈ່າຍຍ່ອຍ",
    ],
    answer: (ctx, locale) => {
      const cur = ctx?.currencyCode || "LAK";
      if (!ctx?.openShift) {
        if (locale === "lo") {
          return (
            "💼 ສະຖານະກະເຮັດວຽກ: ປັດຈຸບັນຍັງບໍ່ມີກະເປີດ.\n" +
            "• ເຂົ້າໜ້າ 'ກະ & ດຸ່ນດ່ຽງເງິນ' (/shifts) ແລ້ວໃສ່ເງິນທອນຕົ້ນກະເພື່ອກົດ 'ເປີດກະເຮັດວຽກໃໝ່'.\n" +
            "• ເມື່ອປິດກະ ລະບົບຈະສົມທຽບເງິນສົດຕົວຈິງກັບເງິນໃນລະບົບ ແລະ ແຍກຍອດ QR ຕ່າງຫາກ."
          );
        }
        if (locale === "en") {
          return (
            "💼 Shift Status: No shift is currently open.\n" +
            "• Go to 'Shifts & Cash Balance' (/shifts), enter opening cash float, and tap 'Open new shift'.\n" +
            "• QR transfers are tracked separately from drawer cash so end-of-shift counts stay exact."
          );
        }
        return (
          "💼 Tình trạng ca: Hiện chưa có ca nào đang mở.\n" +
          "• Vào mục 'Ca & Cân đối tiền' (/shifts), nhập tiền lẻ đầu ca rồi bấm 'Mở ca làm việc mới'.\n" +
          "• Mẹo: Thu tiền mặt cộng vào két, tiền QR tách riêng; chi mua đá/sữa gấp ghi vào 'Chi lặt vặt trong ca' để cuối ca khớp két 100%."
        );
      }

      const s = ctx.openShift;
      if (locale === "lo") {
        return (
          `💼 ກະເຮັດວຽກປັດຈຸບັນ (ກຳລັງເປີດ):\n` +
          `• ເງິນສົດຕົ້ນກະ: ${formatMoney(s.openingCash, cur)}\n` +
          `• ຂາຍເງິນສົດໃນກະ: ${formatMoney(s.cashSales, cur)}\n` +
          `• ຂາຍໂອນ QR: ${formatMoney(s.qrSales, cur)}\n` +
          `• ຈ່າຍຍ່ອຍໃນກະ: ${formatMoney(s.pettyExpenses, cur)}\n` +
          `• ເງິນສົດຄາດວ່າໃນລິ້ນຊັກ: ${formatMoney(s.expectedCash, cur)}`
        );
      }
      if (locale === "en") {
        return (
          `💼 Current Open Shift:\n` +
          `• Opening float: ${formatMoney(s.openingCash, cur)}\n` +
          `• Cash sales: ${formatMoney(s.cashSales, cur)} | QR sales: ${formatMoney(s.qrSales, cur)}\n` +
          `• Petty cash out: ${formatMoney(s.pettyExpenses, cur)}\n` +
          `• Expected drawer cash: ${formatMoney(s.expectedCash, cur)}`
        );
      }
      return (
        `💼 Ca đang mở hiện tại:\n` +
        `• Tiền đầu ca: ${formatMoney(s.openingCash, cur)}\n` +
        `• Doanh thu tiền mặt: ${formatMoney(s.cashSales, cur)} | Doanh thu QR: ${formatMoney(s.qrSales, cur)}\n` +
        `• Chi lặt vặt trong ca: ${formatMoney(s.pettyExpenses, cur)}\n` +
        `• Tiền mặt lý thuyết trong két: ${formatMoney(s.expectedCash, cur)}`
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
      "kiem ke",
      "can doi kho",
      "dinh luong",
      "cong thuc",
      "low stock",
      "ingredient",
      "import",
      "inventory",
      "buy",
      "stock take",
      "recipe",
      "ວັດຖຸດິບ",
      "ໃກ້ໝົດ",
      "ນຳເຂົ້າ",
      "ສາງ",
      "ກວດນັບ",
      "ຊື້ເຂົ້າ",
      "ສູດ",
    ],
    answer: (ctx, locale) => {
      const cur = ctx?.currencyCode || "LAK";
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
        ? "✅ All active ingredients are above minimum threshold."
        : "✅ Tất cả nguyên liệu đều đang ở mức an toàn.";

      const soldOut = ctx?.soldOutProducts ?? [];
      const soldOutText = soldOut.length
        ? soldOut.join(", ")
        : locale === "lo"
        ? "ບໍ່ມີ"
        : locale === "en"
        ? "None"
        : "Không có món nào";

      if (locale === "lo") {
        return (
          `📦 ສາງ & ການນຳເຂົ້າວັດຖຸດິບ (${ctx?.totalIngredientsCount ?? 0} ລາຍການ):\n` +
          `• ໃບນຳເຂົ້າສາງມື້ນີ້: ${ctx?.todayImportsCount ?? 0} ໃບ (${formatMoney(ctx?.todayImportsTotal ?? 0, cur)})\n` +
          `• ເມນູກຳລັງປິດ/ໝົດຊົ່ວຄາວ: ${soldOutText}\n` +
          `• ວັດຖຸດິບໃກ້ໝົດ (${low.length}):\n${lowList}\n\n` +
          `👉 ວິທີຊື້ເຂົ້າສາງ: ເຂົ້າ 'ນຳເຂົ້າ & ຄົງເຫຼືອ' (/inventory) → ແຖບ 'ນຳເຂົ້າສາງ' → ເລືອກວັດຖຸດິບ, ໃສ່ຈຳນວນ & ລາຄາຊື້ → ລະບົບຈະແປງເປັນ g/ml ແລະ ຄິດໄລ່ຕົ້ນທຶນສະເລ່ຍໃໝ່ອັດຕະໂນມັດ.`
        );
      }
      if (locale === "en") {
        return (
          `📦 Inventory & Daily Purchasing (${ctx?.totalIngredientsCount ?? 0} active ingredients):\n` +
          `• Stock imports today: ${ctx?.todayImportsCount ?? 0} slips (${formatMoney(ctx?.todayImportsTotal ?? 0, cur)})\n` +
          `• Sold-out drinks: ${soldOutText}\n` +
          `• Low-stock alerts (${low.length}):\n${lowList}\n\n` +
          `👉 To log a purchase: open 'Inventory & Recipes' (/inventory) → 'Stock Import' tab → pick ingredients & purchase price; stock converts to g/ml and updates weighted avg cost automatically.`
        );
      }
      return (
        `📦 Kho & Mua nhập hàng hàng ngày (${ctx?.totalIngredientsCount ?? 0} nguyên liệu):\n` +
        `• Phiếu nhập kho hôm nay: ${ctx?.todayImportsCount ?? 0} phiếu (${formatMoney(ctx?.todayImportsTotal ?? 0, cur)})\n` +
        `• Món đang báo tạm hết: ${soldOutText}\n` +
        `• Cảnh báo sắp hết (${low.length}):\n${lowList}\n\n` +
        `👉 Cách nhập hàng mới: Vào 'Nhập & Tồn kho' (/inventory) → tab 'Nhập kho' → chọn nguyên liệu, đơn vị mua và đơn giá → bấm Lưu để tự quy đổi g/ml và cập nhật giá vốn bình quân.`
      );
    },
  },
  {
    id: "pos_workflow",
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
      "table",
      "order",
      "ເກັບເງິນ",
      "ຊຳລະ",
      "ຍົກເລີກ",
      "ໂຕະ",
      "ສັ່ງອາຫານ",
    ],
    answer: (_ctx, locale) => {
      if (locale === "lo") {
        return (
          "🧾 ຂັ້ນຕອນຂາຍໜ້າຮ້ານ POS, ເກັບເງິນ & ຍົກເລີກບິນ:\n" +
          "1. ສ້າງອໍເດີ (/pos): ເລືອກ ນັ່ງຮ້ານ (ເລືອກໂຕະ) / ກັບບ້ານ / ຈັດສົ່ງ → ແຕະເມນູເລືອກ Size & Topping.\n" +
          "2. ເກັບເງິນທັນທີ: ເລືອກ ເງິນສົດ ຫຼື ໂອນ QR ແລ້ວກົດ 'ຊຳລະ & ສົ່ງບາ' → ລະບົບບວກຍອດກະ ແລະ ຕັດສາງອັດຕະໂນມັດ.\n" +
          "3. ສັ່ງກ່ອນຈ່າຍທີຫຼັງ / QR ໂຕະ: ກົດ 'ສົ່ງອໍເດີ (ຍັງບໍ່ຈ່າຍ)' ເພື່ອໃຫ້ບາຊົງກ່ອນ, ເມື່ອລູກຄ້າຈ່າຍ ແຄສເຊຍກົດ 'ເກັບເງິນ' ຢູ່ລາຍການຫຼ້າສຸດ.\n" +
          "4. ຍົກເລີກບິນ: ບິນຍັງບໍ່ຈ່າຍພະນັກງານຍົກເລີກໄດ້; ບິນຊຳລະແລ້ວຕ້ອງໃຫ້ ຜູ້ຈັດການສູງສຸດ (Admin) ຍົກເລີກ (ລະບົບຈະຄືນຍອດກະ ແລະ ຄືນສາງໃຫ້ຄົບຖ້ວນ)."
        );
      }
      if (locale === "en") {
        return (
          "🧾 Daily POS Checkout, Table QR & Order Cancellation Rules:\n" +
          "1. Create order (/pos): select Dine-in (with table), Take-away, or Delivery, then pick drink size, toppings & notes.\n" +
          "2. Instant checkout: pick Cash or QR Transfer → tap 'Pay & Send to Bar' (auto-updates open shift & deducts recipes).\n" +
          "3. Pay-later & Customer QR (/order): orders enter as Unpaid so Bar starts making; Cashier clicks 'Collect' later when customer pays.\n" +
          "4. Cancel order: staff can cancel Unpaid orders; only Head Manager (Admin) can cancel Paid orders (automatically reverses shift sales & restores ingredient stock)."
        );
      }
      return (
        "🧾 Quy trình Bán hàng POS, Thu tiền, QR tại bàn & Hủy đơn:\n" +
        "1. Lên đơn (/pos): chọn Tại quán (kèm bàn) / Mang đi / Giao hàng → chạm món chọn Size, Topping và ghi chú.\n" +
        "2. Thu tiền ngay: chọn Tiền mặt hoặc QR → bấm 'Thanh toán & Gửi Bar' (tự cộng doanh thu ca và trừ kho nguyên liệu).\n" +
        "3. Gọi trước thu sau / Khách quét QR (/order): đơn vào trạng thái Chưa thu tiền để Bar pha trước; khi khách thanh toán, Thu ngân bấm 'Thu tiền' ở bảng Đơn gần đây.\n" +
        "4. Quyền hủy đơn: Nhân viên được hủy đơn CHƯA thanh toán. Đơn ĐÃ thanh toán chỉ Quản lý cao nhất (Admin) được hủy (hệ thống tự hoàn tiền ca & hoàn kho nguyên liệu)."
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
      "expense",
      "electric",
      "water",
      "rent",
      "profit",
      "loss",
      "report",
      "ຄ່າໃຊ້ຈ່າຍ",
      "ຄ່າໄຟ",
      "ຄ່ານ້ຳ",
      "ຄ່າເຊົ່າ",
      "ກຳໄລ",
      "ລາຍງານ",
    ],
    answer: (ctx, locale) => {
      const cur = ctx?.currencyCode || "LAK";
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
          `📊 ຄ່າໃຊ້ຈ່າຍ & ລາຍງານກຳໄລເດືອນນີ້:\n` +
          `• ລວມລາຍຈ່າຍບັນທຶກໃນເດືອນນີ້: ${expMonth}\n` +
          `• ບິນປະຈຳໃກ້ຄົບກຳນົດ:\n${billsText}\n\n` +
          `👉 ເຂົ້າ 'ຄ່າໄຟ, ນ້ຳ & ຄ່າໃຊ້ຈ່າຍ' (/expenses) ເພື່ອຄິດໄລ່ຄ່າໄຟ/ນ້ຳຕາມເລກກົງເຕີ ຫຼື ແບ່ງປັນຄ່າເຊົ່າຫຼາຍເດືອນ, ແລະ ເຂົ້າ 'ລາຍງານ P&L' (/reports) ເພື່ອສົ່ງອອກ Excel ພ້ອມສູດ.`
        );
      }
      if (locale === "en") {
        return (
          `📊 Operating Expenses & Monthly P&L:\n` +
          `• Recorded expenses this month: ${expMonth}\n` +
          `• Upcoming recurring bills:\n${billsText}\n\n` +
          `👉 Log meter-based electricity/water or multi-month rent in 'Utilities & Expenses' (/expenses), and export full formula-linked 4-sheet Excel in 'Profit & Loss (P&L)' (/reports).`
        );
      }
      return (
        `📊 Chi phí vận hành & Lãi/Lỗ (P&L) tháng này:\n` +
        `• Tổng chi phí đã ghi nhận tháng này: ${expMonth}\n` +
        `• Lịch nhắc chi phí sắp tới hạn:\n${billsText}\n\n` +
        `👉 Ghi nhận tiền điện/nước theo chỉ số công-tơ hoặc phân bổ tiền thuê nhà nhiều tháng tại mục 'Điện, Nước & Chi phí' (/expenses), và xuất Excel 4 sheet có công thức tại 'Báo cáo Lãi/Lỗ' (/reports).`
      );
    },
  },
];

export function getTaOiQuickQuestions(t: Dictionary) {
  return [
    { id: "today", label: t.ai.quickPromptToday, q: t.ai.quickPromptToday },
    { id: "shift", label: t.ai.quickPromptShift, q: t.ai.quickPromptShift },
    { id: "stock", label: t.ai.quickPromptStock, q: t.ai.quickPromptStock },
    { id: "pos", label: t.ai.quickPromptPos, q: t.ai.quickPromptPos },
    { id: "pnl", label: t.ai.quickPromptPnl, q: t.ai.quickPromptPnl },
    { id: "guide", label: t.ai.quickPromptGuide, q: t.ai.quickPromptGuide },
  ];
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

  // Fallback general summary combining live snapshot + topic hints in active language
  const cur = context?.currencyCode || "LAK";
  const rev = formatMoney(context?.todayRevenue ?? 0, cur);
  const lowCount = context?.lowStockIngredients.length ?? 0;

  if (locale === "lo") {
    return (
      `🤖 ຜູ້ຊ່ວຍ AI Ta Oi (ພາສາລາວ / Offline Ready)\n` +
      `• ຍອດຂາຍມື້ນີ້: ${rev} (${context?.todayPaidCount ?? 0} ບິນ) | ວັດຖຸດິບໃກ້ໝົດ: ${lowCount}\n\n` +
      `ທ່ານສາມາດຖາມກ່ຽວກັບ: ຍອດຂາຍມື້ນີ້, ກະ ແລະ ເງິນສົດໃນລິ້ນຊັກ, ວັດຖຸດິບໃກ້ໝົດ & ນຳເຂົ້າສາງ, ວິທີເກັບເງິນ / ຍົກເລີກບິນ / QR ໂຕະ, ຄ່າໄຟ-ຄ່ານ້ຳ & ກຳໄລເດືອນ, ຫຼື ກົດ '${t.ai.quickPromptGuide}' ເພື່ອເບິ່ງຄູ່ມືໜ້ານີ້.`
    );
  }
  if (locale === "en") {
    return (
      `🤖 Ta Oi AI Assistant (EN / Offline Ready)\n` +
      `• Today's revenue: ${rev} (${context?.todayPaidCount ?? 0} paid) | Low stock alerts: ${lowCount}\n\n` +
      `Ask me about: today's sales & best sellers, shift cash balance, low stock & daily buying/imports, POS checkout & order cancel rules, utilities/rent expenses & P&L, or tap '${t.ai.quickPromptGuide}' for step-by-step screen instructions.`
    );
  }
  return (
    `🤖 Trợ lý AI Ta Oi (Tiếng Việt • Offline Ready)\n` +
    `• Doanh thu hôm nay: ${rev} (${context?.todayPaidCount ?? 0} đơn đã thu) | Sắp hết kho: ${lowCount} nguyên liệu\n\n` +
    `Bạn có thể hỏi về: doanh thu & món bán chạy hôm nay, tình trạng ca & két tiền, nguyên liệu sắp hết & nhập hàng mới, quy trình thu tiền / hủy đơn / QR bàn, chi phí điện nước & lãi lỗ, hoặc bấm '${t.ai.quickPromptGuide}'.`
  );
}

export function buildWelcomeGuideMessage(
  context: TaOiLiveContext | null,
  locale: Locale,
  guideKey: GuideKey,
  t: Dictionary
): string {
  const guideText = formatGuideResponse(locale, guideKey, t);
  if (!context) return guideText;
  const cur = context.currencyCode;
  const rev = formatMoney(context.todayRevenue, cur);
  const lowCount = context.lowStockIngredients.length;

  const snapLine =
    locale === "lo"
      ? `📊 ສະຫຼຸບໄວ: ລາຍຮັບມື້ນີ້ ${rev} (${context.todayPaidCount} ບິນ) • ວັດຖຸດິບໃກ້ໝົດ: ${lowCount}`
      : locale === "en"
      ? `📊 Quick Snapshot: Today ${rev} (${context.todayPaidCount} paid) • Low stock: ${lowCount}`
      : `📊 Số liệu nhanh: Hôm nay ${rev} (${context.todayPaidCount} đơn) • Sắp hết kho: ${lowCount}`;

  return `${snapLine}\n\n${guideText}`;
}
