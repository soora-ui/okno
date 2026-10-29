import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeBrandMaterials, BrandAnalysisError } from "@/lib/brand-theme/analysis";
import { maxTotalBytes, totalMaterialBytes } from "@/lib/brand-theme/materials";
import { requireBrandThemeProfile } from "@/lib/brand-theme/route-auth";
import { loadBrandMaterials, setBrandMaterialModeration } from "@/lib/brand-theme/storage";
import { logError } from "@/lib/observability/logger";

// «Что мы нашли» (4.3): цвета, шрифты и модерация загруженных файлов.

export const maxDuration = 90;

const bodySchema = z.object({ materialIds: z.array(z.string().uuid()).min(1).max(20) });

export async function POST(request: Request) {
  const auth = await requireBrandThemeProfile({ needsClaude: true });
  if ("response" in auth) return auth.response;
  const { profile } = auth;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  try {
    const materials = await loadBrandMaterials(profile.id, body.data.materialIds);
    if (materials.length === 0) {
      return NextResponse.json({ error: "Файлы не найдены." }, { status: 404 });
    }
    if (totalMaterialBytes(materials) > maxTotalBytes) {
      return NextResponse.json(
        { error: "Материалов слишком много за раз: оставьте самые важные." },
        { status: 400 },
      );
    }

    const analysis = await analyzeBrandMaterials(materials);
    const verdicts = materials.map((material, index) => {
      const verdict = analysis.verdicts.find((item) => item.index === index);
      return {
        id: material.id,
        moderation: verdict?.verdict === "rejected" ? ("rejected" as const) : ("ok" as const),
        reason: verdict?.verdict === "rejected" ? verdict.reason : "",
      };
    });
    await setBrandMaterialModeration(profile.id, verdicts);

    return NextResponse.json({
      readable: analysis.readable,
      foundColors: analysis.foundColors,
      fonts: analysis.fonts,
      materials: verdicts,
    });
  } catch (error) {
    if (error instanceof BrandAnalysisError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    logError("Brand materials analysis failed", { profileId: profile.id, error });
    return NextResponse.json(
      { error: "Не получилось разобрать файлы. Попробуйте ещё раз." },
      { status: 502 },
    );
  }
}
