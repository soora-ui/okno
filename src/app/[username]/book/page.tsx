import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SiteShell } from "@/components/layout/site-shell";
import { BookingFlow } from "@/components/booking/booking-flow";
import { getPublicPageData } from "@/lib/data";
import { isPhoneVerificationRequired } from "@/lib/phone-verification";
import { resolveAcquisitionSource } from "@/lib/acquisition-sources";

// Служебная страница: в выдаче не нужна.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ service?: string; date?: string; time?: string; from?: string }>;
};

export default async function BookingPage({ params, searchParams }: Props) {
  const { username } = await params;
  const {
    service: initialServiceId,
    date: initialDate,
    time: initialTime,
    from,
  } = await searchParams;
  // Метка приходит со страницы мастера; если клиент открыл форму сразу по
  // внешней ссылке — догадываемся по Referer (документы/источники-записей.md).
  const requestHeaders = await headers();
  const acquisitionSource = resolveAcquisitionSource({
    param: from,
    referrer: requestHeaders.get("referer"),
    ownHost: requestHeaders.get("host")?.split(":")[0],
  });
  const data = await getPublicPageData(username, false);

  if (data.kind === "team") {
    redirect(`/${username}`);
  }

  return (
    <SiteShell compact hideGuestMenu showSupportWidget={false}>
      <div className="mx-auto max-w-4xl py-6">
        <BookingFlow
          username={username}
          services={data.services}
          bookingSlotsByService={data.bookingSlotsByService}
          themePresetId={data.profile.bookingThemePresetId}
          brandTheme={data.profile.brandTheme}
          commentFieldMode={data.profile.bookingPageSettings.commentFieldMode}
          initialServiceId={initialServiceId}
          initialDate={initialDate}
          initialTime={initialTime}
          phoneVerificationRequired={isPhoneVerificationRequired}
          acquisitionSource={acquisitionSource}
          timezone={data.profile.timezone}
          hotWindowsDiscount={data.profile.hotWindowsDiscount}
        />
      </div>
    </SiteShell>
  );
}
