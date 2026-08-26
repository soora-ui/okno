import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { logError } from "@/lib/observability/logger";
import {
  createClientLinkInvite,
  getClientLinkedBooking,
} from "@/lib/telegram/client-link";

type RouteParams = {
  params: Promise<{ bookingId: string }>;
};

// Выдаёт клиенту ссылку на бота и сразу уводит в Telegram.
//
// Отдельный роут, а не ссылка прямо на t.me: токен одноразовый и живёт 15
// минут, поэтому выпускать его надо в момент нажатия. Если бы он выпускался
// при отрисовке страницы подтверждения, у клиента, вернувшегося к вкладке
// через полчаса, ссылка была бы мёртвой.
//
// Правом на выпуск считается знание bookingId — ровно как в
// /api/calendar/[bookingId] и на самой странице подтверждения, которая по
// этому же id показывает имя, услугу и время. Отдельной проверки здесь нет
// намеренно: она была бы строже, чем защита самих данных.
export async function GET(_request: Request, { params }: RouteParams) {
  const { bookingId } = await params;

  if (!bookingId) {
    return NextResponse.json({ error: "Не указана запись." }, { status: 400 });
  }

  const booking = await getClientLinkedBooking({ bookingId });

  if (!booking) {
    return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
  }

  // Напоминать не о чем: визит уже прошёл. Отменённую запись пропускаем —
  // о ней как раз имеет смысл получить сообщение, если мастер её вернёт.
  if (DateTime.fromISO(booking.startsAtIso) <= DateTime.utc()) {
    return NextResponse.json(
      { error: "Эта запись уже прошла." },
      { status: 410 },
    );
  }

  const invite = await createClientLinkInvite({ bookingId });

  if (!invite) {
    logError("Failed to issue client telegram invite", { bookingId });
    return NextResponse.json(
      { error: "Не получилось собрать ссылку на бота." },
      { status: 503 },
    );
  }

  return NextResponse.redirect(invite.url, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
