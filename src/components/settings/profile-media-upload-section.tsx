"use client";

import Image from "next/image";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateAvatarAction, updatePortfolioWorksAction } from "@/app/actions/settings";
import { FormMessage } from "@/components/forms/auth-form-state";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/mock-data";
import {
  acceptedImageMimeTypes,
  buildProfileMediaStoragePath,
  imageCompressionMimeType,
  imageCompressionQuality,
  maxAvatarFileSizeBytes,
  maxAvatarImageDimension,
  maxAvatarUploadFileSizeBytes,
  maxPortfolioFileSizeBytes,
  maxPortfolioImageDimension,
  maxPortfolioUploadFileSizeBytes,
  maxPortfolioWorks,
  profileMediaBucket,
} from "@/lib/profile-media";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const initialState = {
  success: false,
  message: "",
};

const imageAccept = acceptedImageMimeTypes.join(",");

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function compressImageFile(input: {
  file: File;
  maxDimension: number;
  maxUploadSizeBytes: number;
}) {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return input.file;
  }

  const bitmap = await createImageBitmap(input.file);
  const scale = Math.min(
    1,
    input.maxDimension / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return input.file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvasToBlob(
    canvas,
    imageCompressionMimeType,
    imageCompressionQuality,
  );

  if (!blob) {
    return input.file;
  }

  const baseName = input.file.name.replace(/\.[^.]+$/, "") || "image";
  const compressedFile = new File([blob], `${baseName}.webp`, {
    type: imageCompressionMimeType,
    lastModified: Date.now(),
  });

  if (
    compressedFile.size > input.maxUploadSizeBytes &&
    compressedFile.size > input.file.size
  ) {
    return input.file;
  }

  return compressedFile;
}

async function removeUploadedPaths(paths: string[]) {
  if (paths.length === 0) {
    return;
  }

  const supabase = createSupabaseBrowserClient();
  await supabase.storage.from(profileMediaBucket).remove(paths);
}

async function uploadFileToStorage(input: {
  profile: Profile;
  file: File;
  kind: "avatar" | "portfolio";
}) {
  const supabase = createSupabaseBrowserClient();
  const path = buildProfileMediaStoragePath({
    ownerId: input.profile.passwordAuthId,
    kind: input.kind,
    file: input.file,
  });

  const { error } = await supabase.storage
    .from(profileMediaBucket)
    .upload(path, input.file, {
      cacheControl: "31536000",
      contentType: input.file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message || "Не получилось загрузить файл в Storage.");
  }

  return path;
}

