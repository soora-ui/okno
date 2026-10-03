"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import {
  generateCertificateTemplateAction,
  previewCertificateTemplateAction,
  type CertificateTemplateActionState,
} from "@/app/actions/certificate-template";
import { maxCertificateTemplateRegenerations } from "@/lib/certificates/limits";
import type { CertificateTemplateSummary } from "@/lib/data";
import type { Profile } from "@/lib/mock-data";
import {
  acceptedLogoMimeTypes,
  buildProfileMediaStoragePath,
  imageCompressionMimeType,
  imageCompressionQuality,
  isAcceptedLogoMimeType,
  maxCertificateLogoImageDimension,
  maxCertificateLogoSvgFileSizeBytes,
  maxCertificateLogoUploadFileSizeBytes,
  profileMediaBucket,
  resolveProfileMediaUrl,
} from "@/lib/profile-media";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FormMessage, SubmitButton } from "@/components/forms/auth-form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DemoCertificatePreview,
  type DemoCertificateDesign,
} from "@/components/certificates/demo-certificate-preview";
import { DEMO_SUBMIT_EVENT, useDemoMode } from "@/components/tour/demo-mode";

// Модалка дизайна сертификата (okno-tz-certificates.md 3.1 + окно
// okno-tz-certificates-ui-flow.md, п.4). Открывается и кнопкой "Давай
// создадим"/"Изменить дизайн" в CertificateSection, и кликом по
// задизейбленному тумблеру продажи (CertificateSalesToggle) — тот же
// компонент в обоих случаях, просто во втором предзаполнен существующими
// данными. Закрытие крестиком без генерации не создаёт template_id —
// сохранение происходит только внутри generateCertificateTemplateAction.

const initialState: CertificateTemplateActionState = { success: false, message: "" };
const logoAccept = acceptedLogoMimeTypes.join(",");

function formatFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

