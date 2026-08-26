import { SiteShell } from "@/components/layout/site-shell";

export default function CabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SiteShell compact showAccountNotifications bottomNav>
      {children}
    </SiteShell>
  );
}
