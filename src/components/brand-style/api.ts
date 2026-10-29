"use client";

import type { BrandFontFinding } from "@/lib/brand-theme/analysis";
import type { BrandThemeVersion } from "@/lib/brand-theme/drafts";
import type { BrandMaterialKind } from "@/lib/brand-theme/materials";
import type { BrandRefineChip, BrandRefineTarget } from "@/lib/brand-theme/refine-options";
import type { StoredBrandMaterial } from "@/lib/brand-theme/storage";

// Клиент к /api/brand-theme/*. Ошибки сервера уже по-русски и для мастера —
// их показываем как есть.

export class BrandApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly generationId?: string,
  ) {
    super(message);
  }
}

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new BrandApiError(
      typeof body.error === "string" ? body.error : "Что-то пошло не так. Попробуйте ещё раз.",
      response.status,
      typeof body.code === "string" ? body.code : undefined,
      typeof body.generationId === "string" ? body.generationId : undefined,
    );
  }
  return body as T;
}

const maxPhotoSide = 2000;
const photoTargetBytes = 3_000_000;

/**
 * Фото с телефона весят 5–10 МБ, а в Claude картинка уходит до ~3,5 МБ.
 * Ужимаем на клиенте: длинная сторона до 2000 px, JPEG. Логотип и PDF не
 * трогаем — у логотипа нужна прозрачность.
 */
async function shrinkPhoto(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size <= photoTargetBytes) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxPhotoSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function uploadMaterial(
  kind: BrandMaterialKind,
  original: File,
  onProgress: (percent: number) => void,
): Promise<StoredBrandMaterial> {
  return (kind === "logo" || kind === "brandbook" ? Promise.resolve(original) : shrinkPhoto(original)).then(
    (file) =>
      new Promise((resolve, reject) => {
        const form = new FormData();
        form.append("kind", kind);
        form.append("file", file);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/brand-theme/materials");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
        };
        xhr.onload = () => {
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(xhr.responseText) as Record<string, unknown>;
          } catch {
            // ниже — общая ошибка
          }
          if (xhr.status >= 200 && xhr.status < 300 && body.material) {
            resolve(body.material as StoredBrandMaterial);
          } else {
            reject(
              new BrandApiError(
                typeof body.error === "string" ? body.error : "Не получилось загрузить файл.",
                xhr.status,
              ),
            );
          }
        };
        xhr.onerror = () => reject(new BrandApiError("Нет соединения. Попробуйте ещё раз.", 0, "network"));
        xhr.send(form);
      }),
  );
}

export async function deleteMaterial(id: string) {
  await json(await fetch(`/api/brand-theme/materials/${id}`, { method: "DELETE" }));
}

export type AnalysisResult = {
  readable: boolean;
  foundColors: string[];
  fonts: BrandFontFinding[];
  materials: { id: string; moderation: "ok" | "rejected"; reason: string }[];
};

export async function analyzeMaterials(materialIds: string[]) {
  return json<AnalysisResult>(
    await fetch("/api/brand-theme/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ materialIds }),
    }),
  );
}

export type GenerateInput = {
  materialIds: string[];
  logoMaterialId: string | null;
  logoDarkMaterialId: string | null;
  hexColors: string[];
  colorWords: string;
  moods: string[];
  wishes: string;
  regenerationComment?: string;
  preferredFonts: { heading: string | null; body: string | null };
};

export type GenerateResult = {
  generationId: string;
  generationsLeft: number;
  variants: BrandThemeVersion[];
};

/**
 * Генерация с восстановлением после обрыва связи (4.16): если ответ
 * потерялся, а генерация на сервере уже началась, ждём сеть и спрашиваем
 * её статус, пока она не закончится.
 */
export async function generateVariants(
  input: GenerateInput,
  hooks: { onOffline: () => void; onOnline: () => void; signal: AbortSignal },
): Promise<GenerateResult> {
  const startedAt = new Date().toISOString();
  try {
    return await json<GenerateResult>(
      await fetch("/api/brand-theme/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: hooks.signal,
      }),
    );
  } catch (error) {
    if (hooks.signal.aborted) {
      // Сервер продолжает работать и без нас — просим его не засчитывать.
      void fetch(`/api/brand-theme/generations/latest?since=${encodeURIComponent(startedAt)}`, {
        method: "DELETE",
        keepalive: true,
      });
      throw error;
    }
    if (error instanceof BrandApiError) throw error;
    // Ответ не дошёл: сеть пропала. Ищем генерацию, начатую в этот момент.
    hooks.onOffline();
    await waitForOnline(hooks.signal);
    hooks.onOnline();
    return resumeLatestGeneration(startedAt, hooks.signal);
  }
}

function waitForOnline(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (navigator.onLine) {
      resolve();
      return;
    }
    const done = () => {
      window.removeEventListener("online", done);
      resolve();
    };
    window.addEventListener("online", done);
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
}

async function resumeLatestGeneration(since: string, signal: AbortSignal): Promise<GenerateResult> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const latest = await json<{ generation: { id: string; status: string; error: string | null } | null }>(
      await fetch(`/api/brand-theme/generations/latest?since=${encodeURIComponent(since)}`, { signal }),
    );
    if (!latest.generation) {
      throw new BrandApiError("Генерация не началась. Попробуйте ещё раз — она не списана.", 0);
    }
    const status = await generationStatus(latest.generation.id, signal);
    if (status.status === "done") {
      return { generationId: latest.generation.id, generationsLeft: status.generationsLeft, variants: status.variants };
    }
    if (status.status === "failed") {
      throw new BrandApiError(status.error ?? "Что-то пошло не так. Генерация не списана.", 502);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new BrandApiError("Генерация идёт слишком долго. Загляните чуть позже.", 504);
}

export async function generationStatus(id: string, signal?: AbortSignal) {
  return json<{
    status: "pending" | "done" | "failed";
    error: string | null;
    generationsLeft: number;
    variants: BrandThemeVersion[];
  }>(await fetch(`/api/brand-theme/generations/${id}`, { signal }));
}

export async function refineVariant(input: {
  themeId: string;
  chips: BrandRefineChip[];
  comment: string;
  target: BrandRefineTarget | null;
}) {
  return json<{ variant: BrandThemeVersion }>(
    await fetch("/api/brand-theme/refine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}
