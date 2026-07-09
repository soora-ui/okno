import { redirect } from "next/navigation";
import { SiteShell } from "@/components/layout/site-shell";
import { BookingFlow } from "@/components/booking/booking-flow";
import { getPublicPageData } from "@/lib/data";
import { isPhoneVerificationRequired } from "@/lib/phone-verification";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ service?: string }>;
};

export default async function BookingPage({ params, searchParams }: Props) {
  const { username } = await params;
  const { service: initialServiceId } = await searchParams;
  const data = await getPublicPageData(username, false);

  if (data.kind === "team") {
    redirect(`/${username}`);
  }

  return (
    <SiteShell compact hideGuestMenu>
      <div className="mx-auto max-w-4xl py-6">
        <BookingFlow
          username={username}
          services={data.services}
          bookingSlotsByService={data.bookingSlotsByService}
          themePresetId={data.profile.bookingThemePresetId}
          commentFieldMode={data.profile.bookingPageSettings.commentFieldMode}
          initialServiceId={initialServiceId}
          phoneVerificationRequired={isPhoneVerificationRequired}
        />
      </div>
    </SiteShell>
  );
}
