import { AppShell } from "@/components/AppShell";
import { ModuleStub } from "@/components/ModuleStub";
import { requireRouteAccess } from "@/lib/auth";

export default async function StockTakePage() {
  const { profile, settings } = await requireRouteAccess("/stock-take");

  return (
    <AppShell profile={profile} settings={settings}>
      <ModuleStub
        title="Kiểm kê & Cân đối kho"
        phase="Phase 4"
        description="Đối soát giữa tồn kho lý thuyết và số lượng cân/đếm thực tế tại quán."
        features={[
          "Nhập số lượng tồn thực tế trên điện thoại hoặc máy tính",
          "Tự động tính số lượng chênh lệch và giá trị tiền hao hụt",
          "Ghi nhận nguyên nhân (pha hỏng, đổ vỡ, thất thoát) và chốt cân bằng tồn kho",
        ]}
      />
    </AppShell>
  );
}
