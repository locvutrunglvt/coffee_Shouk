"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES, type CurrencyCode } from "@/lib/format";
import { VIETQR_BANKS } from "@/lib/emvcoQr";
import { decodeQrFromFile } from "@/lib/decodeQrClient";
import { type UserRole } from "@/lib/rbac";
import type { ShopSettings, UserProfile } from "@/lib/auth";
import { useT } from "@/components/I18nProvider";
import { compressAndUploadImage } from "@/lib/uploadImage";
import { runTestSeed15Drinks } from "@/lib/seedTestData";
import {
  CheckCircle2,
  Database,
  Save,
  Store,
  Users,
  AlertCircle,
  Upload,
  QrCode,
} from "lucide-react";

interface SettingsClientProps {
  initialSettings: ShopSettings;
  initialProfiles: UserProfile[];
  currentUserId: string;
}

const ROLES: UserRole[] = ["admin", "manager", "cashier", "staff", "barista"];

export function SettingsClient({
  initialSettings,
  initialProfiles,
  currentUserId,
}: SettingsClientProps) {
  const router = useRouter();
  const { t } = useT();
  const [settings, setSettings] = useState<ShopSettings>({
    ...initialSettings,
    qr_mode: initialSettings.qr_mode ?? "image",
    vietqr_bank_id: initialSettings.vietqr_bank_id ?? "VCB",
    vietqr_account_no: initialSettings.vietqr_account_no ?? "",
    vietqr_account_name: initialSettings.vietqr_account_name ?? "",
    emvco_base_qr: initialSettings.emvco_base_qr ?? "",
  });
  const [profiles, setProfiles] = useState(initialProfiles);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  async function handleQrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQr(true);
    try {
      const [url, decodedStr] = await Promise.all([
        compressAndUploadImage(file, "qr"),
        decodeQrFromFile(file),
      ]);
      setSettings((prev) => ({
        ...prev,
        qr_image_url: url,
        emvco_base_qr:
          decodedStr && decodedStr.startsWith("000201")
            ? decodedStr
            : prev.emvco_base_qr,
      }));
      if (decodedStr && decodedStr.startsWith("000201")) {
        setNotice({ type: "ok", text: t.settings.qrDecodedOk });
      }
    } catch {
      setNotice({ type: "err", text: t.common.error });
    } finally {
      setUploadingQr(false);
    }
  }

  async function handleExtractEmvcoFromFile(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const decodedStr = await decodeQrFromFile(file);
    if (decodedStr && decodedStr.startsWith("000201")) {
      setSettings((prev) => ({ ...prev, emvco_base_qr: decodedStr }));
      setNotice({ type: "ok", text: t.settings.qrDecodedOk });
    } else {
      setNotice({ type: "err", text: t.settings.qrDecodeFail });
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setNotice(null);
    try {
      const supabase = createClient();
      const currency =
        CURRENCIES[
          (settings.currency_code as CurrencyCode) in CURRENCIES
            ? (settings.currency_code as CurrencyCode)
            : "LAK"
        ];

      const basePayload = {
        shop_name: settings.shop_name,
        address: settings.address,
        phone: settings.phone,
        currency_code: currency.code,
        currency_symbol: currency.symbol,
        bank_info: settings.bank_info,
        qr_image_url: settings.qr_image_url,
        updated_at: new Date().toISOString(),
      };

      const extendedPayload = {
        ...basePayload,
        qr_mode: settings.qr_mode ?? "image",
        vietqr_bank_id: settings.vietqr_bank_id ?? "",
        vietqr_account_no: settings.vietqr_account_no ?? "",
        vietqr_account_name: settings.vietqr_account_name ?? "",
        emvco_base_qr: settings.emvco_base_qr ?? "",
      };

      const { error } = await supabase
        .from("shop_settings")
        .update(extendedPayload)
        .eq("id", 1);

      if (error) {
        // Fallback if migration_public_qr_order.sql hasn't been executed yet
        const { error: fallbackErr } = await supabase
          .from("shop_settings")
          .update(basePayload)
          .eq("id", 1);
        if (fallbackErr) throw fallbackErr;
      }

      setNotice({ type: "ok", text: t.settings.settingsSaved });
      router.refresh();
    } catch {
      setNotice({ type: "err", text: t.settings.settingsError });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleUpdateRole(
    userId: string,
    role: UserRole,
    isActive: boolean
  ) {
    setSavingUserId(userId);
    setNotice(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ role, is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (error) throw error;
      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, role, is_active: isActive } : p))
      );
      setNotice({ type: "ok", text: t.settings.roleUpdated });
    } catch {
      setNotice({ type: "err", text: t.settings.roleError });
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${
            notice.type === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {notice.type === "ok" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="card-3d rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-2 text-[#14532D] font-bold">
          <Store className="w-5 h-5 text-[#15803D]" />
          <h2>{t.settings.shopInfoTitle}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-[#14532D] mb-1">
              {t.settings.shopName}
            </label>
            <input
              type="text"
              required
              value={settings.shop_name}
              onChange={(e) =>
                setSettings({ ...settings, shop_name: e.target.value })
              }
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[#14532D] mb-1">
              {t.settings.currencyLabel}
            </label>
            <select
              value={settings.currency_code}
              onChange={(e) => {
                const code = e.target.value as CurrencyCode;
                setSettings({
                  ...settings,
                  currency_code: code,
                  currency_symbol: CURRENCIES[code].symbol,
                });
              }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
            >
              {Object.values(CURRENCIES).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-[#14532D] mb-1">
              {t.settings.shopPhone}
            </label>
            <input
              type="text"
              value={settings.phone ?? ""}
              onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[#14532D] mb-1">
              {t.settings.shopAddress}
            </label>
            <input
              type="text"
              value={settings.address ?? ""}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
            />
          </div>
        </div>

        {/* Dynamic Payment QR Section */}
        <div className="border-t border-[#DDF3E4] pt-4 space-y-4">
          <div className="flex items-center gap-2 text-[#14532D] font-bold">
            <QrCode className="w-5 h-5 text-[#15803D]" />
            <span>{t.settings.qrModeLabel}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                ["image", t.settings.qrModeImage],
                ["emvco", t.settings.qrModeEmvco],
                ["vietqr", t.settings.qrModeVietqr],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setSettings({ ...settings, qr_mode: m })}
                className={`p-3 rounded-xl border text-left text-xs sm:text-sm font-bold cursor-pointer ${
                  settings.qr_mode === m
                    ? "bg-[#16A34A] text-white border-[#16A34A]"
                    : "bg-[#F2FBF4] text-[#14532D] border-[#CDE9D5]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {settings.qr_mode === "vietqr" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#F2FBF4] p-3.5 rounded-xl border border-[#CDE9D5]">
              <div>
                <label className="block text-xs font-bold text-[#14532D] mb-1">
                  {t.settings.vietqrBank}
                </label>
                <select
                  value={settings.vietqr_bank_id ?? "VCB"}
                  onChange={(e) =>
                    setSettings({ ...settings, vietqr_bank_id: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
                >
                  {VIETQR_BANKS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} - {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#14532D] mb-1">
                  {t.settings.vietqrAccountNo}
                </label>
                <input
                  type="text"
                  value={settings.vietqr_account_no ?? ""}
                  onChange={(e) =>
                    setSettings({ ...settings, vietqr_account_no: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#14532D] mb-1">
                  {t.settings.vietqrAccountName}
                </label>
                <input
                  type="text"
                  value={settings.vietqr_account_name ?? ""}
                  onChange={(e) =>
                    setSettings({ ...settings, vietqr_account_name: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
                />
              </div>
            </div>
          )}

          {settings.qr_mode === "emvco" && (
            <div className="bg-[#F2FBF4] p-3.5 rounded-xl border border-[#CDE9D5] space-y-2.5">
              <p className="text-xs text-[#2F6844]">{t.settings.emvcoHint}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#CDE9D5] text-xs font-bold text-[#14532D] cursor-pointer hover:bg-[#EAFBF0]">
                  <Upload className="w-4 h-4" />
                  <span>{t.settings.scanQrFromImage}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleExtractEmvcoFromFile}
                    className="hidden"
                  />
                </label>
              </div>
              <textarea
                rows={2}
                value={settings.emvco_base_qr ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, emvco_base_qr: e.target.value })
                }
                placeholder={t.settings.emvcoBaseQr}
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#CDE9D5] bg-white font-mono"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[#14532D] mb-1">
                {t.settings.bankInfo}
              </label>
              <input
                type="text"
                placeholder="BCEL One - 010123456789 - TAOI COFFEE"
                value={settings.bank_info ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, bank_info: e.target.value })
                }
                className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[#14532D] mb-1">
                {t.settings.qrImageUrl}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="https://..."
                  value={settings.qr_image_url ?? ""}
                  onChange={(e) =>
                    setSettings({ ...settings, qr_image_url: e.target.value })
                  }
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
                />
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#CDE9D5] bg-[#F2FBF4] hover:bg-[#EAFBF0] text-xs font-semibold cursor-pointer shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingQr ? t.common.loading : "QR"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQrFileChange}
                    className="hidden"
                  />
                </label>
              </div>
              {settings.qr_image_url && (
                <div className="mt-2">
                  <Image
                    src={settings.qr_image_url}
                    alt="QR"
                    width={112}
                    height={112}
                    className="w-28 h-28 object-contain rounded-xl border border-[#CDE9D5] bg-white p-1"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={savingSettings}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl btn-3d-green text-sm font-bold cursor-pointer disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          <span>{savingSettings ? t.common.saving : t.settings.saveSettingsBtn}</span>
        </button>
      </form>

      {/* 1-Click Test Data Loader */}
      <div className="card-3d rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-[#EAFBF0] to-white">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center gap-2 font-extrabold text-[#14532D]">
            <Database className="w-5 h-5 text-[#16A34A]" />
            <h2>{t.settings.seedTestTitle}</h2>
          </div>
          <p className="text-xs sm:text-sm text-[#2F6844]">
            {t.settings.seedTestHint}
          </p>
        </div>
        <button
          type="button"
          disabled={seeding}
          onClick={async () => {
            setSeeding(true);
            setNotice(null);
            try {
              const supabase = createClient();
              const res = await runTestSeed15Drinks(supabase);
              setNotice({
                type: "ok",
                text:
                  res === "seeded"
                    ? t.settings.seedTestDone
                    : t.settings.seedAlreadyHasData,
              });
              router.refresh();
            } catch {
              setNotice({ type: "err", text: t.common.error });
            } finally {
              setSeeding(false);
            }
          }}
          className="px-4 py-2.5 rounded-xl btn-3d-green text-sm font-bold cursor-pointer disabled:opacity-60 shrink-0"
        >
          {seeding ? t.common.loading : t.settings.seedTestBtn}
        </button>
      </div>

      <div className="card-3d rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[#14532D] font-bold">
            <Users className="w-5 h-5 text-[#15803D]" />
            <h2>
              {t.settings.staffTitle} ({profiles.length})
            </h2>
          </div>
          <p className="text-xs text-[#2F6844]">{t.settings.staffHint}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-[#CDE9D5] text-xs text-[#2F6844]">
                <th className="py-2.5 pr-4">{t.settings.colName}</th>
                <th className="py-2.5 pr-4">{t.settings.colEmail}</th>
                <th className="py-2.5 pr-4">{t.settings.colRole}</th>
                <th className="py-2.5 pr-4">{t.settings.colStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDF3E4]">
              {profiles.map((p) => {
                const isSelf = p.id === currentUserId;
                return (
                  <tr key={p.id}>
                    <td className="py-3 pr-4 font-medium">
                      {p.full_name || p.email}
                      {isSelf && (
                        <span className="ml-2 text-[11px] text-[#15803D] font-semibold">
                          {t.settings.youTag}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-[#2F6844]">{p.email}</td>
                    <td className="py-3 pr-4">
                      <select
                        disabled={isSelf || savingUserId === p.id}
                        value={p.role}
                        onChange={(e) =>
                          handleUpdateRole(
                            p.id,
                            e.target.value as UserRole,
                            p.is_active
                          )
                        }
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-[#CDE9D5] bg-white disabled:opacity-60"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t.roles[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        disabled={isSelf || savingUserId === p.id}
                        onClick={() => handleUpdateRole(p.id, p.role, !p.is_active)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer disabled:opacity-60 ${
                          p.is_active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        {p.is_active ? t.common.active : t.common.locked}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
