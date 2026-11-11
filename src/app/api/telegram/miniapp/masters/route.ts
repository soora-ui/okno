import { NextResponse } from "next/server";
import {
  getCatalogMasters,
  listCatalogCities,
  searchCatalog,
} from "@/lib/telegram/miniapp-catalog";
import { validateMiniAppInitData } from "@/lib/telegram/miniapp-auth";

// Поиск мастеров для вкладки «Поиск».
//
// Данные здесь публичные — то же самое видно на страницах мастеров. Подпись
// всё равно проверяем: каталог одним запросом отдаёт всех мастеров города, и
// раздавать такую выгрузку кому угодно без Telegram-аккаунта незачем.

const maxQueryLength = 80;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    initData?: string;
    city?: string;
    query?: string;
  } | null;
  const result = validateMiniAppInitData(String(body?.initData ?? ""));

  if (result.status === "unconfigured") {
    return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  if (result.status !== "ok") {
    return NextResponse.json(
      { ok: false, reason: result.status === "expired" ? "expired" : "invalid" },
      { status: 401 },
    );
  }

  const masters = await getCatalogMasters();
  const found = searchCatalog(masters, {
    city: String(body?.city ?? "").slice(0, maxQueryLength),
    query: String(body?.query ?? "").slice(0, maxQueryLength),
  });

  return NextResponse.json(
    {
      ok: true,
      cities: listCatalogCities(masters),
      // Названия всех услуг нужны только серверному поиску — клиенту хватает
      // трёх для карточки.
      masters: found.map((master) => ({
        profileId: master.profileId,
        username: master.username,
        name: master.name,
        specialty: master.specialty,
        city: master.city,
        address: master.address,
        avatarUrl: master.avatarUrl,
        url: master.url,
        priceFrom: master.priceFrom,
        topServices: master.topServices,
        rating: master.rating,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
