"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Info, Plus, TriangleAlert, X } from "lucide-react";
import type { UploadItem, WizardData } from "@/components/brand-style/state";
import { Badge, CardTitle, DropZone, FileRow, StepTitle, WizardCard, formatBytes } from "@/components/brand-style/ui";
import { NextButton, WizardBody, WizardFoot } from "@/components/brand-style/wizard";
import { Button } from "@/components/ui/button";
import type { BrandMaterialKind } from "@/lib/brand-theme/materials";
import { cn } from "@/lib/utils";

// 4.5 «Покажите свой логотип и примеры».

type LogoTone = "dark" | "light" | "mid" | null;

/**
 * Насколько тёмный логотип: средняя яркость непрозрачных пикселей. Тёмный
 * теряется на тёмном фоне, светлый — на светлом. Считается в браузере по
 * локальному превью, на сервер ничего не уходит.
 */
function useLogoTone(url: string | undefined): LogoTone {
  const [tone, setTone] = useState<LogoTone>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, size, size);
      const { data } = context.getImageData(0, 0, size, size);
      let sum = 0;
      let count = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] < 40) continue;
        sum += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
        count += 1;
      }
      if (cancelled || count === 0) return;
      const average = sum / count;
      setTone(average < 0.3 ? "dark" : average > 0.8 ? "light" : "mid");
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return tone;
}

