import { notFound } from "next/navigation";
import { PublicProfileView } from "@/components/public/public-profile-view";
import { TeamPublicProfileView } from "@/components/public/team-public-profile-view";
import { getCurrentAuthProfile, getPublicPageData } from "@/lib/data";
import { getDefaultAccountRoute } from "@/lib/workspace";

const USERNAME_PATTERN = /^[a-z0-9-]+$/;

type Props = {
  params: Promise<{ username: string }>;
};

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  if (!USERNAME_PATTERN.test(username)) notFound();

  const [data, authProfile] = await Promise.all([
    getPublicPageData(username),
    getCurrentAuthProfile(),
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
    <PublicProfileView
      profile={data.profile}
      services={data.services}
      bookingSlotsByService={data.bookingSlotsByService}
      bookingHref={`/${username}/book`}
      homeHref={homeHref}
      eyebrowLabel={`Онлайн-запись @${username}`}
      showDemoSections={false}
    />
  );
}
