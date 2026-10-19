import { NextResponse } from "next/server";
import { getCurrentAuthProfile } from "@/lib/data";
import { getOwnerFreeWindows } from "@/lib/free-windows-data";
import { renderFreeWindowsStoryPng } from "@/lib/free-windows-story";
import { logError } from "@/lib/observability/logger";
import { formatPublicProfileLink } from "@/lib/site";

// Картинка «Горящие окошки» для сторис мастера (документы/горящие-окошки.md).
// Только для вошедшего мастера и только его окошки. Не кэшируем: окошки
// меняются с каждой новой записью, а рендер дешёвый.
export async function GET() {
  const authProfile = await getCurrentAuthProfile();
  if (!authProfile) {
    return NextResponse.json({ error: "Нужно войти в кабинет." }, { status: 401 });
  }

  const { profile } = authProfile;
  const freeWindows = await getOwnerFreeWindows(authProfile);

  if (freeWindows.status !== "ready" || freeWindows.days.length === 0) {
    return NextResponse.json(
      { error: "Свободных окошек на ближайшие дни нет." },
      { status: 404 },
    );
  }

  try {
    const png = await renderFreeWindowsStoryPng({
      days: freeWindows.days,
      masterName: profile.fullName,
      publicLink: formatPublicProfileLink(profile.username),
      themePresetId: profile.bookingThemePresetId,
    });

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="okoshki.png"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logError("Free windows story: render failed", { profileId: profile.id, error });
    return NextResponse.json(
      { error: "Не получилось нарисовать картинку." },
      { status: 500 },
    );
  }
}