export function LogoStep({
  data,
  update,
  addFiles,
  removeUpload,
  onBack,
  onNext,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  addFiles: (kind: BrandMaterialKind, files: File[]) => Promise<(unknown | null)[]>;
  removeUpload: (key: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const logos = data.uploads.filter((item) => item.kind === "logo");
  const logo = logos.find((item) => item.material?.id === data.logoId) ?? logos[0];
  const darkLogo = logos.find((item) => item.material?.id === data.logoDarkId);
  const examples = data.uploads.filter((item) => item.kind === "example");
  const tone = useLogoTone(logo?.previewUrl);
  const [keepAsIs, setKeepAsIs] = useState(false);

  // Первый загруженный логотип — основной, если мастер не выбрал иного.
  useEffect(() => {
    if (!data.logoId && logo?.material && logo.state.status === "uploaded") {
      update({ logoId: logo.material.id });
    }
  }, [data.logoId, logo, update]);

  const uploadLogo = async (files: File[], dark = false) => {
    const [material] = (await addFiles("logo", files.slice(0, 1))) as ({ id: string } | null)[];
    if (material) update(dark ? { logoDarkId: material.id } : { logoId: material.id });
  };

  const uploading = data.uploads.some(
    (item) => (item.kind === "logo" || item.kind === "example") && item.state.status === "uploading",
  );
  const lostOnDark = tone === "dark" && !darkLogo;
  const lostOnLight = tone === "light";

  return (
    <>
      <WizardBody>
        <StepTitle
          eyebrow="Логотип и примеры"
          title="Покажите свой логотип и примеры"
          sub="Логотип поставим в шапку страницы. Примеры помогут понять, как выглядит ваш бренд в других местах."
        />

        <WizardCard>
          <CardTitle title="Логотип" sub="SVG или PNG с прозрачным фоном" />
          {logo ? (
            <>
              <FileRow
                name={logo.name}
                size={formatBytes(logo.size)}
                isPdf={false}
                state={
                  logo.state.status === "uploaded"
                    ? { status: "uploaded", note: tone === "mid" || tone === null ? "Загружен" : "Прозрачный фон" }
                    : logo.state
                }
                onRemove={() => removeUpload(logo.key)}
              />
              {logo.previewUrl ? (
                <div className="grid grid-cols-2 gap-2.5">
                  {(["light", "dark"] as const).map((bg) => {
                    const src = bg === "dark" && darkLogo?.previewUrl ? darkLogo.previewUrl : logo.previewUrl;
                    const lost = bg === "dark" ? lostOnDark : lostOnLight;
                    return (
                      <figure key={bg} className="flex flex-col gap-1.5">
                        <div
                          className="flex h-24 items-center justify-center rounded-panel border border-line px-4"
                          style={{ backgroundColor: bg === "dark" ? "#15140f" : "#faf7f1" }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- локальное превью загруженного файла */}
                          <img src={src} alt="" className="max-h-14 max-w-full object-contain" />
                        </div>
                        <figcaption className={cn("text-xs", lost ? "text-warning" : "text-muted")}>
                          {bg === "dark" ? "На тёмном фоне" : "На светлом фоне"} · {lost ? "теряется" : "читается"}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              ) : null}
              {lostOnDark && !keepAsIs ? (
                <div
                  className="flex flex-col gap-3 rounded-panel border p-4"
                  style={{ backgroundColor: "var(--color-warning-soft)", borderColor: "var(--color-warning)" }}
                >
                  <p className="flex items-start gap-3 text-[13px] text-ink">
                    <TriangleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-warning" />
                    Логотип почти не виден на тёмном фоне. Если страница откроется в тёмной теме, шапка будет выглядеть бледно.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink">
                      Загрузить светлую версию
                      <input
                        type="file"
                        accept="image/png,image/svg+xml"
                        className="sr-only"
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          event.target.value = "";
                          if (files.length > 0) void uploadLogo(files, true);
                        }}
                      />
                    </label>
                    <Button variant="ghost" onClick={() => setKeepAsIs(true)}>
                      Оставить как есть
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <DropZone
              compact
              multiple={false}
              accept="image/png,image/svg+xml"
              onFiles={(files) => void uploadLogo(files)}
              title="Загрузите логотип"
              hint="SVG или PNG с прозрачным фоном"
            />
          )}
        </WizardCard>

        <WizardCard>
          <CardTitle
            title="Примеры оформления"
            sub="Скриншоты канала, бота, Instagram, фото вывески, визиток, прайса"
            aside={<Badge>{examples.length} из 10</Badge>}
          />
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
            {examples.map((item: UploadItem) => (
              <figure key={item.key} className="flex flex-col gap-1.5">
                <div
                  className={cn(
                    "relative flex aspect-square items-center justify-center overflow-hidden rounded-panel border text-muted",
                    item.state.status === "error" || item.state.status === "rejected"
                      ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)]"
                      : "border-line bg-panel",
                  )}
                >
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- локальное превью
                    <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon aria-hidden="true" size={22} />
                  )}
                  {item.state.status === "uploading" ? (
                    <span className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-surface">
                      <i className="block h-full" style={{ width: `${item.state.progress}%`, backgroundColor: "var(--color-accent-deep)" }} />
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeUpload(item.key)}
                    aria-label={`Убрать ${item.name}`}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink"
                  >
                    <X size={14} />
                  </button>
                </div>
                <figcaption className={cn("truncate text-xs", item.state.status === "error" || item.state.status === "rejected" ? "text-[var(--color-danger)]" : "text-muted")}>
                  {item.state.status === "error" || item.state.status === "rejected" ? item.state.message : item.name}
                </figcaption>
              </figure>
            ))}
            {examples.length < 10 ? (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-panel border border-dashed border-line text-sm text-ink-soft hover:bg-[var(--color-accent-soft)]">
                <Plus size={18} />
                Добавить
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []).slice(0, 10 - examples.length);
                    event.target.value = "";
                    if (files.length > 0) void addFiles("example", files);
                  }}
                />
              </label>
            ) : null}
          </div>
          <p className="flex items-center gap-3 rounded-panel border border-accent bg-accent-soft p-4 text-[13px] text-ink">
            <Info aria-hidden="true" size={18} className="shrink-0 text-accent-deep" />
            Чем больше примеров, тем точнее попадём в ваш стиль.
          </p>
        </WizardCard>
      </WizardBody>
      <WizardFoot onBack={onBack}>
        <Button variant="ghost" onClick={onNext} disabled={uploading}>
          Пропустить
        </Button>
        <NextButton onClick={onNext} disabled={uploading || (!logo && examples.length === 0)} />
      </WizardFoot>
    </>
  );
}
