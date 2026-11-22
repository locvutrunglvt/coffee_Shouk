import { AppShell } from "@/components/AppShell";
import { ModuleStub } from "@/components/ModuleStub";
import { requireRouteAccess } from "@/lib/auth";

export default async function ShiftsPage() {
  const { profile, settings } = await requireRouteAccess("/shifts");

  return (
    <AppShell profile={profile} settings={settings}>
      <ModuleStub
        title="Quản lý Ca & Cân đối tiền mặt"
        phase="Phase 2"
        description="Mở ca, theo dõi thu/chi tiền mặt trong ca và chốt đối soát cuối ca."
        features={[
          "Nhập tiền đầu ca khi mở két",
          "Ghi nhận phiếu chi lặt vặt trong ca (mua đá, sữa tươi...)",
          "Kết ca: nhập tiền mặt đếm được, tự đối chiếu với Tiền lý thuyết để báo khớp / thừa / thiếu",
        ]}
      />
    </AppShell>
  );
}
