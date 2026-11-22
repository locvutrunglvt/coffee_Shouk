import { AppShell } from "@/components/AppShell";
import { ModuleStub } from "@/components/ModuleStub";
import { requireRouteAccess } from "@/lib/auth";

export default async function BarPage() {
  const { profile, settings } = await requireRouteAccess("/bar");

  return (
    <AppShell profile={profile} settings={settings}>
      <ModuleStub
        title="Màn hình Pha chế (Bar / KDS)"
        phase="Phase 2"
        description="Hiển thị hàng chờ món theo thời gian thực qua Supabase Realtime."
        features={[
          "Tự nhảy đơn mới ngay khi thu ngân hoặc phục vụ gửi order",
          "Tô nổi bật ghi chú đặc biệt và topping từng ly",
          "Bấm chuyển trạng thái Đang làm → Hoàn thành",
        ]}
      />
    </AppShell>
  );
}
