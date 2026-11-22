import { AppShell } from "@/components/AppShell";
import { ModuleStub } from "@/components/ModuleStub";
import { requireRouteAccess } from "@/lib/auth";

export default async function InventoryPage() {
  const { profile, settings } = await requireRouteAccess("/inventory");

  return (
    <AppShell profile={profile} settings={settings}>
      <ModuleStub
        title="Nhập kho, Tồn kho & Định lượng"
        phase="Phase 3"
        description="Quản lý nguyên liệu, phiếu nhập từ nhà cung cấp và công thức trừ kho tự động."
        features={[
          "Quy đổi đơn vị nhập (Thùng/Kg/Lít) sang đơn vị định lượng (g/ml/cái)",
          "Lập phiếu nhập kho và tự tính Giá vốn bình quân gia quyền",
          "Gắn định lượng nguyên liệu cho từng món/size/topping để trừ kho khi bán",
          "Cảnh báo tồn kho tối thiểu và xem thẻ kho biến động",
        ]}
      />
    </AppShell>
  );
}
