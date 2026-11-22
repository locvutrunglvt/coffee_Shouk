"use client";

import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { useT } from "@/components/I18nProvider";
import {
  localizeDescription,
  localizeName,
  translateText,
} from "@/lib/i18n/catalogTranslator";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PaymentQrCard } from "@/components/PaymentQrCard";
import type { ShopSettings } from "@/lib/auth";
import type {
  CategoryRow,
  ProductRow,
  TableRow,
  ToppingRow,
  VariantRow,
} from "@/app/menu/MenuClient";
import {
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  Coffee,
  Minus,
  Plus,
  QrCode,
  Search,
  Sprout,
  Trash2,
  X,
} from "lucide-react";

interface PublicCartItem {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  toppings: { id: string; name: string; price: number }[];
  note: string;
}

interface OrderPublicClientProps {
  settings: ShopSettings;
  categories: CategoryRow[];
  products: ProductRow[];
  variants: VariantRow[];
  toppings: ToppingRow[];
  tables: TableRow[];
  initialTableId: string | null;
}

export function OrderPublicClient({
  settings,
  categories,
  products,
  variants,
  toppings,
  tables,
  initialTableId,
}: OrderPublicClientProps) {
  const { t, locale } = useT();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCat, setSelectedCat] = useState("all");
  const [search, setSearch] = useState("");
  const [serviceType, setServiceType] = useState<
    "dine_in" | "take_away" | "delivery"
  >(initialTableId ? "dine_in" : "take_away");
  const [tableId, setTableId] = useState<string>(initialTableId ?? "");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [payPref, setPayPref] = useState<"cash" | "qr">("cash");
  const [orderNote, setOrderNote] = useState("");

  const [cart, setCart] = useState<PublicCartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [confirmed, setConfirmed] = useState<{
    order_number: number;
    total_amount: number;
  } | null>(null);

  // Customize drink modal
  const [activeProduct, setActiveProduct] = useState<ProductRow | null>(null);
  const [variantQtys, setVariantQtys] = useState<Record<string, number>>({});
  const [pickedToppings, setPickedToppings] = useState<
    { id: string; name: string; price: number }[]
  >([]);
  const [pickedQty, setPickedQty] = useState(1);
  const [pickedNote, setPickedNote] = useState("");

  function openCustomize(p: ProductRow) {
    if (!p.is_available) return;
    const pVars = variants.filter((v) => v.product_id === p.id && v.is_active);
    setActiveProduct(p);
    setVariantQtys(pVars[0] ? { [pVars[0].id]: 1 } : {});
    setPickedToppings([]);
    setPickedQty(1);
    setPickedNote("");
  }

  function addCustomizedToCart() {
    if (!activeProduct) return;
    const pVars = variants.filter(
      (v) => v.product_id === activeProduct.id && v.is_active
    );

    if (pVars.length > 0) {
      const toAdd: PublicCartItem[] = [];
      for (const v of pVars) {
        const qty = variantQtys[v.id] ?? 0;
        if (qty > 0) {
          toAdd.push({
            productId: activeProduct.id,
            variantId: v.id,
            productName: activeProduct.name,
            variantName: v.name,
            quantity: qty,
            unitPrice: Number(v.price),
            toppings: pickedToppings,
            note: pickedNote.trim(),
          });
        }
      }
      if (toAdd.length === 0) return;
      setCart((prev) => [...prev, ...toAdd]);
    } else {
      setCart((prev) => [
        ...prev,
        {
          productId: activeProduct.id,
          variantId: null,
          productName: activeProduct.name,
          variantName: "",
          quantity: pickedQty,
          unitPrice: Number(activeProduct.base_price),
          toppings: pickedToppings,
          note: pickedNote.trim(),
        },
      ]);
    }
    setActiveProduct(null);
  }

  const totalCount = cart.reduce((s, i) => s + i.quantity, 0);
  const totalAmount = cart.reduce((sum, item) => {
    const topSum = item.toppings.reduce((s, tp) => s + tp.price, 0);
    return sum + (item.unitPrice + topSum) * item.quantity;
  }, 0);

  async function handleSubmitOrder() {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const supabase = createClient();
      const payloadItems = cart.map((i) => ({
        product_id: i.productId,
        variant_id: i.variantId,
        topping_ids: i.toppings.map((tp) => tp.id),
        quantity: i.quantity,
        note: i.note,
      }));

      const metaParts: string[] = [];
      if (serviceType === "delivery") {
        metaParts.push(`[${t.pos.delivery}] ${deliveryAddress.trim()}`);
      } else if (serviceType === "take_away") {
        metaParts.push(`[${t.pos.takeAway}]`);
      }
      if (customerName.trim()) metaParts.push(customerName.trim());
      if (customerPhone.trim()) metaParts.push(customerPhone.trim());
      if (orderNote.trim()) metaParts.push(orderNote.trim());

      const { data, error } = await supabase.rpc("submit_qr_order", {
        p_table_id: serviceType === "dine_in" && tableId ? tableId : null,
        p_note: metaParts.join(" • "),
        p_items: payloadItems,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      const res = data as { order_number: number; total_amount: number };
      setConfirmed({
        order_number: res.order_number,
        total_amount: Number(res.total_amount),
      });
      setCart([]);
      setOrderNote("");
      setStep(1);
    } catch {
      setErrorMsg(t.common.error);
    } finally {
      setSubmitting(false);
    }
  }

  const currentTable = tables.find((tb) => tb.id === tableId);
  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCat === "all" || p.category_id === selectedCat;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      localizeName(p, locale).toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const activeProdVars = activeProduct
    ? variants.filter((v) => v.product_id === activeProduct.id && v.is_active)
    : [];

  return (
    <div className="min-h-screen pb-28">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b-2 border-[#CDE9D5]">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Image
              src="/logo-taoi.jpeg"
              alt={settings.shop_name}
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl object-cover border-2 border-[#86EFAC] shrink-0"
            />
            <div className="min-w-0">
              <p className="font-extrabold text-base text-[#14532D] truncate flex items-center gap-1">
                <span>{settings.shop_name}</span>
                <Sprout className="w-4 h-4 text-[#16A34A]" />
              </p>
              <p className="text-xs font-bold text-[#15803D] truncate">
                {serviceType === "dine_in" && currentTable
                  ? `${t.orderPublic.tableBadge}: ${localizeName(
                      currentTable,
                      locale
                    )}`
                  : t.orderPublic.welcome}
              </p>
            </div>
          </div>
          <LanguageSwitcher compact />
        </div>

        {/* 3-Step Mobile Stepper (Inspired by reference mobile video) */}
        {!confirmed && (
          <div className="max-w-2xl mx-auto px-4 pb-2.5 pt-1 grid grid-cols-3 gap-2">
            {(
              [
                [1, t.orderPublic.stepOrder],
                [2, t.orderPublic.stepCustomer],
                [3, t.orderPublic.stepConfirm],
              ] as const
            ).map(([sNum, label]) => {
              const active = step === sNum;
              const done = step > sNum;
              return (
                <button
                  key={sNum}
                  type="button"
                  disabled={sNum > 1 && cart.length === 0}
                  onClick={() => {
                    if (sNum === 1 || cart.length > 0) setStep(sNum);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer disabled:opacity-45 ${
                    active
                      ? "bg-[#16A34A] text-white border-[#16A34A] shadow-xs"
                      : done
                      ? "bg-[#EAFBF0] text-[#15803D] border-[#86EFAC]"
                      : "bg-white text-[#3B6B4C] border-[#CDE9D5]"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-extrabold ${
                      active
                        ? "bg-white text-[#16A34A]"
                        : done
                        ? "bg-[#16A34A] text-white"
                        : "bg-[#EAFBF0] text-[#15803D]"
                    }`}
                  >
                    {done ? <Check className="w-2.5 h-2.5" /> : sNum}
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {confirmed ? (
          <div className="card-3d rounded-3xl p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto icon-3d">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#14532D]">
              {t.orderPublic.orderSentTitle}
            </h1>
            <p className="text-sm text-[#2F6844]">
              {t.orderPublic.orderSentDesc}
            </p>
            <div className="inline-block px-6 py-3 rounded-2xl bg-[#EAFBF0] border border-[#CDE9D5]">
              <p className="text-xs text-[#2F6844]">
                {t.orderPublic.orderNumberLabel}
              </p>
              <p className="text-3xl font-extrabold text-[#15803D]">
                #{confirmed.order_number}
              </p>
            </div>
            <p className="text-xs text-[#2F6844]">
              {t.orderPublic.payAtCounterHint}
            </p>
            {(settings.qr_image_url ||
              settings.vietqr_account_no ||
              settings.emvco_base_qr) && (
              <div className="max-w-xs mx-auto">
                <PaymentQrCard
                  settings={settings}
                  amount={confirmed.total_amount}
                  reference={`TaOi${confirmed.order_number}`}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setConfirmed(null)}
              className="px-6 py-3 rounded-2xl btn-3d-green text-base font-bold cursor-pointer"
            >
              {t.orderPublic.orderMoreBtn}
            </button>
          </div>
        ) : step === 1 ? (
          /* STEP 1: HORIZONTAL CATEGORY CHIPS + SEARCH + ONE-HAND LIST CARDS */
          <>
            <div className="card-3d rounded-2xl p-3 space-y-2.5">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCat("all")}
                  className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border shrink-0 cursor-pointer ${
                    selectedCat === "all"
                      ? "bg-[#16A34A] text-white border-[#16A34A]"
                      : "bg-[#F2FBF4] text-[#14532D] border-[#CDE9D5]"
                  }`}
                >
                  {t.common.all}
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCat(c.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border shrink-0 cursor-pointer ${
                      selectedCat === c.id
                        ? "bg-[#16A34A] text-white border-[#16A34A]"
                        : "bg-[#F2FBF4] text-[#14532D] border-[#CDE9D5]"
                    }`}
                  >
                    {localizeName(c, locale)}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-[#16A34A] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.orderPublic.searchPlaceholder}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-[#F2FBF4]"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className={`card-3d rounded-2xl p-2.5 flex items-center justify-between gap-3 ${
                    !p.is_available ? "opacity-55" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-16 h-16 rounded-xl bg-[#EAFBF0] overflow-hidden shrink-0 border border-[#CDE9D5] flex items-center justify-center">
                      {p.image_url ? (
                        <Image
                          src={p.image_url}
                          alt={p.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <Coffee className="w-7 h-7 text-[#16A34A]/60" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-extrabold text-sm sm:text-base text-[#14532D] truncate">
                        {localizeName(p, locale)}
                      </p>
                      {p.description && (
                        <p className="text-xs text-[#2F6844] line-clamp-1">
                          {localizeDescription(
                            p.description,
                            p.description_en,
                            p.description_lo,
                            locale
                          )}
                        </p>
                      )}
                      <p className="text-sm font-extrabold text-[#15803D] mt-0.5">
                        {formatMoney(p.base_price, settings.currency_code)}
                      </p>
                    </div>
                  </div>

                  {p.is_available ? (
                    <button
                      type="button"
                      onClick={() => openCustomize(p)}
                      className="px-3 py-2 rounded-xl btn-3d-green text-xs sm:text-sm font-extrabold shrink-0 cursor-pointer"
                    >
                      {t.orderPublic.pickBtn}
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-xl bg-red-100 text-red-700 text-xs font-bold shrink-0">
                      {t.pos.outOfStock}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : step === 2 ? (
          /* STEP 2: TABLE / SERVICE TYPE & CUSTOMER INFO */
          <div className="card-3d rounded-2xl p-5 space-y-4">
            <h2 className="font-extrabold text-base text-[#14532D]">
              {t.orderPublic.serviceTypeTitle}
            </h2>

            <div className="space-y-2">
              {(
                [
                  ["dine_in", t.pos.dineIn],
                  ["take_away", t.pos.takeAway],
                  ["delivery", t.pos.delivery],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setServiceType(key)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-sm font-bold cursor-pointer ${
                    serviceType === key
                      ? "bg-[#EAFBF0] border-[#16A34A] text-[#14532D]"
                      : "bg-white border-[#CDE9D5] text-[#3B6B4C]"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      serviceType === key
                        ? "border-[#16A34A]"
                        : "border-[#CDE9D5]"
                    }`}
                  >
                    {serviceType === key && (
                      <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                    )}
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {serviceType === "dine_in" && (
              <div>
                <label className="block text-sm font-bold text-[#14532D] mb-1">
                  {t.pos.selectTable}
                </label>
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-[#CDE9D5] bg-white font-semibold"
                >
                  <option value="">{t.pos.selectTable}</option>
                  {tables.map((tb) => (
                    <option key={tb.id} value={tb.id}>
                      {localizeName(tb, locale)} ({translateText(tb.zone, locale)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {serviceType === "delivery" && (
              <div>
                <label className="block text-sm font-bold text-[#14532D] mb-1">
                  {t.orderPublic.deliveryAddress}
                </label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder={t.orderPublic.deliveryAddress}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-[#CDE9D5]"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold text-[#14532D] mb-1">
                  {t.orderPublic.customerName}
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#14532D] mb-1">
                  {t.orderPublic.customerPhone}
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#14532D] mb-1">
                {t.common.note}
              </label>
              <input
                type="text"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder={t.orderPublic.orderNotePlaceholder}
                className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
            </div>
          </div>
        ) : (
          /* STEP 3: PAYMENT METHOD + ORDER SUMMARY + CONFIRM */
          <div className="space-y-4">
            {errorMsg && (
              <p className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                {errorMsg}
              </p>
            )}

            <div className="card-3d rounded-2xl p-5 space-y-3">
              <h2 className="font-extrabold text-base text-[#14532D]">
                {t.pos.paymentMethod}
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPayPref("cash")}
                  className={`p-3 rounded-xl border text-left text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer ${
                    payPref === "cash"
                      ? "bg-[#EAFBF0] border-[#16A34A] text-[#14532D]"
                      : "bg-white border-[#CDE9D5] text-[#3B6B4C]"
                  }`}
                >
                  <Banknote className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>{t.orderPublic.payAtCounterOption}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayPref("qr")}
                  className={`p-3 rounded-xl border text-left text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer ${
                    payPref === "qr"
                      ? "bg-[#EAFBF0] border-[#16A34A] text-[#14532D]"
                      : "bg-white border-[#CDE9D5] text-[#3B6B4C]"
                  }`}
                >
                  <QrCode className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>{t.pos.qrTransfer}</span>
                </button>
              </div>

              {payPref === "qr" && (
                <PaymentQrCard
                  settings={settings}
                  amount={totalAmount}
                  reference="TaOiQR"
                />
              )}
            </div>

            <div className="card-3d rounded-2xl p-5 space-y-3">
              <h2 className="font-extrabold text-base text-[#14532D]">
                {t.orderPublic.orderSummaryTitle} ({totalCount})
              </h2>
              <div className="divide-y divide-[#DDF3E4]">
                {cart.map((item, idx) => {
                  const topSum = item.toppings.reduce((s, tp) => s + tp.price, 0);
                  const lineTotal = (item.unitPrice + topSum) * item.quantity;
                  return (
                    <div
                      key={idx}
                      className="py-2.5 flex items-start justify-between gap-2"
                    >
                      <div>
                        <p className="font-bold text-sm text-[#14532D]">
                          {item.quantity}x {translateText(item.productName, locale)}
                          {item.variantName ? ` (${item.variantName})` : ""}
                        </p>
                        {item.toppings.length > 0 && (
                          <p className="text-xs text-[#2F6844]">
                            +{" "}
                            {item.toppings
                              .map((tp) => translateText(tp.name, locale))
                              .join(", ")}
                          </p>
                        )}
                        {item.note && (
                          <p className="text-xs text-amber-800 italic">
                            {item.note}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-[#15803D]">
                          {formatMoney(lineTotal, settings.currency_code)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = cart.filter((_, i) => i !== idx);
                            setCart(next);
                            if (next.length === 0) setStep(1);
                          }}
                          className="p-1 text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-[#CDE9D5] pt-3 flex justify-between items-center text-base font-extrabold text-[#14532D]">
                <span>{t.orderPublic.totalLabel}</span>
                <span className="text-xl text-[#15803D]">
                  {formatMoney(totalAmount, settings.currency_code)}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Sticky Bottom Action Bar matching the mobile video */}
      {!confirmed && totalCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-sm border-t-2 border-[#CDE9D5] px-4 py-3 shadow-[0_-4px_16px_rgba(22,163,74,0.12)]">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step === 3 ? 2 : 1)}
                className="p-2.5 rounded-xl border border-[#CDE9D5] text-[#14532D] hover:bg-[#EAFBF0] cursor-pointer"
                title={t.orderPublic.backBtn}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}

            <div className="min-w-0">
              <p className="text-xs text-[#2F6844]">
                {t.orderPublic.totalLabel} ({totalCount})
              </p>
              <p className="text-lg font-extrabold text-[#15803D] truncate">
                {formatMoney(totalAmount, settings.currency_code)}
              </p>
            </div>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step === 1 ? 2 : 3)}
                className="px-6 py-3 rounded-2xl btn-3d-green text-sm sm:text-base font-extrabold cursor-pointer shrink-0"
              >
                {t.orderPublic.continueBtn}
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitOrder}
                className="px-6 py-3 rounded-2xl btn-3d-green text-sm sm:text-base font-extrabold cursor-pointer disabled:opacity-60 shrink-0"
              >
                {submitting
                  ? t.orderPublic.sending
                  : t.orderPublic.sendOrderBtn}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Customize Drink Modal */}
      {activeProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#DDF3E4] pb-3">
              <div className="flex items-center gap-3">
                {activeProduct.image_url && (
                  <Image
                    src={activeProduct.image_url}
                    alt={activeProduct.name}
                    width={52}
                    height={52}
                    className="w-13 h-13 rounded-xl object-cover border border-[#CDE9D5]"
                  />
                )}
                <div>
                  <h3 className="font-extrabold text-base text-[#14532D]">
                    {localizeName(activeProduct, locale)}
                  </h3>
                  <p className="text-sm text-[#15803D] font-bold">
                    {formatMoney(activeProduct.base_price, settings.currency_code)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveProduct(null)}
                className="p-1.5 rounded-lg hover:bg-[#EAFBF0] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeProdVars.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-bold text-[#14532D]">
                  {t.pos.sizeLabel}
                </p>
                <div className="space-y-2">
                  {activeProdVars.map((v) => {
                    const q = variantQtys[v.id] ?? 0;
                    return (
                      <div
                        key={v.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                          q > 0
                            ? "bg-[#EAFBF0] border-[#16A34A]"
                            : "bg-white border-[#CDE9D5]"
                        }`}
                      >
                        <div className="text-sm font-bold text-[#14532D]">
                          <span>{v.name}</span>
                          <span className="ml-2 text-[#15803D]">
                            {formatMoney(v.price, settings.currency_code)}
                          </span>
                        </div>
                        <div className="inline-flex items-center gap-2 bg-white border border-[#CDE9D5] rounded-xl px-2 py-1">
                          <button
                            type="button"
                            onClick={() =>
                              setVariantQtys((prev) => ({
                                ...prev,
                                [v.id]: Math.max(0, (prev[v.id] ?? 0) - 1),
                              }))
                            }
                            className="p-1 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-extrabold text-sm w-5 text-center">
                            {q}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setVariantQtys((prev) => ({
                                ...prev,
                                [v.id]: (prev[v.id] ?? 0) + 1,
                              }))
                            }
                            className="p-1 cursor-pointer text-[#16A34A]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {toppings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-[#14532D]">
                  {t.pos.toppingsLabel}
                </p>
                <div className="space-y-1.5">
                  {toppings
                    .filter((tp) => tp.is_available)
                    .map((tp) => {
                      const checked = pickedToppings.some((x) => x.id === tp.id);
                      return (
                        <button
                          key={tp.id}
                          type="button"
                          onClick={() => {
                            if (checked) {
                              setPickedToppings((prev) =>
                                prev.filter((x) => x.id !== tp.id)
                              );
                            } else {
                              setPickedToppings((prev) => [
                                ...prev,
                                { id: tp.id, name: tp.name, price: Number(tp.price) },
                              ]);
                            }
                          }}
                          className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-sm cursor-pointer ${
                            checked
                              ? "bg-[#EAFBF0] border-[#22C55E] font-bold text-[#14532D]"
                              : "bg-white border-[#CDE9D5] text-[#1E4D31]"
                          }`}
                        >
                          <span>{localizeName(tp, locale)}</span>
                          <span className="text-xs font-bold text-[#15803D]">
                            +{formatMoney(tp.price, settings.currency_code)}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            <input
              type="text"
              value={pickedNote}
              onChange={(e) => setPickedNote(e.target.value)}
              placeholder={t.pos.itemNotePlaceholder}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-[#CDE9D5]"
            />

            <div className="flex items-center justify-between gap-3 pt-2">
              {activeProdVars.length === 0 && (
                <div className="inline-flex items-center gap-3 border border-[#CDE9D5] rounded-xl px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setPickedQty((q) => Math.max(1, q - 1))}
                    className="cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-extrabold text-base w-5 text-center">
                    {pickedQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickedQty((q) => q + 1)}
                    className="cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
              <button
                type="button"
                disabled={
                  activeProdVars.length > 0 &&
                  activeProdVars.every((v) => (variantQtys[v.id] ?? 0) === 0)
                }
                onClick={addCustomizedToCart}
                className="flex-1 py-3 rounded-xl btn-3d-green text-sm font-extrabold cursor-pointer disabled:opacity-50"
              >
                {t.pos.addToCartBtn}
                {activeProdVars.length > 0 &&
                  ` (${activeProdVars.reduce(
                    (s, v) => s + (variantQtys[v.id] ?? 0),
                    0
                  )})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
