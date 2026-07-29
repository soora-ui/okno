import { notFound } from "next/navigation";
import { GiftCertificateWidget } from "@/components/public/gift-certificate-widget";
import { PublicProfileView } from "@/components/public/public-profile-view";
import { TeamPublicProfileView } from "@/components/public/team-public-profile-view";
import { getCurrentAuthProfile, getPublicPageData } from "@/lib/data";
import { getDefaultAccountRoute } from "@/lib/workspace";

const USERNAME_PATTERN = /^[a-z0-9-]+$/;

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ certificate?: string; ct?: string }>;
};

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

  if (data.kind === "team") {
    return <TeamPublicProfileView data={data} homeHref={homeHref} />;
  }

  return (
    <>
      <PublicProfileView
        profile={data.profile}
        services={data.services}
        bookingSlotsByService={data.bookingSlotsByService}
        bookingHref={`/${username}/book`}
        homeHref={homeHref}
        eyebrowLabel={`Онлайн-запись @${username}`}
        showDemoSections={false}
      />
      {data.profile.bookingPageSettings.giftCertificatesEnabled ? (
        <div className="mx-auto max-w-2xl px-4 pb-16 sm:px-6 lg:px-8">
          <GiftCertificateWidget
            username={username}
            masterName={data.profile.fullName}
            denominations={data.profile.bookingPageSettings.giftCertificateDenominations}
            services={data.services}
            returnedCertificateId={query.certificate}
            returnedCertificateToken={query.ct}
          />
        </div>
      ) : null}
    </>
  );
}
