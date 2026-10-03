import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { DemoCabinetGuard } from "@/components/tour/demo-cabinet-guard";

// Демо-кабинет для тура (/demo/tour): те же страницы кабинета на мок-данных.
// Доступ без входа даёт proxy, см. src/lib/demo-cabinet.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DemoCabinetLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell compact showAccountNotifications bottomNav showSupportWidget={false}>
      {children}
      <DemoCabinetGuard />
    </SiteShell>
  );
}
