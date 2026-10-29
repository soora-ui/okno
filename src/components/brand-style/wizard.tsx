"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { saveBrandWizardDraftAction, type BrandWizardDraft } from "@/app/actions/brand-theme";
import {
  BrandApiError,
  analyzeMaterials,
  deleteMaterial,
  generateVariants,
  uploadMaterial,
} from "@/components/brand-style/api";
import { DoneScreen } from "@/components/brand-style/done";
import { GenerationWait } from "@/components/brand-style/generation-wait";
import { LimitDialog } from "@/components/brand-style/limit-dialog";
import { ManualScreen } from "@/components/brand-style/manual";
import { PalettesScreen } from "@/components/brand-style/palettes";
import type { MockMaster } from "@/components/brand-style/phone-mock";
import { PreviewScreen } from "@/components/brand-style/preview";
import {
  emptyWizardData,
  stepLabels,
  stepNumber,
  uploadedIds,
  type UploadItem,
  type WizardData,
  type WizardStep,
} from "@/components/brand-style/state";
import {
  BrandbookStep,
  ChoiceStep,
  DescribeStep,
} from "@/components/brand-style/step-materials";
import { LogoStep } from "@/components/brand-style/step-logo";
import { ReviewStep } from "@/components/brand-style/step-review";
import { BrowserToolbarOffset } from "@/components/layout/browser-toolbar-offset";
import { Button } from "@/components/ui/button";
import { DialogClose, GenerationsCounter, WizardDialog } from "@/components/brand-style/ui";
import type { BrandThemeVersion } from "@/lib/brand-theme/drafts";
import type { BrandMaterialKind } from "@/lib/brand-theme/materials";
import type { StoredBrandMaterial } from "@/lib/brand-theme/storage";
import { cn } from "@/lib/utils";

const exitHref = "/settings?tab=booking";

function fromStored(material: StoredBrandMaterial): UploadItem {
  return {
    key: material.id,
    kind: material.kind,
    name: material.name,
    size: material.sizeBytes,
    isPdf: material.mime === "application/pdf",
    state:
      material.moderation === "rejected"
        ? { status: "rejected", message: "Изображение не подходит. Выберите другое." }
        : {
            status: "uploaded",
            note: material.pageCount ? `Загружен, разобрано ${material.pageCount} стр.` : undefined,
          },
    material,
  };
}

function restoreDraft(
  draft: Record<string, unknown> | null,
  materials: StoredBrandMaterial[],
): { data: WizardData; step: WizardStep } | null {
  if (!draft) return null;
  const ids = Array.isArray(draft.materialIds) ? (draft.materialIds as string[]) : [];
  const uploads = materials.filter((material) => ids.includes(material.id)).map(fromStored);
  const step = typeof draft.step === "string" ? (draft.step as WizardStep) : "choice";
  return {
    step: ["choice", "brandbook", "describe", "logo", "review"].includes(step) ? step : "review",
    data: {
      ...emptyWizardData,
      path: draft.path === "brandbook" || draft.path === "describe" ? draft.path : null,
      uploads,
      hexColors: Array.isArray(draft.hexColors) ? (draft.hexColors as string[]) : [],
      colorWords: typeof draft.colorWords === "string" ? draft.colorWords : "",
      moods: Array.isArray(draft.moods) ? (draft.moods as string[]) : [],
      wishes: typeof draft.wishes === "string" ? draft.wishes : "",
      logoId: typeof draft.logoMaterialId === "string" ? draft.logoMaterialId : null,
      logoDarkId: typeof draft.logoDarkMaterialId === "string" ? draft.logoDarkMaterialId : null,
      preferredFonts:
        draft.preferredFonts && typeof draft.preferredFonts === "object"
          ? (draft.preferredFonts as WizardData["preferredFonts"])
          : { heading: null, body: null },
    },
  };
}

