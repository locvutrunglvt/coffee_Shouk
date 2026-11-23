"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient as createRawSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { CURRENCIES, type CurrencyCode } from "@/lib/format";
import { VIETQR_BANKS } from "@/lib/emvcoQr";
import { decodeQrFromFile } from "@/lib/decodeQrClient";
import {
  assignableRolesFor,
  canManageUser,
  ROLE_ORDER,
  ROLE_STYLE,
  type UserRole,
} from "@/lib/rbac";
import type { ShopSettings, UserProfile } from "@/lib/auth";
import { useT } from "@/components/I18nProvider";
import { compressAndUploadImage } from "@/lib/uploadImage";
import { runTestSeed15Drinks } from "@/lib/seedTestData";
import {
  CheckCircle2,
  Database,
  Save,
  ShieldCheck,
  Store,
  UserPlus,
  Users,
  AlertCircle,
  Upload,
  QrCode,
} from "lucide-react";

interface SettingsClientProps {
  initialSettings: ShopSettings;
  initialProfiles: UserProfile[];
  currentUserId: string;
  currentUserRole: UserRole;
}

export function SettingsClient({
  initialSettings,
  initialProfiles,
  currentUserId,
  currentUserRole,
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

  // Create staff account form
  const assignableRoles = assignableRolesFor(currentUserRole);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>(
    assignableRoles.includes("manager")
      ? "manager"
      : assignableRoles[0] ?? "staff"
  );
  const [creatingStaff, setCreatingStaff] = useState(false);

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

  async function demoteExistingAdminIfNeeded(
    supabase: ReturnType<typeof createClient>,
    excludeUserId: string
  ): Promise<boolean> {
    const existingAdmin = profiles.find(
      (p) => p.role === "admin" && p.id !== excludeUserId
    );
    if (!existingAdmin) return true;
    if (!window.confirm(t.settings.confirmReplaceAdmin)) {
      return false;
    }
    const { error: demoteErr } = await supabase
      .from("profiles")
      .update({ role: "manager", updated_at: new Date().toISOString() })
      .eq("id", existingAdmin.id);
    if (demoteErr) throw demoteErr;

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === existingAdmin.id ? { ...p, role: "manager" } : p
      )
    );
    return true;
  }

  async function handleUpdateRole(
    userId: string,
    role: UserRole,
    isActive: boolean
  ) {
    const target = profiles.find((p) => p.id === userId);
    if (!target || !canManageUser(currentUserRole, currentUserId, target)) {
      return;
    }
    if (!assignableRoles.includes(role)) return;

    setSavingUserId(userId);
    setNotice(null);
    try {
      const supabase = createClient();
      if (role === "admin") {
        const ok = await demoteExistingAdminIfNeeded(supabase, userId);
        if (!ok) return;
      }

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

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    if (creatingStaff || !assignableRoles.includes(newRole)) return;
    if (newPassword.length < 6) {
      setNotice({ type: "err", text: t.auth.passwordTooShort });
      return;
    }

    setCreatingStaff(true);
    setNotice(null);
    try {
      const { url, anonKey, isConfigured } = getSupabaseEnv();
      if (!isConfigured) throw new Error("Not configured");

      const supabase = createClient();
      if (newRole === "admin") {
        const ok = await demoteExistingAdminIfNeeded(supabase, "");
        if (!ok) return;
      }

      // Isolated non-persisted client so current manager session is NOT replaced
      const isolatedClient = createRawSupabaseClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const trimmedEmail = newEmail.trim().toLowerCase();
      const trimmedName = newFullName.trim() || trimmedEmail.split("@")[0];

      const { data, error: signUpErr } = await isolatedClient.auth.signUp({
        email: trimmedEmail,
        password: newPassword,
        options: {
          data: {
            full_name: trimmedName,
          },
        },
      });

      if (signUpErr) {
        if (signUpErr.message.toLowerCase().includes("already registered")) {
          setNotice({ type: "err", text: t.settings.staffEmailExists });
        } else {
          setNotice({ type: "err", text: signUpErr.message });
        }
        return;
      }

      if (
        data.user &&
        Array.isArray(data.user.identities) &&
        data.user.identities.length === 0
      ) {
        setNotice({ type: "err", text: t.settings.staffEmailExists });
        return;
      }

      const createdUser = data.user;
      if (!createdUser) {
        setNotice({ type: "err", text: t.settings.roleError });
        return;
      }

      // Immediately set intended role + active status using authenticated admin/developer session
      const { data: updatedProf, error: profErr } = await supabase
        .from("profiles")
        .upsert(
          {
            id: createdUser.id,
            full_name: trimmedName,
            email: trimmedEmail,
            role: newRole,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select("id, full_name, email, phone, role, is_active")
        .single();

      if (profErr) throw profErr;

      setProfiles((prev) => {
        const exists = prev.some((x) => x.id === createdUser.id);
        const row = (updatedProf as UserProfile) ?? {
          id: createdUser.id,
          full_name: trimmedName,
          email: trimmedEmail,
          phone: "",
          role: newRole,
          is_active: true,
        };
        return exists
          ? prev.map((x) => (x.id === createdUser.id ? row : x))
          : [...prev, row];
      });

      setNewFullName("");
      setNewEmail("");
      setNewPassword("");
      setNotice({
        type: "ok",
        text: data.session
          ? t.settings.staffCreatedOk
          : t.settings.staffCreatedConfirmEmail,
      });
    } catch {
      setNotice({ type: "err", text: t.settings.roleError });
    } finally {
      setCreatingStaff(false);
    }
  }

  const sortedProfiles = [...profiles].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)
  );

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

      {/* Create New Staff / Admin Account */}
      <form
        onSubmit={handleCreateStaff}
        className="card-3d rounded-2xl p-5 space-y-4 bg-white"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[#14532D] font-bold">
            <UserPlus className="w-5 h-5 text-[#15803D]" />
            <h2>{t.settings.createStaffTitle}</h2>
          </div>
          <span className="text-xs font-semibold text-[#15803D] bg-[#EAFBF0] border border-[#CDE9D5] px-2.5 py-1 rounded-full">
            {t.settings.onlyOneAdminNote}
          </span>
        </div>
        <p className="text-xs text-[#2F6844]">{t.settings.createStaffHint}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#14532D] mb-1">
              {t.auth.fullName}
            </label>
            <input
              type="text"
              required
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              placeholder={t.auth.fullNamePlaceholder}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#14532D] mb-1">
              {t.auth.email}
            </label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t.auth.emailPlaceholder}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#14532D] mb-1">
              {t.settings.staffPassword}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.auth.passwordPlaceholder}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#14532D] mb-1">
              {t.settings.colRole}
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[#CDE9D5] bg-white"
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {t.roles[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={creatingStaff}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-3d-green text-sm font-bold cursor-pointer disabled:opacity-60"
        >
          <UserPlus className="w-4 h-4" />
          <span>
            {creatingStaff ? t.settings.creatingStaff : t.settings.createStaffBtn}
          </span>
        </button>
      </form>

      {/* Staff Permissions Table */}
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
              {sortedProfiles.map((p) => {
                const isSelf = p.id === currentUserId;
                const manageable = canManageUser(
                  currentUserRole,
                  currentUserId,
                  p
                );
                const roleBadge = ROLE_STYLE[p.role]?.badgeClass ?? "";

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
                      {manageable ? (
                        <select
                          disabled={savingUserId === p.id}
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
                          {assignableRoles.map((r) => (
                            <option key={r} value={r}>
                              {t.roles[r]}
                            </option>
                          ))}
                          {!assignableRoles.includes(p.role) && (
                            <option value={p.role}>{t.roles[p.role]}</option>
                          )}
                        </select>
                      ) : (
                        <span
                          title={
                            p.role === "developer"
                              ? t.settings.roleDeveloperLocked
                              : t.settings.cannotManageHigher
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${roleBadge}`}
                        >
                          {p.role === "developer" && (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          )}
                          <span>{t.roles[p.role]}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        disabled={!manageable || savingUserId === p.id}
                        onClick={() => handleUpdateRole(p.id, p.role, !p.is_active)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed ${
                          p.is_active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-800 border-amber-300 font-bold"
                        }`}
                      >
                        {p.is_active
                          ? t.common.active
                          : manageable
                          ? t.settings.approveBtn
                          : t.settings.pendingBadge}
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
