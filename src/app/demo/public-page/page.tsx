import { PublicProfileView } from "@/components/public/public-profile-view";
import {
  landingDemoBookHref,
  landingDemoBookingSlotsByService,
  landingDemoProfile,
  landingDemoServices,
} from "@/lib/landing-demo";

type DemoPublicPageProps = {
  searchParams: Promise<{
    tour?: string;
  }>;
};

export default async function DemoPublicPage({ searchParams }: DemoPublicPageProps) {
  const params = await searchParams;
  const guidedDemo = params.tour !== "off";

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
    />
  );
}
