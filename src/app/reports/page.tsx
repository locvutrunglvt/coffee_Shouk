import { AppShell } from "@/components/AppShell";
import { ModuleStub } from "@/components/ModuleStub";
import { requireRouteAccess } from "@/lib/auth";

export default async function ReportsPage() {
  const { profile, settings } = await requireRouteAccess("/reports");

  return (
    <AppShell profile={profile} settings={settings}>
      <ModuleStub
        title="Báo cáo Cân đối Lãi / Lỗ (P&L)"
        phase="Phase 5"
        description="Tổng hợp doanh thu, giá vốn nguyên liệu, hao hụt kho và chi phí vận hành."
        features={[
          "Bảng cân đối Lãi/Lỗ: Doanh thu - Giá vốn - Hao hụt - Chi phí = Lợi nhuận ròng",
          "Tính điểm hòa vốn mỗi ngày/tháng",
          "Thống kê món bán chạy và xuất báo cáo Excel (.xlsx)",
        ]}
      />
    </AppShell>
  );
}
