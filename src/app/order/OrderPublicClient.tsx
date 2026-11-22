"use client";

import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { useT } from "@/components/I18nProvider";
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
  CheckCircle2,
  Coffee,
  Minus,
  Plus,
  Search,
  ShoppingBag,
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
  const { t } = useT();
  const [selectedCat, setSelectedCat] = useState("all");
  const [search, setSearch] = useState("");
  const [tableId, setTableId] = useState<string>(initialTableId ?? "");
  const [cart, setCart] = useState<PublicCartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderNote, setOrderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [confirmed, setConfirmed] = useState<{
    order_number: number;
    total_amount: number;
  } | null>(null);

  // Customize drink modal
  const [activeProduct, setActiveProduct] = useState<ProductRow | null>(null);
  const [pickedVariantId, setPickedVariantId] = useState<string | null>(null);
  const [pickedToppings, setPickedToppings] = useState<
    { id: string; name: string; price: number }[]
  >([]);
  const [pickedQty, setPickedQty] = useState(1);
  const [pickedNote, setPickedNote] = useState("");

  function openCustomize(p: ProductRow) {
    if (!p.is_available) return;
    const pVars = variants.filter((v) => v.product_id === p.id && v.is_active);
    setActiveProduct(p);
    setPickedVariantId(pVars[0]?.id ?? null);
    setPickedToppings([]);
    setPickedQty(1);
    setPickedNote("");
  }

  function addCustomizedToCart() {
    if (!activeProduct) return;
    const pVars = variants.filter(
      (v) => v.product_id === activeProduct.id && v.is_active
    );
    const chosenVar = pVars.find((v) => v.id === pickedVariantId);
    const unitPrice = chosenVar
      ? Number(chosenVar.price)
      : Number(activeProduct.base_price);

    setCart((prev) => [
      ...prev,
      {
        productId: activeProduct.id,
        variantId: chosenVar?.id ?? null,
        productName: activeProduct.name,
        variantName: chosenVar?.name ?? "",
        quantity: pickedQty,
        unitPrice,
        toppings: pickedToppings,
        note: pickedNote.trim(),
      },
    ]);
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

      const { data, error } = await supabase.rpc("submit_qr_order", {
        p_table_id: tableId || null,
        p_note: orderNote.trim(),
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
      setCartOpen(false);
    } catch {
      setErrorMsg(t.common.error);
    } finally {
      setSubmitting(false);
    }
  }

  const currentTable = tables.find((tb) => tb.id === tableId);
  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCat === "all" || p.category_id === selectedCat;
    const matchSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchCat && matchSearch;
  });

  const activeProdVars = activeProduct
    ? variants.filter((v) => v.product_id === activeProduct.id && v.is_active)
    : [];

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b-2 border-[#CDE9D5] px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Image
              src="/logo-taoi.jpeg"
              alt={settings.shop_name}
              width={42}
              height={42}
              className="w-10 h-10 rounded-xl object-cover border-2 border-[#86EFAC] shrink-0"
            />
            <div className="min-w-0">
              <p className="font-extrabold text-base text-[#14532D] truncate flex items-center gap-1">
                <span>{settings.shop_name}</span>
                <Sprout className="w-4 h-4 text-[#16A34A]" />
              </p>
              <p className="text-xs font-bold text-[#15803D] truncate">
                {currentTable
                  ? `${t.orderPublic.tableBadge}: ${currentTable.name}`
                  : t.orderPublic.welcome}
              </p>
            </div>
          </div>
          <LanguageSwitcher compact />
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-5">
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
            <div className="inline-block px-5 py-2.5 rounded-2xl bg-[#EAFBF0] border border-[#CDE9D5]">
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
        ) : (
          <>
            {/* Table selector (if customer opened /order without table param) */}
            <div className="card-3d rounded-2xl p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white font-semibold text-[#14532D]"
                >
                  <option value="">{t.orderPublic.takeAwayBadge}</option>
                  {tables.map((tb) => (
                    <option key={tb.id} value={tb.id}>
                      {tb.name} ({tb.zone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCat("all")}
                  className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold border cursor-pointer ${
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
                    className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold border cursor-pointer ${
                      selectedCat === c.id
                        ? "bg-[#16A34A] text-white border-[#16A34A]"
                        : "bg-[#F2FBF4] text-[#14532D] border-[#CDE9D5]"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Drink Gallery */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!p.is_available}
                  onClick={() => openCustomize(p)}
                  className={`text-left card-3d rounded-2xl overflow-hidden flex flex-col transition-transform ${
                    p.is_available
                      ? "hover:-translate-y-0.5 cursor-pointer"
                      : "opacity-50 cursor-not-allowed"
                  }`}
                >
                  <div className="relative h-36 sm:h-44 w-full bg-[#EAFBF0] flex items-center justify-center overflow-hidden">
                    {p.image_url ? (
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <Coffee className="w-10 h-10 text-[#16A34A]/60" />
                    )}
                    {!p.is_available && (
                      <span className="absolute inset-0 bg-black/50 text-white text-xs font-bold flex items-center justify-center">
                        {t.pos.outOfStock}
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="font-extrabold text-sm sm:text-base text-[#14532D] line-clamp-2">
                        {p.name}
                      </p>
                      {p.description && (
                        <p className="text-xs text-[#2F6844] mt-0.5 line-clamp-2">
                          {p.description}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-extrabold text-[#15803D] mt-2">
                      {formatMoney(p.base_price, settings.currency_code)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Sticky Bottom Cart Bar */}
      {!confirmed && totalCount > 0 && (
        <div className="fixed bottom-4 inset-x-4 z-30 max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="w-full py-3.5 px-5 rounded-2xl btn-3d-green flex items-center justify-between text-base font-extrabold cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              <span>
                {t.orderPublic.viewCart} ({totalCount})
              </span>
            </span>
            <span>{formatMoney(totalAmount, settings.currency_code)}</span>
          </button>
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
                    {activeProduct.name}
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
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-[#14532D]">
                  {t.pos.sizeLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeProdVars.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setPickedVariantId(v.id)}
                      className={`px-3.5 py-2 rounded-xl border text-sm font-bold cursor-pointer ${
                        pickedVariantId === v.id
                          ? "bg-[#16A34A] text-white border-[#16A34A]"
                          : "bg-white text-[#14532D] border-[#CDE9D5]"
                      }`}
                    >
                      {v.name} — {formatMoney(v.price, settings.currency_code)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {toppings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-[#14532D]">
                  {t.pos.toppingsLabel}
                </p>
                <div className="grid grid-cols-2 gap-2">
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
                          className={`p-2.5 rounded-xl border text-left text-xs sm:text-sm cursor-pointer ${
                            checked
                              ? "bg-[#EAFBF0] border-[#22C55E] font-bold text-[#14532D]"
                              : "bg-white border-[#CDE9D5] text-[#1E4D31]"
                          }`}
                        >
                          <p>{tp.name}</p>
                          <p className="text-xs text-[#15803D]">
                            +{formatMoney(tp.price, settings.currency_code)}
                          </p>
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
              <button
                type="button"
                onClick={addCustomizedToCart}
                className="flex-1 py-3 rounded-xl btn-3d-green text-sm font-extrabold cursor-pointer"
              >
                {t.pos.addToCartBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Review Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#DDF3E4] pb-3">
              <h3 className="font-extrabold text-lg text-[#14532D]">
                {t.orderPublic.yourOrder}
              </h3>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#EAFBF0] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <p className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {errorMsg}
              </p>
            )}

            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {cart.map((item, idx) => {
                const topSum = item.toppings.reduce((s, tp) => s + tp.price, 0);
                const lineTotal = (item.unitPrice + topSum) * item.quantity;
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#F2FBF4] border border-[#CDE9D5] flex items-start justify-between gap-2"
                  >
                    <div>
                      <p className="font-bold text-sm text-[#14532D]">
                        {item.quantity}x {item.productName}
                        {item.variantName ? ` (${item.variantName})` : ""}
                      </p>
                      {item.toppings.length > 0 && (
                        <p className="text-xs text-[#2F6844]">
                          + {item.toppings.map((tp) => tp.name).join(", ")}
                        </p>
                      )}
                      {item.note && (
                        <p className="text-xs text-amber-800 italic">
                          {item.note}
                        </p>
                      )}
                      <p className="text-xs font-extrabold text-[#15803D] mt-1">
                        {formatMoney(lineTotal, settings.currency_code)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setCart((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1.5 text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <input
              type="text"
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder={t.orderPublic.orderNotePlaceholder}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-[#CDE9D5]"
            />

            <div className="flex justify-between items-center text-base font-extrabold text-[#14532D] pt-1">
              <span>{t.orderPublic.totalLabel}</span>
              <span className="text-xl text-[#15803D]">
                {formatMoney(totalAmount, settings.currency_code)}
              </span>
            </div>

            <button
              type="button"
              disabled={submitting || cart.length === 0}
              onClick={handleSubmitOrder}
              className="w-full py-3.5 rounded-2xl btn-3d-green text-base font-extrabold cursor-pointer disabled:opacity-60"
            >
              {submitting
                ? t.orderPublic.sending
                : t.orderPublic.sendOrderBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
