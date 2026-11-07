import { NextResponse } from "next/server";
import { getCurrentAuthProfile } from "@/lib/data";
import { resolveFreeWindowsStoryTarget } from "@/lib/free-windows-data";
import { renderFreeWindowsStoryPng } from "@/lib/free-windows-story";
import { loadServerStoryBrand } from "@/lib/free-windows-story-brand";
import { brandLogoPath } from "@/lib/brand-theme/decor";
import { resolveProfileMediaUrl } from "@/lib/profile-media";
import {
  defaultStoryPalette,
  parseStoryPalette,
  parseStoryStyle,
} from "@/lib/free-windows-story-options";
import { logError } from "@/lib/observability/logger";
import { formatPublicProfileLink } from "@/lib/site";
import { isHotWindowsDiscountActive, maxDiscountPercent } from "@/lib/service-discounts";

// Процент скидки для стикера на картинке: из окна выбора, где мастер её и
// включает (setHotWindowsDiscountAction). Чужое значение — без стикера.
function parseDiscountPercent(value: string | null) {
  const percent = Number(value);
  return Number.isInteger(percent) && percent >= 1 && percent <= maxDiscountPercent
    ? percent
    : null;
}

// Картинка «Горящие окошки» для сторис мастера (документы/горящие-окошки.md).
// Только для вошедшего мастера и только его окошки. Стиль и цвет — из
// окна выбора в кабинете (?style=light|arch|ink|brand&palette=sage|…;
// brand — фирменный стиль мастера, если он применён), по
// умолчанию — цвет страницы записи мастера. ?discount=20 — стикер скидки на
// окошки. ?format=data — те же окошки JSON-ом для превью, вместе с уже
// включённой скидкой. ?member=<id> — админ студии рисует окошки выбранного
// мастера своей студии: имя, ссылка, тема и скидка — этого мастера.
export async function GET(request: Request) {
  const authProfile = await getCurrentAuthProfile();
  if (!authProfile) {
    return NextResponse.json({ error: "Нужно войти в кабинет." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const target = await resolveFreeWindowsStoryTarget({
    profile: authProfile.profile,
    source: authProfile.source,
    memberId: searchParams.get("member"),
  });

  if (target.status !== "ready") {
    return NextResponse.json(
      { error: "Свободных окошек на ближайшие дни нет." },
      { status: 404 },
    );
  }

  // Дальше «мастер» — тот, чьи окошки на картинке: сам вошедший или
  // выбранный админом сотрудник.
  const { profile } = target;
  const freeWindows = { days: target.days };

  const publicLink = formatPublicProfileLink(profile.username);

  // Данные для превью в окне выбора: шаблон собирается в браузере, и
  // переключение стиля и цвета не ждёт рендера PNG на сервере.
  if (searchParams.get("format") === "data") {
    return NextResponse.json(
      {
        days: freeWindows.days,
        masterName: profile.fullName,
        publicLink,
        hotWindowsDiscount: isHotWindowsDiscountActive(profile.hotWindowsDiscount)
          ? profile.hotWindowsDiscount
          : null,
        // Для «Моего стиля» в превью: тема та же, что на публичной странице,
        // логотип — по публичному адресу.
        brandTheme: profile.brandTheme,
        brandLogoUrl: resolveProfileMediaUrl(brandLogoPath(profile.brandTheme)),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const style = parseStoryStyle(searchParams.get("style"));
    // Без применённой темы «Мой стиль» рисуется светлым шаблоном.
    const brandAssets =
      style === "brand" && profile.brandTheme
        ? await loadServerStoryBrand(profile.brandTheme)
        : null;
    const png = await renderFreeWindowsStoryPng(
      {
        days: freeWindows.days,
        masterName: profile.fullName,
        publicLink,
        style,
        palette:
          parseStoryPalette(searchParams.get("palette")) ??
          defaultStoryPalette(profile.bookingThemePresetId),
        discountPercent: parseDiscountPercent(searchParams.get("discount")),
        brand: brandAssets?.brand ?? null,
      },
      {
        extraFonts: brandAssets?.fonts,
        fallbackFontNames: brandAssets?.fallbackFontNames,
      },
    );

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
