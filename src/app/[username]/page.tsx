import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GiftCertificateWidget } from "@/components/public/gift-certificate-widget";
import { PublicProfileView } from "@/components/public/public-profile-view";
import { TeamPublicProfileView } from "@/components/public/team-public-profile-view";
import { JsonLd } from "@/components/seo/json-ld";
import { getCurrentAuthProfile, getPublicPageData } from "@/lib/data";
import { buildPublicProfileJsonLd, buildPublicProfileMetadata } from "@/lib/seo/public-profile";
import { getConsultantServiceIds } from "@/lib/service-consultant/availability";
import { getDefaultAccountRoute } from "@/lib/workspace";

const USERNAME_PATTERN = /^[a-z0-9-]+$/;

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ certificate?: string; ct?: string }>;
};

// getPublicPageData обёрнут в cache(): страница переиспользует тот же
// результат, второго похода в базу нет.
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { username } = await params;
  if (!USERNAME_PATTERN.test(username)) notFound();
  return buildPublicProfileMetadata(await getPublicPageData(username), username);
}

export default async function PublicProfilePage({ params, searchParams }: Props) {
  const { username } = await params;
  if (!USERNAME_PATTERN.test(username)) notFound();

  const [data, authProfile, query] = await Promise.all([
    getPublicPageData(username),
    getCurrentAuthProfile(),
    searchParams,
  ]);
  const homeHref = authProfile
    ? getDefaultAccountRoute({
        accountRole: authProfile.profile.accountRole,
        workspaceKind: authProfile.profile.workspaceKind,
      })
    : "/";

  const structuredData = <JsonLd data={buildPublicProfileJsonLd(data, username)} />;

  if (data.kind === "team") {
    return (
      <>
        {structuredData}
        <TeamPublicProfileView data={data} homeHref={homeHref} />
      </>
    );
  }

  // Здесь клиент аноним: предыдущего визита нет, поэтому предложить время для
  // повторной записи консультант не сможет — только ответить по мануалу.
  const consultantServiceIds = await getConsultantServiceIds({
    profileId: data.profile.id,
    profile: data.profile,
  });

  return (
    <>
      {structuredData}
      <PublicProfileView
        profile={data.profile}
        services={data.services}
        bookingSlotsByService={data.bookingSlotsByService}
        bookingHref={`/${username}/book`}
        homeHref={homeHref}
        eyebrowLabel={`Онлайн-запись @${username}`}
        showDemoSections={false}
        certificateSlot={
          data.profile.bookingPageSettings.giftCertificatesEnabled ? (
            <GiftCertificateWidget
              username={username}
              masterName={data.profile.fullName}
              denominations={data.profile.bookingPageSettings.giftCertificateDenominations}
              services={data.services}
              returnedCertificateId={query.certificate}
              returnedCertificateToken={query.ct}
            />
          ) : null
        }
        consultantServiceIds={consultantServiceIds}
      />
    </>
  );
}