export function BrandStyleWizard({
  username,
  generationsLeft: initialLeft,
  materials,
  versions,
  draft,
  initialThemeId,
  initialManual,
  master,
}: {
  username: string;
  generationsLeft: number;
  materials: StoredBrandMaterial[];
  versions: BrandThemeVersion[];
  draft: Record<string, unknown> | null;
  initialThemeId: string | null;
  initialManual: boolean;
  master: MockMaster;
}) {
  const router = useRouter();
  const openVersion = initialThemeId ? versions.find((version) => version.id === initialThemeId) : null;
  const restored = openVersion ? null : restoreDraft(draft, materials);

  const [step, setStep] = useState<WizardStep>(
    openVersion ? (initialManual ? "manual" : "preview") : (restored?.step ?? "choice"),
  );
  const [data, setData] = useState<WizardData>(restored?.data ?? emptyWizardData);
  const [left, setLeft] = useState(initialLeft);
  const [variants, setVariants] = useState<BrandThemeVersion[]>(
    openVersion
      ? versions
          .filter((v) => v.generationId && v.generationId === openVersion.generationId)
          // Номера «Вариант 1 · 2 · 3» — по порядку появления.
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      : [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(openVersion?.id ?? null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const generationAbort = useRef<AbortController | null>(null);

  // Варианты для переключателя «Вариант 1 · 2 · 3»: текущая генерация плюс
  // правки к её вариантам, которые появились в превью.
  const selected =
    variants.find((variant) => variant.id === selectedId) ??
    (openVersion && openVersion.id === selectedId ? openVersion : null);

  const update = useCallback((patch: Partial<WizardData>) => {
    setData((current) => ({ ...current, ...patch }));
    setDirty(true);
  }, []);

  const updateUpload = useCallback((key: string, patch: Partial<UploadItem>) => {
    setData((current) => ({
      ...current,
      uploads: current.uploads.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }));
  }, []);

  const addFiles = useCallback(
    (kind: BrandMaterialKind, files: File[]) => {
      setDirty(true);
      const items: UploadItem[] = files.map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind,
        name: file.name,
        size: file.size,
        isPdf: file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
        state: { status: "uploading", progress: 0 },
        material: null,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      }));
      setData((current) => ({ ...current, uploads: [...current.uploads, ...items] }));

      return Promise.all(
        items.map((item, index) =>
          uploadMaterial(kind, files[index], (progress) =>
            updateUpload(item.key, { state: { status: "uploading", progress } }),
          )
            .then((material) => {
              updateUpload(item.key, {
                material,
                state: {
                  status: "uploaded",
                  note: material.pageCount ? `Загружен, разобрано ${material.pageCount} стр.` : undefined,
                },
              });
              return material;
            })
            .catch((error: unknown) => {
              updateUpload(item.key, {
                state: {
                  status: "error",
                  message: error instanceof BrandApiError ? error.message : "Не получилось загрузить файл.",
                },
              });
              return null;
            }),
        ),
      );
    },
    [updateUpload],
  );

  const removeUpload = useCallback((key: string) => {
    setDirty(true);
    setData((current) => {
      const item = current.uploads.find((upload) => upload.key === key);
      if (item?.material) void deleteMaterial(item.material.id).catch(() => undefined);
      return {
        ...current,
        uploads: current.uploads.filter((upload) => upload.key !== key),
        logoId: current.logoId === item?.material?.id ? null : current.logoId,
        logoDarkId: current.logoDarkId === item?.material?.id ? null : current.logoDarkId,
      };
    });
  }, []);

  // «Что мы нашли» (4.3): разбор после загрузки брендбука. Перезапускается,
  // когда меняется набор загруженных файлов брендбука.
  const brandbookIds = uploadedIds(data.uploads, ["brandbook"]).join(",");
  const runAnalysis = useCallback(async () => {
    const ids = brandbookIds ? brandbookIds.split(",") : [];
    if (ids.length === 0) return;
    setData((current) => ({ ...current, analysis: { status: "loading" } }));
    try {
      const result = await analyzeMaterials(ids);
      setData((current) => {
        const rejected = new Map(
          result.materials.filter((m) => m.moderation === "rejected").map((m) => [m.id, m.reason]),
        );
        const heading = result.fonts.find((font) => font.role !== "body");
        const body = result.fonts.find((font) => font.role === "body");
        return {
          ...current,
          uploads: current.uploads.map((item) =>
            item.material && rejected.has(item.material.id)
              ? {
                  ...item,
                  state: {
                    status: "rejected",
                    message: rejected.get(item.material.id) || "Изображение не подходит. Выберите другое.",
                  },
                }
              : item,
          ),
          hexColors: current.hexColors.length > 0 ? current.hexColors : result.foundColors,
          preferredFonts: {
            heading:
              current.preferredFonts.heading ?? heading?.available ?? heading?.replacement ?? null,
            body: current.preferredFonts.body ?? body?.available ?? body?.replacement ?? null,
          },
          analysis: { status: "done", fonts: result.fonts, readable: result.readable },
        };
      });
    } catch (error) {
      setData((current) => ({
        ...current,
        analysis: {
          status: "error",
          message: error instanceof BrandApiError ? error.message : "Не получилось разобрать файлы.",
        },
      }));
    }
  }, [brandbookIds]);

  useEffect(() => {
    if (step === "brandbook" && brandbookIds) void runAnalysis();
    // Разбор — по набору файлов, а не по каждому шагу мастера.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandbookIds]);

  const generate = useCallback(
    async (regenerationComment?: string) => {
      if (left <= 0) {
        setLimitOpen(true);
        return;
      }
      setGenerationError(null);
      setStep("generating");
      const controller = new AbortController();
      generationAbort.current = controller;
      try {
        const logoIds = [data.logoId, data.logoDarkId].filter(Boolean);
        const result = await generateVariants(
          {
            materialIds: uploadedIds(data.uploads).filter((id) => !logoIds.includes(id)),
            logoMaterialId: data.logoId,
            logoDarkMaterialId: data.logoDarkId,
            hexColors: data.hexColors,
            colorWords: data.colorWords,
            moods: data.moods,
            wishes: data.wishes,
            regenerationComment,
            preferredFonts: data.preferredFonts,
          },
          {
            signal: controller.signal,
            onOffline: () => setOffline(true),
            onOnline: () => setOffline(false),
          },
        );
        setLeft(result.generationsLeft);
        setVariants(result.variants);
        setSelectedId(result.variants[0]?.id ?? null);
        setStep("palettes");
        setDirty(false);
        void saveBrandWizardDraftAction(null);
      } catch (error) {
        if (controller.signal.aborted) {
          setStep("review");
          return;
        }
        if (error instanceof BrandApiError && error.code === "limit") {
          setLeft(0);
          setStep("review");
          setLimitOpen(true);
          return;
        }
        setGenerationError(
          error instanceof BrandApiError ? error.message : "Что-то пошло не так. Генерация не списана.",
        );
      } finally {
        setOffline(false);
        generationAbort.current = null;
      }
    },
    [data, left],
  );

  const draftState = (): BrandWizardDraft => ({
    step,
    path: data.path,
    materialIds: uploadedIds(data.uploads),
    logoMaterialId: data.logoId,
    logoDarkMaterialId: data.logoDarkId,
    hexColors: data.hexColors,
    colorWords: data.colorWords,
    moods: data.moods,
    wishes: data.wishes,
    preferredFonts: data.preferredFonts,
  });

  const requestExit = () => {
    const inMaterials = ["choice", "brandbook", "describe", "logo", "review"].includes(step);
    if (inMaterials && dirty) {
      setExitOpen(true);
      return;
    }
    router.push(exitHref);
  };

  const current = stepNumber[step];
  const busy = step === "generating";

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-background)] text-ink">
      {/* Мастер живёт вне SiteShell: панель браузера внизу на телефоне
          перекрывала бы «Далее», поэтому смещение считаем сами. */}
      <BrowserToolbarOffset />
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-line px-3 py-2.5 backdrop-blur sm:px-8 sm:py-4" style={{ backgroundColor: "color-mix(in srgb, var(--color-background) 80%, transparent)" }}>
        {step === "preview" || step === "manual" ? (
          <Button variant="ghost" onClick={() => (step === "manual" ? setStep("preview") : setStep("palettes"))} className="gap-2 px-3">
            <ArrowLeft size={16} />
            Назад
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={requestExit}
            disabled={busy}
            className="gap-2 px-3 disabled:opacity-40"
          >
            <X size={16} />
            Закрыть
          </Button>
        )}

        <ol className="hidden items-center gap-2 lg:flex" aria-label="Шаги">
          {stepLabels.map((label, index) => {
            const number = index + 1;
            const state = number < current ? "done" : number === current ? "on" : "todo";
            return (
              <li key={label} className="flex items-center gap-2">
                {index > 0 ? <span aria-hidden="true" className="h-px w-6 bg-[var(--color-line)]" /> : null}
                <span
                  aria-current={state === "on" ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 text-[13px] font-medium",
                    state === "on" ? "text-ink" : state === "done" ? "text-accent-deep" : "text-muted",
                  )}
                >
                  <b
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                      state === "on" && "border-[var(--ui-primary-bg)] bg-[var(--ui-primary-bg)] text-[var(--ui-primary-text)]",
                      state === "done" && "border-[var(--color-accent-deep)] bg-[var(--color-accent-soft)] text-accent-deep",
                      state === "todo" && "border-line bg-surface text-muted",
                    )}
                  >
                    {state === "done" ? <Check size={14} /> : number}
                  </b>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:hidden">
          <span className="truncate text-xs font-medium text-ink-soft">
            Шаг {current} из 5 · {stepLabels[current - 1]}
          </span>
          <span className="h-1.5 overflow-hidden rounded-full border border-line bg-panel">
            <i className="block h-full rounded-full" style={{ width: `${(current / 5) * 100}%`, backgroundColor: "var(--color-accent-deep)" }} />
          </span>
        </div>

        <span className="hidden sm:inline-flex">
          <GenerationsCounter
            left={left}
            label={busy ? "Идёт генерация" : left > 0 ? `${left} ${left === 1 ? "генерация" : "генерации"}` : "0 генераций"}
          />
        </span>
        <span className="shrink-0 sm:hidden" aria-label={`Осталось генераций: ${left}`}>
          <GenerationsCounter left={left} label={busy ? "…" : String(left)} />
        </span>
      </header>

      {step === "choice" ? (
        <ChoiceStep
          onPick={(path) => {
            update({ path });
            setStep(path);
          }}
        />
      ) : null}

      {step === "brandbook" ? (
        <BrandbookStep
          data={data}
          update={update}
          addFiles={(files) => addFiles("brandbook", files)}
          removeUpload={removeUpload}
          retryAnalysis={runAnalysis}
          onDescribeInstead={() => {
            update({ path: "describe" });
            setStep("describe");
          }}
          onBack={() => setStep("choice")}
          onNext={() => setStep("logo")}
        />
      ) : null}

      {step === "describe" ? (
        <DescribeStep
          data={data}
          update={update}
          addFiles={(files) => addFiles("colorPhoto", files)}
          removeUpload={removeUpload}
          onBack={() => setStep("choice")}
          onNext={() => setStep("logo")}
        />
      ) : null}

      {step === "logo" ? (
        <LogoStep
          data={data}
          update={update}
          addFiles={addFiles}
          removeUpload={removeUpload}
          onBack={() => setStep(data.path ?? "choice")}
          onNext={() => setStep("review")}
        />
      ) : null}

      {step === "review" ? (
        <ReviewStep
          data={data}
          update={update}
          generationsLeft={left}
          onEdit={(target) => setStep(target)}
          onBack={() => setStep("logo")}
          onGenerate={() => void generate()}
        />
      ) : null}

      {step === "generating" ? (
        <GenerationWait
          foundColors={data.hexColors}
          error={generationError}
          offline={offline}
          generationsLeft={left}
          onCancel={() => generationAbort.current?.abort()}
          onRetry={() => void generate()}
          onClose={() => {
            setGenerationError(null);
            setStep("review");
          }}
        />
      ) : null}

      {step === "palettes" ? (
        <PalettesScreen
          variants={variants}
          selectedId={selectedId}
          master={master}
          generationsLeft={left}
          onSelect={setSelectedId}
          onRegenerate={(comment) => void generate(comment)}
          onLimit={() => setLimitOpen(true)}
          onContinue={() => setStep("preview")}
        />
      ) : null}

      {step === "preview" && selected ? (
        <PreviewScreen
          username={username}
          variants={variants.length > 0 ? variants : [selected]}
          selected={selected}
          generationsLeft={left}
          onSelect={setSelectedId}
          onRefined={(variant) => {
            setVariants((current) => [...current, variant]);
            setSelectedId(variant.id);
          }}
          onRegenerate={(comment) => void generate(comment)}
          onManual={() => setStep("manual")}
          onLimit={() => setLimitOpen(true)}
          onApplied={() => setStep("done")}
        />
      ) : null}

      {step === "manual" && selected ? (
        <ManualScreen
          base={selected}
          master={master}
          onCancel={() => setStep("preview")}
          onSaved={(variant) => {
            setVariants((current) => [...current, variant]);
            setSelectedId(variant.id);
            setStep("preview");
          }}
        />
      ) : null}

      {step === "done" && selected ? (
        <DoneScreen theme={selected.theme} master={master} username={username} />
      ) : null}

      <LimitDialog
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
        onManual={
          selected
            ? () => {
                setLimitOpen(false);
                setStep("manual");
              }
            : null
        }
      />

      <WizardDialog open={exitOpen} onClose={() => setExitOpen(false)} labelledBy="exit-title">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 id="exit-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              Сохранить черновик?
            </h2>
            <p className="text-sm text-muted">
              Файлы и пожелания останутся, и вы продолжите с этого же места.
            </p>
          </div>
          <DialogClose onClick={() => setExitOpen(false)} />
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <Button
            variant="ghost"
            className="text-[var(--color-danger)]"
            onClick={() => {
              void saveBrandWizardDraftAction(null);
              router.push(exitHref);
            }}
          >
            Не сохранять
          </Button>
          <span className="hidden flex-1 sm:block" />
          <Button variant="secondary" onClick={() => setExitOpen(false)}>
            Остаться
          </Button>
          <Button
            onClick={async () => {
              await saveBrandWizardDraftAction(draftState());
              router.push(exitHref);
            }}
          >
            Сохранить
          </Button>
        </div>
      </WizardDialog>
    </div>
  );
}

