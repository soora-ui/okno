import { PublicProfileView } from "@/components/public/public-profile-view";
import {
  landingDemoBookHref,
  landingDemoBookingSlotsByService,
  landingDemoProfile,
  landingDemoServices,
} from "@/lib/landing-demo";
import { demoConsultantReply } from "@/lib/tour-demo-content";

type DemoPublicPageProps = {
  searchParams: Promise<{
    tour?: string;
    /** consultant=1 — у первой услуги кнопка консультанта с демо-ответом (база знаний). */
    consultant?: string;
  }>;
};

export default async function DemoPublicPage({ searchParams }: DemoPublicPageProps) {
  const params = await searchParams;
  const guidedDemo = params.tour !== "off";
  const consultantServiceId = params.consultant === "1" ? landingDemoServices[0]?.id : undefined;

  return (
    <PublicProfileView
      profile={landingDemoProfile}
      services={landingDemoServices}
      bookingSlotsByService={landingDemoBookingSlotsByService}
      bookingHref={landingDemoBookHref}
      homeHref="/"
      eyebrowLabel={
        guidedDemo ? "Демо публичной страницы" : `Онлайн-запись @${landingDemoProfile.username}`
      }
      showDemoSections={guidedDemo}
      guidedDemo={guidedDemo}
      guidedDemoCleanHref="/demo/public-page?tour=off"
      tourThemeBridge={!guidedDemo}
      consultantServiceIds={consultantServiceId ? [consultantServiceId] : undefined}
      consultantDemoReplies={
        consultantServiceId ? { [consultantServiceId]: demoConsultantReply } : undefined
      }
    />
  );
}
