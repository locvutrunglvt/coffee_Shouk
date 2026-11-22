"use client";

import Image from "next/image";
import { useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { useT } from "@/components/I18nProvider";
import { compressAndUploadImage } from "@/lib/uploadImage";
import type { UserRole } from "@/lib/rbac";
import {
  Coffee,
  Edit3,
  ImagePlus,
  Layers,
  Plus,
  Printer,
  QrCode,
  Trash2,
  X,
} from "lucide-react";

export interface CategoryRow {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface VariantRow {
  id: string;
  product_id: string;
  name: string;
  price: number;
  is_default: boolean;
  is_active: boolean;
}

export interface ProductRow {
  id: string;
  category_id: string | null;
  name: string;
  description: string;
  image_url: string;
  base_price: number;
  is_available: boolean;
  is_active: boolean;
}

export interface ToppingRow {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  is_active: boolean;
}

export interface TableRow {
  id: string;
  name: string;
  zone: string;
  sort_order: number;
  is_active: boolean;
}

interface MenuClientProps {
  currencyCode: string;
  userRole: UserRole;
  initialCategories: CategoryRow[];
  initialProducts: ProductRow[];
  initialVariants: VariantRow[];
  initialToppings: ToppingRow[];
  initialTables: TableRow[];
}

export function MenuClient({
  currencyCode,
  userRole,
  initialCategories,
  initialProducts,
  initialVariants,
  initialToppings,
  initialTables,
}: MenuClientProps) {
  const { t } = useT();
  const canEdit = userRole === "admin" || userRole === "manager";

  const [activeTab, setActiveTab] = useState<
    "products" | "categories" | "toppings" | "tables"
  >("products");
  const [selectedCat, setSelectedCat] = useState<string>("all");

  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [variants, setVariants] = useState(initialVariants);
  const [toppings, setToppings] = useState(initialToppings);
  const [tables, setTables] = useState(initialTables);

  // Product modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodName, setProdName] = useState("");
  const [prodCatId, setProdCatId] = useState("");
  const [prodPrice, setProdPrice] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [prodImage, setProdImage] = useState("");
  const [prodAvailable, setProdAvailable] = useState(true);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [savingProd, setSavingProd] = useState(false);

  // Variants inline inside product modal
  const [draftSizes, setDraftSizes] = useState<
    { id?: string; name: string; price: string }[]
  >([]);

  // Simple forms for Category / Topping / Table
  const [newCatName, setNewCatName] = useState("");
  const [newCatOrder, setNewCatOrder] = useState("1");

  const [newTopName, setNewTopName] = useState("");
  const [newTopPrice, setNewTopPrice] = useState("");

  const [newTableName, setNewTableName] = useState("");
  const [newTableZone, setNewTableZone] = useState("Trong nhà");
  const [qrTableModal, setQrTableModal] = useState<{
    table: TableRow;
    url: string;
    dataUrl: string;
  } | null>(null);

  async function openTableQr(tb: TableRow) {
    const orderUrl = `${window.location.origin}/order?table=${tb.id}`;
    const dataUrl = await QRCode.toDataURL(orderUrl, {
      width: 280,
      margin: 2,
      color: { dark: "#14532D", light: "#FFFFFF" },
    });
    setQrTableModal({ table: tb, url: orderUrl, dataUrl });
  }

  function printTableQr() {
    if (!qrTableModal) return;
    const win = window.open("", "_blank", "width=380,height=520");
    if (!win) return;
    win.document.write(`
      <html><head><title>${qrTableModal.table.name}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:24px;color:#14532D}img{width:240px;height:240px;border:2px solid #CDE9D5;border-radius:16px;padding:8px}</style>
      </head><body>
      <h2>Tà Ơi Coffee</h2>
      <h3>${qrTableModal.table.name} (${qrTableModal.table.zone})</h3>
      <img src="${qrTableModal.dataUrl}" />
      <p style="font-size:13px;margin-top:12px">${t.menu.tableQrDesc}</p>
      <script>window.print();</script>
      </body></html>
    `);
    win.document.close();
  }

  function openNewProductModal() {
    setEditingProductId(null);
    setProdName("");
    setProdCatId(categories[0]?.id ?? "");
    setProdPrice("");
    setProdDesc("");
    setProdImage("");
    setProdAvailable(true);
    setDraftSizes([
      { name: "M", price: "" },
      { name: "L", price: "" },
    ]);
    setModalOpen(true);
  }

  function openEditProductModal(p: ProductRow) {
    setEditingProductId(p.id);
    setProdName(p.name);
    setProdCatId(p.category_id ?? "");
    setProdPrice(String(p.base_price));
    setProdDesc(p.description ?? "");
    setProdImage(p.image_url ?? "");
    setProdAvailable(p.is_available);
    const pSizes = variants
      .filter((v) => v.product_id === p.id && v.is_active)
      .map((v) => ({ id: v.id, name: v.name, price: String(v.price) }));
    setDraftSizes(pSizes);
    setModalOpen(true);
  }

  async function handleProductImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const url = await compressAndUploadImage(file, "products");
      setProdImage(url);
    } finally {
      setUploadingImg(false);
    }
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSavingProd(true);
    try {
      const supabase = createClient();
      const payload = {
        name: prodName.trim(),
        category_id: prodCatId || null,
        base_price: Number(prodPrice) || 0,
        description: prodDesc.trim(),
        image_url: prodImage.trim(),
        is_available: prodAvailable,
        is_active: true,
      };

      let savedProd: ProductRow;
      if (editingProductId) {
        const { data, error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editingProductId)
          .select()
          .single();
        if (error) throw error;
        savedProd = data as ProductRow;
        setProducts((prev) =>
          prev.map((item) => (item.id === savedProd.id ? savedProd : item))
        );
        // Replace active variants cleanly
        await supabase
          .from("product_variants")
          .delete()
          .eq("product_id", savedProd.id);
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        savedProd = data as ProductRow;
        setProducts((prev) => [...prev, savedProd]);
      }

      const validSizes = draftSizes.filter(
        (s) => s.name.trim() !== "" && s.price !== ""
      );
      if (validSizes.length > 0) {
        const { data: insertedVariants } = await supabase
          .from("product_variants")
          .insert(
            validSizes.map((s, idx) => ({
              product_id: savedProd.id,
              name: s.name.trim(),
              price: Number(s.price) || 0,
              is_default: idx === 0,
              is_active: true,
            }))
          )
          .select();
        setVariants((prev) => [
          ...prev.filter((v) => v.product_id !== savedProd.id),
          ...((insertedVariants as VariantRow[]) ?? []),
        ]);
      } else {
        setVariants((prev) => prev.filter((v) => v.product_id !== savedProd.id));
      }

      setModalOpen(false);
    } finally {
      setSavingProd(false);
    }
  }

  async function toggleProductAvailable(p: ProductRow) {
    const supabase = createClient();
    const next = !p.is_available;
    const { error } = await supabase
      .from("products")
      .update({ is_available: next })
      .eq("id", p.id);
    if (!error) {
      setProducts((prev) =>
        prev.map((item) =>
          item.id === p.id ? { ...item, is_available: next } : item
        )
      );
    }
  }

  async function deleteProduct(id: string) {
    if (!canEdit) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", id);
    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !newCatName.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("categories")
      .insert({
        name: newCatName.trim(),
        sort_order: Number(newCatOrder) || 1,
      })
      .select()
      .single();
    if (!error && data) {
      setCategories((prev) => [...prev, data as CategoryRow]);
      setNewCatName("");
    }
  }

  async function deleteCategory(id: string) {
    if (!canEdit) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("categories")
      .update({ is_active: false })
      .eq("id", id);
    if (!error) setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleAddTopping(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !newTopName.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("toppings")
      .insert({
        name: newTopName.trim(),
        price: Number(newTopPrice) || 0,
      })
      .select()
      .single();
    if (!error && data) {
      setToppings((prev) => [...prev, data as ToppingRow]);
      setNewTopName("");
      setNewTopPrice("");
    }
  }

  async function toggleToppingAvailable(top: ToppingRow) {
    const supabase = createClient();
    const next = !top.is_available;
    const { error } = await supabase
      .from("toppings")
      .update({ is_available: next })
      .eq("id", top.id);
    if (!error) {
      setToppings((prev) =>
        prev.map((item) =>
          item.id === top.id ? { ...item, is_available: next } : item
        )
      );
    }
  }

  async function deleteTopping(id: string) {
    if (!canEdit) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("toppings")
      .update({ is_active: false })
      .eq("id", id);
    if (!error) setToppings((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleAddTable(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !newTableName.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("dining_tables")
      .insert({
        name: newTableName.trim(),
        zone: newTableZone.trim() || "Trong nhà",
        sort_order: tables.length + 1,
      })
      .select()
      .single();
    if (!error && data) {
      setTables((prev) => [...prev, data as TableRow]);
      setNewTableName("");
    }
  }

  async function deleteTable(id: string) {
    if (!canEdit) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("dining_tables")
      .update({ is_active: false })
      .eq("id", id);
    if (!error) setTables((prev) => prev.filter((item) => item.id !== id));
  }

  const filteredProducts =
    selectedCat === "all"
      ? products
      : products.filter((p) => p.category_id === selectedCat);

  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-5">
      {/* Tabs + Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-[#CDE9D5]">
          {(
            [
              ["products", t.menu.productsTab],
              ["categories", t.menu.categoriesTab],
              ["toppings", t.menu.toppingsTab],
              ["tables", t.menu.tablesTab],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1.5 rounded-lg text-sm sm:text-base font-medium cursor-pointer transition-colors ${
                activeTab === key
                  ? "bg-[#16A34A] text-white"
                  : "text-[#1E4D31] hover:bg-[#EAFBF0]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {canEdit && activeTab === "products" && (
          <button
            type="button"
            onClick={openNewProductModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#16A34A] text-white text-sm font-semibold hover:bg-[#15803D] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.menu.addProduct}</span>
          </button>
        )}
      </div>

      {/* TAB 1: PRODUCTS GALLERY */}
      {activeTab === "products" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedCat("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
                selectedCat === "all"
                  ? "bg-[#16A34A] text-white border-[#16A34A]"
                  : "bg-white text-[#1E4D31] border-[#CDE9D5]"
              }`}
            >
              {t.common.all} ({products.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCat(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
                  selectedCat === cat.id
                    ? "bg-[#16A34A] text-white border-[#16A34A]"
                    : "bg-white text-[#1E4D31] border-[#CDE9D5]"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {filteredProducts.length === 0 ? (
            <div className="card-3d rounded-2xl p-8 text-center text-sm text-[#2F6844]">
              {t.common.noData}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((p) => {
                const pVariants = variants.filter(
                  (v) => v.product_id === p.id && v.is_active
                );
                return (
                  <div
                    key={p.id}
                    className={`bg-white rounded-2xl border overflow-hidden flex flex-col transition-shadow hover:shadow-md ${
                      p.is_available
                        ? "border-[#CDE9D5]"
                        : "border-red-200 opacity-75"
                    }`}
                  >
                    <div className="relative h-44 w-full bg-gradient-to-br from-[#F3ECE2] to-[#E7DDD0] flex items-center justify-center overflow-hidden">
                      {p.image_url ? (
                        <Image
                          src={p.image_url}
                          alt={p.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <Coffee className="w-12 h-12 text-[#16A34A]/60" />
                      )}
                      <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/90 text-[#14532D] shadow-xs">
                        {p.category_id
                          ? catMap.get(p.category_id) ?? t.menu.noCategory
                          : t.menu.noCategory}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleProductAvailable(p)}
                        className={`absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer shadow-xs ${
                          p.is_available
                            ? "bg-emerald-600 text-white"
                            : "bg-red-600 text-white"
                        }`}
                      >
                        {p.is_available ? t.menu.available : t.menu.soldOut}
                      </button>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <h3 className="font-bold text-base text-[#14532D] line-clamp-1">
                          {p.name}
                        </h3>
                        {p.description && (
                          <p className="text-xs text-[#2F6844] mt-0.5 line-clamp-2">
                            {p.description}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        {pVariants.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {pVariants.map((v) => (
                              <span
                                key={v.id}
                                className="px-2 py-0.5 rounded-lg bg-[#F2FBF4] border border-[#CDE9D5] text-base font-extrabold text-[#14532D]"
                              >
                                {v.name}:{" "}
                                <strong>{formatMoney(v.price, currencyCode)}</strong>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-[#15803D]">
                            {formatMoney(p.base_price, currencyCode)}
                          </p>
                        )}

                        {canEdit && (
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DDF3E4]">
                            <button
                              type="button"
                              onClick={() => openEditProductModal(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#F2FBF4] hover:bg-[#EAFBF0] text-[#14532D] cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>{t.common.edit}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteProduct(p.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CATEGORIES */}
      {activeTab === "categories" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {canEdit && (
            <form
              onSubmit={handleAddCategory}
              className="card-3d rounded-2xl p-5 space-y-3 h-fit"
            >
              <h2 className="font-bold text-sm text-[#14532D]">
                {t.menu.addCategory}
              </h2>
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder={t.menu.categoryName}
                className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
              <input
                type="number"
                value={newCatOrder}
                onChange={(e) => setNewCatOrder(e.target.value)}
                placeholder={t.menu.sortOrder}
                className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#16A34A] text-white text-sm font-semibold cursor-pointer"
              >
                {t.common.add}
              </button>
            </form>
          )}
          <div className="card-3d rounded-2xl p-5 space-y-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between py-2 border-b border-[#DDF3E4] last:border-0 text-sm"
              >
                <div>
                  <span className="font-semibold text-[#14532D]">{c.name}</span>
                  <span className="ml-2 text-xs text-[#2F6844]">#{c.sort_order}</span>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => deleteCategory(c.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: TOPPINGS */}
      {activeTab === "toppings" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {canEdit && (
            <form
              onSubmit={handleAddTopping}
              className="card-3d rounded-2xl p-5 space-y-3 h-fit"
            >
              <h2 className="font-bold text-sm text-[#14532D]">
                {t.menu.addTopping}
              </h2>
              <input
                type="text"
                required
                value={newTopName}
                onChange={(e) => setNewTopName(e.target.value)}
                placeholder={t.menu.toppingName}
                className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
              <input
                type="number"
                required
                min="0"
                value={newTopPrice}
                onChange={(e) => setNewTopPrice(e.target.value)}
                placeholder={t.menu.toppingPrice}
                className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#16A34A] text-white text-sm font-semibold cursor-pointer"
              >
                {t.common.add}
              </button>
            </form>
          )}
          <div className="card-3d rounded-2xl p-5 space-y-2">
            {toppings.map((top) => (
              <div
                key={top.id}
                className="flex items-center justify-between py-2 border-b border-[#DDF3E4] last:border-0 text-sm"
              >
                <div>
                  <span className="font-semibold text-[#14532D]">{top.name}</span>
                  <span className="ml-2 text-xs text-[#15803D] font-semibold">
                    +{formatMoney(top.price, currencyCode)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleToppingAvailable(top)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                      top.is_available
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {top.is_available ? t.menu.available : t.menu.soldOut}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => deleteTopping(top.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: TABLES */}
      {activeTab === "tables" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {canEdit && (
            <form
              onSubmit={handleAddTable}
              className="card-3d rounded-2xl p-5 space-y-3 h-fit"
            >
              <h2 className="font-bold text-sm text-[#14532D]">
                {t.menu.addTable}
              </h2>
              <input
                type="text"
                required
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder={t.menu.tableName}
                className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
              <input
                type="text"
                value={newTableZone}
                onChange={(e) => setNewTableZone(e.target.value)}
                placeholder={t.menu.tableZone}
                className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#16A34A] text-white text-sm font-semibold cursor-pointer"
              >
                {t.common.add}
              </button>
            </form>
          )}
          <div className="card-3d rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 h-fit">
            {tables.map((tb) => (
              <div
                key={tb.id}
                className="p-3 rounded-xl border border-[#CDE9D5] bg-[#F2FBF4] flex items-center justify-between gap-2"
              >
                <div>
                  <p className="font-bold text-sm text-[#14532D]">{tb.name}</p>
                  <p className="text-xs text-[#2F6844]">{tb.zone}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openTableQr(tb)}
                    title={t.menu.printTableQr}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#CDE9D5] text-xs font-bold text-[#15803D] hover:bg-[#EAFBF0] cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>QR</span>
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => deleteTable(tb.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {qrTableModal && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="card-3d rounded-3xl max-w-sm w-full p-6 text-center space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-base text-[#14532D]">
                    {t.menu.tableQrTitle}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setQrTableModal(null)}
                    className="p-1.5 rounded-lg hover:bg-[#EAFBF0] cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm font-bold text-[#15803D]">
                  {qrTableModal.table.name} ({qrTableModal.table.zone})
                </p>
                <Image
                  src={qrTableModal.dataUrl}
                  alt={qrTableModal.table.name}
                  width={240}
                  height={240}
                  className="w-56 h-56 mx-auto rounded-2xl border-2 border-[#CDE9D5] p-2 bg-white"
                />
                <p className="text-xs text-[#2F6844]">{t.menu.tableQrDesc}</p>
                <p className="text-[11px] font-mono break-all bg-[#F2FBF4] p-2 rounded-xl border border-[#CDE9D5]">
                  {qrTableModal.url}
                </p>
                <button
                  type="button"
                  onClick={printTableQr}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl btn-3d-green text-sm font-bold cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>{t.menu.printTableQr}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ADD / EDIT PRODUCT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveProduct}
            className="card-3d rounded-2xl w-full max-w-lg p-5 space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#DDF3E4] pb-3">
              <h3 className="font-bold text-base text-[#14532D]">
                {editingProductId ? t.menu.editProduct : t.menu.addProduct}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[#EAFBF0] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Visual Photo Upload */}
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-24 rounded-2xl border border-[#CDE9D5] bg-[#F2FBF4] flex items-center justify-center overflow-hidden shrink-0">
                {prodImage ? (
                  <Image
                    src={prodImage}
                    alt="Preview"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <Coffee className="w-8 h-8 text-[#16A34A]" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#EAFBF0] hover:bg-[#E7DDD0] text-xs font-semibold text-[#14532D] cursor-pointer">
                  <ImagePlus className="w-4 h-4" />
                  <span>
                    {uploadingImg ? t.common.loading : t.menu.uploadImage}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProductImageUpload}
                    className="hidden"
                  />
                </label>
                <input
                  type="text"
                  value={prodImage}
                  onChange={(e) => setProdImage(e.target.value)}
                  placeholder={t.menu.imageUrlPlaceholder}
                  className="w-full px-3 py-1.5 text-sm rounded-xl border border-[#CDE9D5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-base font-extrabold text-[#14532D] mb-1">
                  {t.menu.productName}
                </label>
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
                />
              </div>
              <div>
                <label className="block text-base font-extrabold text-[#14532D] mb-1">
                  {t.menu.category}
                </label>
                <select
                  value={prodCatId}
                  onChange={(e) => setProdCatId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
                >
                  <option value="">{t.menu.noCategory}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-base font-extrabold text-[#14532D] mb-1">
                  {t.menu.basePrice} ({currencyCode})
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={prodPrice}
                  onChange={(e) => setProdPrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
                />
              </div>
              <div>
                <label className="block text-base font-extrabold text-[#14532D] mb-1">
                  {t.menu.description}
                </label>
                <input
                  type="text"
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
                />
              </div>
            </div>

            {/* Sizes / Variants */}
            <div className="border-t border-[#DDF3E4] pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#14532D] inline-flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#15803D]" />
                  {t.menu.sizesTitle}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDraftSizes((prev) => [...prev, { name: "", price: "" }])
                  }
                  className="text-xs font-semibold text-[#15803D] hover:underline cursor-pointer"
                >
                  + {t.menu.addSize}
                </button>
              </div>
              {draftSizes.map((sz, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sz.name}
                    onChange={(e) =>
                      setDraftSizes((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, name: e.target.value } : item
                        )
                      )
                    }
                    placeholder={t.menu.sizeName}
                    className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-[#CDE9D5]"
                  />
                  <input
                    type="number"
                    min="0"
                    value={sz.price}
                    onChange={(e) =>
                      setDraftSizes((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, price: e.target.value } : item
                        )
                      )
                    }
                    placeholder={t.menu.sizePrice}
                    className="w-32 px-2.5 py-1.5 text-xs rounded-lg border border-[#CDE9D5]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSizes((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#CDE9D5] text-sm font-medium cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={savingProd}
                className="px-4 py-2 rounded-xl bg-[#16A34A] text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {savingProd ? t.common.saving : t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