/** Нижняя панель шага (4.2–4.6): «Назад» слева, действия справа. */
export function WizardFoot({
  onBack,
  left,
  children,
}: {
  onBack?: () => void;
  // Своя кнопка слева вместо «Назад» (4.8 «Ни один не подходит», 4.10).
  left?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <footer
      className="sticky bottom-[var(--browser-toolbar-overlap,0px)] z-20 flex items-center justify-between gap-3 border-t border-line px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur sm:px-8 sm:py-4"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-surface) 70%, transparent)" }}
    >
      {left ??
        (onBack ? (
          <Button variant="ghost" onClick={onBack} className="gap-2 px-3">
            <ArrowLeft size={16} />
            Назад
          </Button>
        ) : (
          <span />
        ))}
      <div className="flex items-center gap-3">{children}</div>
    </footer>
  );
}

export function NextButton({
  onClick,
  disabled,
  children = "Далее",
}: {
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Button onClick={onClick} disabled={disabled} className="gap-2 disabled:opacity-40">
      {children}
      <ArrowRight size={16} />
    </Button>
  );
}

/** Тело шага: колонка 880px, как wz-in в макете. */
export function WizardBody({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="flex flex-1 justify-center px-4 pb-6 pt-6 sm:px-8 sm:pb-10 sm:pt-11">
      <div className={cn("flex w-full flex-col gap-7", wide ? "max-w-[1240px]" : "max-w-[880px]")}>
        {children}
      </div>
    </main>
  );
}
