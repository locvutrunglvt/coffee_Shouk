import { AppShell } from "@/components/AppShell";
import { ModuleStub } from "@/components/ModuleStub";
import { requireRouteAccess } from "@/lib/auth";

export default async function ExpensesPage() {
  const { profile, settings } = await requireRouteAccess("/expenses");

  return (
    <AppShell profile={profile} settings={settings}>
      <ModuleStub
        title="Chi phí vận hành (Điện, Nước, Thuê mặt bằng)"
        phase="Phase 5"
        description="Theo dõi chi phí cố định định kỳ, hóa đơn điện nước và lương nhân viên."
        features={[
          "Thuê mặt bằng & Internet: đặt chu kỳ trả (1/3/6/12 tháng), nhắc hạn và phân bổ theo tháng",
          "Tiền điện & nước: nhập chỉ số đầu – cuối kỳ hoặc tổng tiền hóa đơn, so sánh theo tháng",
          "Đính kèm ảnh chụp hóa đơn / biên lai",
        ]}
      />
    </AppShell>
  );
}