// SVG нельзя безопасно прогнать через canvas-компрессию без потери
// векторности — грузим как есть с более жёстким лимитом сырого размера.
async function prepareLogoFile(file: File): Promise<File> {
  if (file.type === "image/svg+xml") {
    return file;
  }

  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxCertificateLogoImageDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvasToBlob(canvas, imageCompressionMimeType, imageCompressionQuality);
  if (!blob) {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "logo";
  const compressed = new File([blob], `${baseName}.webp`, {
    type: imageCompressionMimeType,
    lastModified: Date.now(),
  });

  return compressed.size > maxCertificateLogoUploadFileSizeBytes && compressed.size > file.size
    ? file
    : compressed;
}

export function CertificateDesignModal({
  isOpen,
  onClose,
  profile,
  certificateTemplate,
  onDemoGenerated,
}: {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  certificateTemplate: CertificateTemplateSummary | null;
  /** Демо-кабинет: «сгенерированный» дизайн уходит в раздел вместо сервера. */
  onDemoGenerated?: (design: DemoCertificateDesign) => void;
}) {
  const router = useRouter();
  const demo = useDemoMode();
  const generateFormRef = useRef<HTMLFormElement>(null);
  // Демо: генерация — это пауза и превью, нарисованное на странице. Claude и
  // сервер в демо-кабинете не участвуют (proxy их туда и не пустит).
  const [demoPhase, setDemoPhase] = useState<"idle" | "generating" | "done">("idle");
  const [demoDesign, setDemoDesign] = useState<DemoCertificateDesign | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [generateState, generateAction] = useActionState(
    generateCertificateTemplateAction,
    initialState,
  );
  const [previewState, previewAction] = useActionState(
    previewCertificateTemplateAction,
    initialState,
  );

  const [logoPath, setLogoPath] = useState(certificateTemplate?.logoPath ?? "");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(
    resolveProfileMediaUrl(certificateTemplate?.logoPath ?? null),
  );
  const [logoUploadMessage, setLogoUploadMessage] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(certificateTemplate?.primaryColor ?? "#1c1917");
  const [secondaryColor, setSecondaryColor] = useState(
    certificateTemplate?.secondaryColor ?? "#f5f5f4",
  );
  const [testAmount, setTestAmount] = useState("1000");

  // После успешной (пере)генерации подтягиваем свежий certificateTemplate
  // с сервера (revalidatePath внутри экшена помечает путь устаревшим, а
  // router.refresh() запрашивает актуальные серверные пропсы прямо сейчас
  // — так же, как уже сделано для аватара/портфолио в
  // profile-media-upload-section.tsx) — от этого зависит разблокировка
  // тумблера продажи.
  useEffect(() => {
    if (generateState.success) {
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- нужен только momент успеха, не сам router
  }, [generateState.success]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const regenerationCount =
    generateState.regenerationCount ??
    previewState.regenerationCount ??
    certificateTemplate?.regenerationCount ??
    0;
  const hasTemplate =
    Boolean(certificateTemplate) || generateState.success || demoPhase === "done";
  const attemptsLeft = Math.max(0, maxCertificateTemplateRegenerations - regenerationCount);
  const isLimitReached = hasTemplate && attemptsLeft === 0;

  const previewSrc = generateState.previewPngBase64
    ? `data:image/png;base64,${generateState.previewPngBase64}`
    : previewState.previewPngBase64
      ? `data:image/png;base64,${previewState.previewPngBase64}`
      : null;

  const handleLogoChange = async (file: File | null) => {
    if (!file) return;

    if (!isAcceptedLogoMimeType(file.type)) {
      setLogoUploadMessage("Логотип должен быть в формате JPG, PNG, WebP или SVG.");
      return;
    }

    const rawSizeLimit =
      file.type === "image/svg+xml" ? maxCertificateLogoSvgFileSizeBytes : maxCertificateLogoUploadFileSizeBytes * 4;
    if (file.size > rawSizeLimit) {
      setLogoUploadMessage(`Файл слишком большой. Выбери до ${formatFileSize(rawSizeLimit)}.`);
      return;
    }

    setLogoUploading(true);
    setLogoUploadMessage("");

    try {
      const uploadFile = await prepareLogoFile(file);
      const supabase = createSupabaseBrowserClient();
      const path = buildProfileMediaStoragePath({
        ownerId: profile.passwordAuthId,
        kind: "certificate-logo",
        file: uploadFile,
      });

      const { error } = await supabase.storage
        .from(profileMediaBucket)
        .upload(path, uploadFile, { cacheControl: "31536000", contentType: uploadFile.type, upsert: false });

      if (error) {
        throw new Error(error.message || "Не получилось загрузить логотип.");
      }

      setLogoPath(path);
      setLogoPreviewUrl(resolveProfileMediaUrl(path));
    } catch (error) {
      setLogoUploadMessage(error instanceof Error ? error.message : "Не получилось загрузить логотип.");
    } finally {
      setLogoUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  useEffect(() => {
    const form = generateFormRef.current;
    if (!demo || !isOpen || !form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onDemoSubmit = () => {
      const data = new FormData(form);
      const design: DemoCertificateDesign = {
        primaryColor: String(data.get("primaryColor") ?? primaryColor),
        secondaryColor: String(data.get("secondaryColor") ?? secondaryColor),
        studioName: String(data.get("studioName") ?? ""),
        tagline: String(data.get("tagline") ?? ""),
      };
      setDemoPhase("generating");
      timer = setTimeout(() => {
        setDemoDesign(design);
        setDemoPhase("done");
        onDemoGenerated?.(design);
      }, 2600);
    };
    form.addEventListener(DEMO_SUBMIT_EVENT, onDemoSubmit);
    return () => {
      form.removeEventListener(DEMO_SUBMIT_EVENT, onDemoSubmit);
      if (timer) clearTimeout(timer);
    };
  }, [demo, isOpen, primaryColor, secondaryColor, onDemoGenerated]);

  const overlayTransition = { duration: shouldReduceMotion ? 0 : 0.2 };
  const panelTransition = {
    duration: shouldReduceMotion ? 0 : 0.35,
    ease: [0.22, 1, 0.36, 1] as const,
  };

  // Без AnimatePresence/exit — закрытие не должно зависеть от того,
  // доиграет ли анимация выхода до конца (если rAF в фоновой/неактивной
  // вкладке придержан, exit-колбэк может не выстрелить вообще, и модалка
  // застрянет в DOM несмотря на isOpen=false). Вход анимируем через
  // initial/animate на свежем маунте — этого достаточно для мягкого
  // появления, а закрытие всегда мгновенное и надёжное.
  if (!isOpen) {
    return null;
  }

  return (
    <motion.div
      key="certificate-design-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center px-3 py-5 sm:px-6 sm:py-8"
      style={{ backgroundColor: "rgba(25,26,23,0.3)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={overlayTransition}
      onClick={onClose}
    >
      <motion.div
        key="certificate-design-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Дизайн сертификата"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-section border border-line shadow-ink"
        style={{ backgroundColor: "var(--ui-card-bg)" }}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={panelTransition}
        onClick={(event) => event.stopPropagation()}
      >
            <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">Дизайн сертификата</h2>
                {isLimitReached ? (
                  <p className="text-sm text-ink-soft">
                    Лимит перегенераций исчерпан. Для нового дизайна обратитесь в поддержку.
                  </p>
                ) : (
                  <p className="text-sm text-ink-soft">
                    Осталось попыток: {attemptsLeft} / {maxCertificateTemplateRegenerations}
                  </p>
                )}
              </div>
              <Button variant="secondary" onClick={onClose} className="px-3">
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-5">
              <p className="text-sm leading-6 text-ink-soft">
                Загрузи логотип и выбери цвета — Claude сгенерирует визуальный шаблон сертификата
                формата A5.
              </p>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <form
                  ref={generateFormRef}
                  action={generateAction}
                  data-demo-silent={demo || undefined}
                  className="space-y-4"
                >
                  <input type="hidden" name="logoPath" value={logoPath} />

                  <div className="space-y-2">
                    <span className="text-sm font-medium text-ink">Логотип</span>
                    <div className="flex items-center gap-3">
                      {logoPreviewUrl ? (
                        <Image
                          src={logoPreviewUrl}
                          alt="Логотип"
                          width={64}
                          height={64}
                          className="h-16 w-16 rounded-tight border border-line object-contain bg-surface"
                          unoptimized={logoPreviewUrl.endsWith(".svg")}
                        />
                      ) : null}
                      <input
                        ref={inputRef}
                        type="file"
                        accept={logoAccept}
                        className="sr-only"
                        onChange={(event) => {
                          void handleLogoChange(event.currentTarget.files?.[0] ?? null);
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => inputRef.current?.click()}
                        disabled={logoUploading}
                      >
                        {logoUploading ? "Загружаю..." : logoPreviewUrl ? "Заменить логотип" : "Загрузить логотип"}
                      </Button>
                    </div>
                    {logoUploadMessage ? <FormMessage message={logoUploadMessage} success={false} /> : null}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="font-medium text-ink">Основной цвет</span>
                      <input
                        type="color"
                        name="primaryColor"
                        value={primaryColor}
                        onChange={(event) => setPrimaryColor(event.target.value)}
                        className="h-12 w-full rounded-field border border-line"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="font-medium text-ink">Дополнительный цвет</span>
                      <input
                        type="color"
                        name="secondaryColor"
                        value={secondaryColor}
                        onChange={(event) => setSecondaryColor(event.target.value)}
                        className="h-12 w-full rounded-field border border-line"
                      />
                    </label>
                  </div>

                  <Input
                    label="Название студии (необязательно)"
                    name="studioName"
                    defaultValue={certificateTemplate?.studioName ?? ""}
                    maxLength={80}
                  />
                  <Input
                    label="Слоган (необязательно)"
                    name="tagline"
                    defaultValue={certificateTemplate?.tagline ?? ""}
                    maxLength={160}
                  />
                  <Input
                    label="Контакты (необязательно)"
                    name="contacts"
                    defaultValue={certificateTemplate?.contacts ?? ""}
                    maxLength={160}
                  />

                  <FormMessage message={generateState.message} success={generateState.success} />

                  <SubmitButton
                    idleLabel={hasTemplate ? "Перегенерировать" : "Сгенерировать"}
                    pendingLabel="Генерирую..."
                    disabled={isLimitReached}
                    className="w-full justify-center"
                  />
                </form>

                <div className="space-y-3">
                  <div className="flex aspect-[35/24] items-center justify-center overflow-hidden rounded-panel border border-dashed border-line bg-surface">
                    {demoPhase === "generating" ? (
                      <p className="flex items-center gap-2 px-4 text-center text-xs text-muted">
                        <Loader2 size={14} className="animate-spin" />
                        Генерирую дизайн…
                      </p>
                    ) : demoDesign ? (
                      <DemoCertificatePreview
                        design={demoDesign}
                        masterName={profile.fullName}
                        amount={Number(testAmount) || undefined}
                        className="text-[15px]"
                      />
                    ) : previewSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data: base64 предпросмотр, next/image его не оптимизирует
                      <img src={previewSrc} alt="Превью сертификата" className="h-full w-full object-contain" />
                    ) : (
                      <p className="px-4 text-center text-xs text-muted">
                        Превью появится после генерации шаблона
                      </p>
                    )}
                  </div>

                  {hasTemplate ? (
                    <form
                      action={previewAction}
                      data-demo-silent={demo || undefined}
                      className="flex items-end gap-2"
                    >
                      <Input
                        label="Тестовая сумма, руб."
                        name="testAmount"
                        type="number"
                        min={1}
                        value={testAmount}
                        onChange={(event) => setTestAmount(event.target.value)}
                        className="min-h-10"
                      />
                      <SubmitButton idleLabel="Обновить превью" pendingLabel="Рендерю..." />
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
      </motion.div>
    </motion.div>
  );
}
