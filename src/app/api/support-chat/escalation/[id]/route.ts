import { NextResponse } from "next/server";
import { getCurrentAuthProfile } from "@/lib/data";
import { getSupportEscalationForProfile } from "@/lib/support-assistant/escalation";

// Статус вопроса, переданного живому оператору. Виджет ходит сюда, пока ждёт
// ответа, и ещё раз при открытии чата — обращение переживает перезагрузку
// страницы, поэтому ответ находит мастера, даже если тот успел уйти и
// вернуться.
//
// Обращение читается только под сессией его автора: id угадать нереально, но
// это не повод отдавать чужую переписку с поддержкой любому, кто его добудет.

type RouteParams = {
  params: Promise<{ id: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  if (!uuidPattern.test(id)) {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const authProfile = await getCurrentAuthProfile();

  if (authProfile?.source !== "supabase") {
    return NextResponse.json({ error: "Доступ запрещён." }, { status: 403 });
  }

  const escalation = await getSupportEscalationForProfile({
    id,
    profileId: authProfile.profile.id,
  });

  if (!escalation) {
    return NextResponse.json({ error: "Обращение не найдено." }, { status: 404 });
  }

  return NextResponse.json({
    status: escalation.status,
    reply: escalation.reply,
    // Метка времени нужна виджету, чтобы отличить новую реплику специалиста
    // от уже показанной: в коротком диалоге он пишет несколько раз.
    answeredAt: escalation.answeredAt,
    isOpen: escalation.isOpen,
  });
}
