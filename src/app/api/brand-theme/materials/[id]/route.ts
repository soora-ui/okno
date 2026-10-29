import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBrandThemeProfile } from "@/lib/brand-theme/route-auth";
import { deleteBrandMaterial } from "@/lib/brand-theme/storage";
import { logError } from "@/lib/observability/logger";

// «Убрать» на шагах загрузки и «Удалить» на экране управления (4.15).
// Удалить свой файл можно и без тарифа — это его данные.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBrandThemeProfile({ requirePlan: false });
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Файл не найден." }, { status: 404 });
  }

  try {
    const deleted = await deleteBrandMaterial(auth.profile.id, id);
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Файл не найден." }, { status: 404 });
  } catch (error) {
    logError("Failed to delete brand material", { profileId: auth.profile.id, error });
    return NextResponse.json({ error: "Не получилось удалить файл." }, { status: 500 });
  }
}
