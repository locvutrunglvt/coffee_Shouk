import { AppShell } from "@/components/AppShell";
import { ModuleStub } from "@/components/ModuleStub";
import { requireRouteAccess } from "@/lib/auth";

export default async function MenuPage() {
  const { profile, settings } = await requireRouteAccess("/menu");

  return (
    <AppShell profile={profile} settings={settings}>
      <ModuleStub
        title="Quản lý Thực đơn (Menu)"
        phase="Phase 2"
        description="Danh mục đồ uống, biến thể Size, Topping và trạng thái còn/hết hàng."
        features={[
          "Thêm / sửa danh mục, món nước, giá theo từng Size",
          "Quản lý nhóm Topping đi kèm",
          "Bật / tắt nhanh trạng thái Hết món cho quầy và pha chế",
        ]}
      />
    </AppShell>
  );
}
