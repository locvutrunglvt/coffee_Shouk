import { AppShell } from "@/components/AppShell";
import { ModuleStub } from "@/components/ModuleStub";
import { requireRouteAccess } from "@/lib/auth";

export default async function PosPage() {
  const { profile, settings } = await requireRouteAccess("/pos");

  return (
    <AppShell profile={profile} settings={settings}>
      <ModuleStub
        title="Bán hàng tại quầy & Order (POS)"
        phase="Phase 2"
        description="Hỗ trợ cả máy tính thu ngân và điện thoại phục vụ đi bàn."
        features={[
          "Chọn bàn (Tại quán), Mang đi hoặc Giao hàng",
          "Chọn món, Size (S/M/L), Topping và ghi chú ít đá / độ ngọt",
          "Thanh toán Tiền mặt (tính tiền thừa) hoặc hiển thị QR ngân hàng",
          "Gửi đơn real-time xuống màn hình Pha chế và tự trừ kho theo định lượng",
        ]}
      />
    </AppShell>
  );
}
