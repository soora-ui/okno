import { NextResponse } from "next/server";
import { getCurrentAuthProfile } from "@/lib/data";
import { getOwnerFreeWindows } from "@/lib/free-windows-data";
import { renderFreeWindowsStoryPng } from "@/lib/free-windows-story";
import {
  defaultStoryPalette,
  parseStoryPalette,
  parseStoryStyle,
} from "@/lib/free-windows-story-options";
import { logError } from "@/lib/observability/logger";
import { formatPublicProfileLink } from "@/lib/site";

// Картинка «Горящие окошки» для сторис мастера (документы/горящие-окошки.md).
// Только для вошедшего мастера и только его окошки. Стиль и цвет — из
// окна выбора в кабинете (?style=light|arch|ink&palette=sage|…), по
// умолчанию — цвет страницы записи мастера. ?format=data — те же окошки
// JSON-ом для превью.
export async function GET(request: Request) {
  const authProfile = await getCurrentAuthProfile();
  if (!authProfile) {
    return NextResponse.json({ error: "Нужно войти в кабинет." }, { status: 401 });
  }

  const { profile } = authProfile;
  const { searchParams } = new URL(request.url);
  const freeWindows = await getOwnerFreeWindows(authProfile);

  if (freeWindows.status !== "ready" || freeWindows.days.length === 0) {
    return NextResponse.json(
      { error: "Свободных окошек на ближайшие дни нет." },
      { status: 404 },
    );
  }

  const publicLink = formatPublicProfileLink(profile.username);

  // Данные для превью в окне выбора: шаблон собирается в браузере, и
  // переключение стиля и цвета не ждёт рендера PNG на сервере.
  if (searchParams.get("format") === "data") {
    return NextResponse.json(
      { days: freeWindows.days, masterName: profile.fullName, publicLink },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const png = await renderFreeWindowsStoryPng({
      days: freeWindows.days,
      masterName: profile.fullName,
      publicLink,
      style: parseStoryStyle(searchParams.get("style")),
      palette:
        parseStoryPalette(searchParams.get("palette")) ??
        defaultStoryPalette(profile.bookingThemePresetId),
    });

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="okoshki.png"',
        // Минута кэша: окно выбора показывает эту же картинку как превью, а
        // потом отдаёт её на скачивание — второй рендер не нужен. Дольше
        // нельзя: окошки меняются с каждой новой записью.
        "Cache-Control": "private, max-age=60",
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
