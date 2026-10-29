import { NextResponse } from "next/server";
import { z } from "zod";
import {
  BrandMaterialError,
  brandMaterialKinds,
  brandMaterialLimits,
  prepareBrandMaterial,
} from "@/lib/brand-theme/materials";
import { requireBrandThemeProfile } from "@/lib/brand-theme/route-auth";
import { countBrandMaterials, listBrandMaterials, saveBrandMaterial } from "@/lib/brand-theme/storage";
import { logError } from "@/lib/observability/logger";

// Материалы мастера по одному файлу (макеты 4.3–4.5): у каждого свой
// прогресс загрузки и своя ошибка, а не одна на всю пачку.

export async function GET() {
  const auth = await requireBrandThemeProfile({ requirePlan: false });
  if ("response" in auth) return auth.response;

  try {
    return NextResponse.json({ materials: await listBrandMaterials(auth.profile.id) });
  } catch (error) {
    logError("Failed to list brand materials", { profileId: auth.profile.id, error });
    return NextResponse.json({ error: "Не получилось загрузить список файлов." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireBrandThemeProfile();
  if ("response" in auth) return auth.response;
  const { profile } = auth;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const kind = z.enum(brandMaterialKinds).safeParse(form.get("kind"));
  const file = form.get("file");
  if (!kind.success || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Выберите файл." }, { status: 400 });
  }

  try {
    if ((await countBrandMaterials(profile.id, kind.data)) >= brandMaterialLimits[kind.data]) {
      return NextResponse.json(
        { error: `Можно загрузить не больше ${brandMaterialLimits[kind.data]}. Уберите лишнее.` },
        { status: 400 },
      );
    }

    const material = await prepareBrandMaterial(kind.data, file);
    return NextResponse.json({ material: await saveBrandMaterial(profile.id, material) });
  } catch (error) {
    if (error instanceof BrandMaterialError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logError("Failed to save brand material", { profileId: profile.id, error });
    return NextResponse.json({ error: "Не получилось загрузить файл. Попробуйте ещё раз." }, { status: 500 });
  }
}