export function AvatarUploadSection({ profile }: { profile: Profile }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);

  const handleAvatarChange = async (file: File | null) => {
    if (!file) {
      return;
    }

    if (!acceptedImageMimeTypes.includes(file.type as (typeof acceptedImageMimeTypes)[number])) {
      setState({
        success: false,
        message: "Аватар должен быть в формате JPG, PNG, WebP или AVIF.",
      });
      return;
    }

      if (file.size > maxAvatarFileSizeBytes) {
        setState({
          success: false,
          message: `Аватар слишком большой. Выбери файл до ${formatFileSize(maxAvatarFileSizeBytes)}.`,
      });
      return;
    }

    setPending(true);
    setState(initialState);

    let uploadedPath: string | null = null;

    try {
      const uploadFile = await compressImageFile({
        file,
        maxDimension: maxAvatarImageDimension,
        maxUploadSizeBytes: maxAvatarUploadFileSizeBytes,
      });

      if (uploadFile.size > maxAvatarUploadFileSizeBytes) {
        setState({
          success: false,
          message: `Аватар после сжатия больше ${formatFileSize(maxAvatarUploadFileSizeBytes)}. Выбери изображение поменьше.`,
        });
        return;
      }

      uploadedPath = await uploadFileToStorage({
        profile,
        file: uploadFile,
        kind: "avatar",
      });

      const result = await updateAvatarAction({ path: uploadedPath });
      setState(result);

      if (result.success) {
        router.refresh();
      } else {
        await removeUploadedPaths([uploadedPath]);
      }
    } catch (error) {
      if (uploadedPath) {
        await removeUploadedPaths([uploadedPath]);
      }

      setState({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Не получилось загрузить аватар.",
      });
    } finally {
      setPending(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  // Строка «круглое фото + кнопка», как в шапке страницы записи. Обёртка
  // скруглена, чтобы тур по базе знаний находил блок «Аватар» как карточку.
  return (
    <div className="space-y-3 rounded-nested">
      <div className="flex flex-wrap items-center gap-5">
        <Image
          src={profile.avatarUrl}
          alt={profile.fullName}
          width={176}
          height={176}
          sizes="88px"
          className="size-[88px] shrink-0 rounded-full border border-line bg-panel object-cover"
        />
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={imageAccept}
            className="sr-only"
            onChange={(event) => {
              void handleAvatarChange(event.currentTarget.files?.[0] ?? null);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="gap-2 self-start"
          >
            <Upload size={16} aria-hidden="true" />
            {pending ? "Сжимаю и загружаю..." : "Загрузить фото"}
          </Button>
          <span className="text-xs leading-5 text-muted">
            Аватар — лучше квадратное фото, лицо по центру. JPG, PNG, WebP или AVIF,
            до {formatFileSize(maxAvatarFileSizeBytes)}.
          </span>
        </div>
      </div>
      <FormMessage message={state.message} success={state.success} />
    </div>
  );
}

export function PortfolioWorksSection({ profile }: { profile: Profile }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);

  const handlePortfolioChange = async (files: FileList | null) => {
    const selectedFiles = files ? Array.from(files) : [];

    if (selectedFiles.length === 0) {
      return;
    }

    if (selectedFiles.length > maxPortfolioWorks) {
      setState({
        success: false,
        message: `Можно загрузить не больше ${maxPortfolioWorks} готовых работ за раз.`,
      });
      return;
    }

    for (const file of selectedFiles) {
      if (!acceptedImageMimeTypes.includes(file.type as (typeof acceptedImageMimeTypes)[number])) {
        setState({
          success: false,
          message: "Готовые работы должны быть в формате JPG, PNG, WebP или AVIF.",
        });
        return;
      }

      if (file.size > maxPortfolioFileSizeBytes) {
        setState({
          success: false,
          message: `Одна из работ слишком большая. Выбирай изображения до ${formatFileSize(maxPortfolioFileSizeBytes)} каждое.`,
        });
        return;
      }
    }

    setPending(true);
    setState(initialState);

    const uploadedPaths: string[] = [];

    try {
      for (const file of selectedFiles) {
        const uploadFile = await compressImageFile({
          file,
          maxDimension: maxPortfolioImageDimension,
          maxUploadSizeBytes: maxPortfolioUploadFileSizeBytes,
        });

        if (uploadFile.size > maxPortfolioUploadFileSizeBytes) {
          throw new Error(
            `Одна из работ после сжатия больше ${formatFileSize(maxPortfolioUploadFileSizeBytes)}. Выбери изображение поменьше.`,
          );
        }

        const path = await uploadFileToStorage({
          profile,
          file: uploadFile,
          kind: "portfolio",
        });
        uploadedPaths.push(path);
      }

      const result = await updatePortfolioWorksAction({ paths: uploadedPaths });
      setState(result);

      if (result.success) {
        router.refresh();
      } else {
        await removeUploadedPaths(uploadedPaths);
      }
    } catch (error) {
      await removeUploadedPaths(uploadedPaths);
      setState({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Не получилось загрузить готовые работы.",
      });
    } finally {
      setPending(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={imageAccept}
          className="sr-only"
          onChange={(event) => {
            void handlePortfolioChange(event.currentTarget.files);
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
          >
            {pending
              ? "Сжимаю и загружаю..."
              : profile.portfolioWorks.length > 0
                ? "Обновить готовые работы"
                : "Добавить готовые работы"}
          </Button>
          <p className="text-xs leading-5 text-muted">
            Можно выбрать до {maxPortfolioWorks} файлов сразу. Перед загрузкой
            изображения автоматически сжимаются и заменяют текущую подборку.
          </p>
        </div>

        <FormMessage message={state.message} success={state.success} />
      </div>

      {profile.portfolioWorks.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {profile.portfolioWorks.map((work, index) => (
            <div
              key={work.id}
              className="overflow-hidden rounded-panel border border-line bg-surface"
            >
              <div className="relative aspect-[4/5]">
                <Image
                  src={work.imageUrl}
                  alt={`${profile.fullName}, работа ${index + 1}`}
                  fill
                  sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 25vw"
                  loading="lazy"
                  className="object-cover"
                />
              </div>
              <div className="px-3 py-3 text-xs text-muted">Работа {index + 1}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-panel border border-dashed border-line bg-surface px-4 py-5 text-sm leading-6 text-muted">
          Пока без прикреплённых работ. Как только загрузишь подборку, она
          появится на публичной странице отдельной галереей.
        </div>
      )}
    </div>
  );
}
