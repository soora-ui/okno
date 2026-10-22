"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { Check, Download, LoaderCircle, Share, Tag, X } from "lucide-react";
import { setHotWindowsDiscountAction } from "@/app/actions/free-windows";
import { useDemoMode } from "@/components/tour/demo-mode";
import { Button } from "@/components/ui/button";
import type { FreeWindowDay } from "@/lib/free-windows";
import { buildFreeWindowsStoryHtml } from "@/lib/free-windows-story-template";
import {
  storyPaletteMeta,
  storyPalettes,
  storyStyleLabels,
  storyStyles,
  type StoryPalette,
  type StoryStyle,
} from "@/lib/free-windows-story-options";
import type { HotWindowsDiscount } from "@/lib/service-discounts";

// Окно выбора картинки для сторис (макеты «Выбор сторис · компьютер» и
// «· телефон»): стиль × цвет, живое превью и скачивание или «Поделиться».
// Превью собирается в браузере из того же шаблона, по которому сервер рисует
// PNG, — переключение мгновенное. Саму PNG подгружаем в фоне, когда выбор
// замер, чтобы «Поделиться» не ждало рендера.

type StoryData = {
  days: FreeWindowDay[];
  masterName: string;
  publicLink: string;
  hotWindowsDiscount?: HotWindowsDiscount | null;
};

// Скидка на окошки: 0 — без скидки. Больше 30% мастера в горящих окошках
// почти не дают, а длинный ряд не помещается на телефоне.
const discountOptions = [0, 10, 15, 20, 30] as const;

// Холст шаблона — 540×960; превью — 194×346 на телефоне и 238×422 на компьютере.
const previewScale = "[--story-scale:0.3593] md:[--story-scale:0.4407]";

const storageKey = "okno:free-windows-story";

function readSavedChoice(): { style?: StoryStyle; palette?: StoryPalette } {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { style?: unknown; palette?: unknown };
    return {
      style: storyStyles.includes(parsed.style as StoryStyle) ? (parsed.style as StoryStyle) : undefined,
      palette: storyPalettes.includes(parsed.palette as StoryPalette)
        ? (parsed.palette as StoryPalette)
        : undefined,
    };
  } catch {
    // Приватный режим или запрет хранилища — просто начинаем с умолчаний.
    return {};
  }
}

function saveChoice(choice: { style: StoryStyle; palette: StoryPalette }) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(choice));
  } catch {
    // Не запомнили выбор — не беда, в следующий раз будет умолчание.
  }
}

// Подпись под выбором скидки: что именно произойдёт по «Поделиться».
function discountHint(
  discount: number,
  active: HotWindowsDiscount | null,
  lastDayLabel: string | undefined,
) {
  const untilLabel = lastDayLabel ? ` по ${lastDayLabel}` : " на эти три дня";
  if (discount === 0) {
    return active
      ? `Сейчас действует −${active.percent}% до ${DateTime.fromISO(active.untilIso).setLocale("ru").toFormat("d MMMM")}. Без скидки — выключим её.`
      : "Скидка не нужна — на картинке будут только окошки.";
  }
  if (active?.percent === discount) {
    return `Скидка −${discount}% уже включена: клиенты видят её на странице записи.`;
  }
  return `Включим −${discount}% на любые визиты${untilLabel}. Скидка появится и на вашей странице записи.`;
}

function canShareFiles() {
  try {
    const probe = new File([new Blob()], "probe.png", { type: "image/png" });
    return Boolean(navigator.canShare?.({ files: [probe] }));
  } catch {
    return false;
  }
}

export function FreeWindowsStoryDialog({
  storyHref,
  defaultPalette,
  onClose,
}: {
  storyHref: string;
  defaultPalette: StoryPalette;
  onClose: () => void;
}) {
  // Демо живёт на том же адресе, что и настоящий кабинет: свой выбор стиля
  // ему не читаем и не запоминаем, чтобы не подменить выбор мастера.
  const demo = useDemoMode();
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [style, setStyle] = useState<StoryStyle>(() => (demo ? undefined : readSavedChoice().style) ?? "light");
  const [palette, setPalette] = useState<StoryPalette>(
    () => (demo ? undefined : readSavedChoice().palette) ?? defaultPalette,
  );
  const [storyData, setStoryData] = useState<StoryData | null>(null);
  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");
  // Готовая PNG для текущего выбора — чтобы «Поделиться» сработало сразу.
  const prefetched = useRef<{ url: string; blob: Blob } | null>(null);
  const [actionState, setActionState] = useState<"idle" | "working" | "error">("idle");
  const [shareSupported] = useState(canShareFiles);
  // Скидка на окошки. Включается вместе с «Поделиться»: на картинке не может
  // быть скидки, которой нет на странице записи.
  const [discount, setDiscount] = useState(0);
  const activeDiscount = storyData?.hotWindowsDiscount ?? null;

  const imageUrl = `${storyHref}?${new URLSearchParams({
    style,
    palette,
    ...(discount > 0 ? { discount: String(discount) } : {}),
  })}`;

  const pick = useCallback(
    (next: { style?: StoryStyle; palette?: StoryPalette }) => {
      const choice = { style: next.style ?? style, palette: next.palette ?? palette };
      if (choice.style === style && choice.palette === palette) return;
      setStyle(choice.style);
      setPalette(choice.palette);
      if (!demo) saveChoice(choice);
    },
    [demo, palette, style],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${storyHref}?format=data`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`story data ${response.status}`);
        return response.json() as Promise<StoryData>;
      })
      .then((data) => {
        setStoryData(data);
        setDiscount(data.hotWindowsDiscount?.percent ?? 0);
        setDataState("ready");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setDataState("error");
      });
    return () => controller.abort();
  }, [storyHref]);

  // PNG рисуем, только когда выбор постоял полсекунды: пролистывание цветов
  // не должно ставить в очередь рендеры, которые никто не увидит.
  useEffect(() => {
    if (prefetched.current?.url === imageUrl) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(imageUrl, { signal: controller.signal })
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => {
          if (blob) prefetched.current = { url: imageUrl, blob };
        })
        .catch(() => {
          // Не успели заранее — догрузим по нажатию.
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [imageUrl]);

  const previewHtml = useMemo(
    () =>
      storyData
        ? buildFreeWindowsStoryHtml({
            days: storyData.days,
            masterName: storyData.masterName,
            publicLink: storyData.publicLink,
            style,
            palette,
            discountPercent: discount || null,
            fontFamily: "var(--font-manrope-loaded), Manrope, sans-serif",
          })
        : null,
    [storyData, style, palette, discount],
  );

  async function loadImage() {
    if (prefetched.current?.url === imageUrl) return prefetched.current.blob;
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`story ${response.status}`);
    const blob = await response.blob();
    prefetched.current = { url: imageUrl, blob };
    return blob;
  }

  async function handleAction() {
    setActionState("working");
    try {
      // Сначала скидка, потом картинка: если сохранить не вышло, сторис со
      // скидкой, которой нет, не уйдёт. В демо базу мастера не трогаем.
      if (!demo && discount !== (activeDiscount?.percent ?? 0)) {
        const result = await setHotWindowsDiscountAction(discount);
        if (!result.success) throw new Error(result.message);
        setStoryData((current) =>
          current ? { ...current, hotWindowsDiscount: result.discount } : current,
        );
      }

      const blob = await loadImage();
      const file = new File([blob], "okoshki.png", { type: "image/png" });

      // На телефоне сразу системное «Поделиться» — оттуда картинка уходит в
      // сторис Instagram, Telegram или VK без лишнего сохранения.
      if (shareSupported) {
        try {
          await navigator.share({ files: [file] });
        } catch (error) {
          // Закрыть меню «Поделиться» — не ошибка, окно выбора остаётся.
          if ((error as Error).name === "AbortError") {
            setActionState("idle");
            return;
          }
          throw error;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setActionState("idle");
      onClose();
    } catch {
      setActionState("error");
    }
  }

  const actionIcon =
    actionState === "working" ? (
      <LoaderCircle size={18} className="animate-spin" />
    ) : shareSupported ? (
      <Share size={18} strokeWidth={1.8} />
    ) : (
      <Download size={18} strokeWidth={1.8} />
    );
  const actionLabel = shareSupported ? "Поделиться" : "Скачать картинку";

  const preview = (
    <div
      data-story-preview
      data-ready={previewHtml ? "" : undefined}
      role="img"
      aria-label={`Превью сторис: ${storyStyleLabels[style]}, ${storyPaletteMeta[palette].name}`}
      className="relative h-[346px] w-[194px] overflow-hidden rounded-[18px] bg-panel shadow-[0_20px_60px_rgba(35,36,31,0.2)] md:h-[422px] md:w-[238px] md:rounded-[20px] md:shadow-[0_24px_80px_rgba(35,36,31,0.18)]"
    >
      {previewHtml ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 origin-top-left [&_*]:box-border ${previewScale}`}
          style={{ transform: "scale(var(--story-scale))" }}
          // Шаблон экранирует имя мастера и ссылку (escapeHtml), остальное —
          // наши же цвета и время окошек.
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-ink-soft">
          {dataState === "error" ? (
            "Не получилось показать превью"
          ) : (
            <LoaderCircle size={22} className="animate-spin text-muted" aria-label="Готовим превью" />
          )}
        </div>
      )}
    </div>
  );

  const swatchButton = (item: StoryPalette) => {
    const selected = item === palette;
    return (
      <button
        type="button"
        onClick={() => pick({ palette: item })}
        aria-label={storyPaletteMeta[item].name}
        aria-pressed={selected}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition"
        style={{
          backgroundColor: storyPaletteMeta[item].swatch,
          boxShadow: selected
            ? "0 0 0 3px var(--ui-card-bg), 0 0 0 5px var(--color-ink)"
            : "inset 0 0 0 1px rgba(35,36,31,0.14)",
        }}
      >
        <Check
          size={20}
          strokeWidth={2.4}
          color={item === "sage" ? "#23241f" : "#ffffff"}
          className={selected ? "opacity-100" : "opacity-0"}
          aria-hidden
        />
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
      style={{ backgroundColor: "rgba(35,36,31,0.5)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[94vh] w-full flex-col gap-4 overflow-y-auto rounded-t-[28px] px-5 pb-6 pt-2.5 shadow-[0_-24px_80px_rgba(22,24,20,0.18)] md:w-[880px] md:max-w-full md:gap-6 md:rounded-card md:border md:border-[var(--color-line)] md:p-7 md:shadow-ink"
        style={{ backgroundColor: "var(--ui-card-bg)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-1 w-10 shrink-0 self-center rounded-full bg-[var(--color-line)] md:hidden" />

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1.5">
            <p className="hidden text-[11px] font-medium uppercase tracking-[0.2em] text-muted md:block">
              Горящие окошки
            </p>
            <h2
              id={titleId}
              className="text-xl font-semibold leading-[1.3] tracking-[-0.01em] text-ink md:text-2xl md:leading-[1.2] md:tracking-[-0.025em]"
            >
              Картинка для сторис
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink transition hover:border-ink-soft"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-7">
          <div className="flex items-center justify-center rounded-nested bg-panel p-4 md:w-[300px] md:flex-none md:p-5">
            {preview}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4 md:justify-center md:gap-7">
            <div className="flex flex-col gap-3">
              <p className="hidden text-[11px] font-medium uppercase tracking-[0.2em] text-muted md:block">
                Стиль
              </p>
              <div className="flex gap-2 md:flex-wrap">
                {storyStyles.map((item) => (
                  <Button
                    key={item}
                    variant={item === style ? "primary" : "secondary"}
                    aria-pressed={item === style}
                    onClick={() => pick({ style: item })}
                    className="h-11 flex-1 px-2 text-[15px] md:flex-none md:px-[22px]"
                  >
                    {storyStyleLabels[item]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2.5 md:gap-3">
              <p className="text-[13px] text-ink-soft md:hidden">
                Цвет: <span className="font-semibold text-ink">{storyPaletteMeta[palette].name}</span>
              </p>
              <p className="hidden text-[11px] font-medium uppercase tracking-[0.2em] text-muted md:block">
                Цвет
              </p>
              <div className="flex justify-between md:hidden">
                {storyPalettes.map((item) => (
                  <span key={item}>{swatchButton(item)}</span>
                ))}
              </div>
              <div className="hidden flex-wrap gap-1.5 md:flex">
                {storyPalettes.map((item) => (
                  <div key={item} className="flex w-[72px] flex-col items-center gap-2.5">
                    {swatchButton(item)}
                    <span
                      className={`text-center text-xs leading-[1.25] text-ink ${item === palette ? "font-semibold" : "font-normal"}`}
                    >
                      {storyPaletteMeta[item].name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2.5 md:gap-3">
              <p className="flex items-center gap-1.5 text-[13px] text-ink-soft md:text-[11px] md:font-medium md:uppercase md:tracking-[0.2em] md:text-muted">
                <Tag size={13} aria-hidden className="md:hidden" />
                Скидка на окошки
              </p>
              <div className="flex gap-2">
                {discountOptions.map((item) => (
                  <Button
                    key={item}
                    variant={item === discount ? "primary" : "secondary"}
                    aria-pressed={item === discount}
                    onClick={() => setDiscount(item)}
                    className="h-11 flex-1 px-1 text-[15px] md:flex-none md:px-4"
                  >
                    {item === 0 ? "Нет" : `−${item}%`}
                  </Button>
                ))}
              </div>
              <p className="text-[12px] leading-[1.5] text-ink-soft md:max-w-[380px] md:text-[13px]">
                {discountHint(discount, activeDiscount, storyData?.days.at(-1)?.dateLabel)}
              </p>
            </div>

            <p className="hidden max-w-[380px] text-[13px] leading-[1.5] text-ink-soft md:block">
              Вертикальная картинка 1080×1920 с окошками на три дня и ссылкой на вашу страницу.
            </p>
          </div>
        </div>

        {actionState === "error" ? (
          <p role="alert" className="text-sm text-[#c96b5c]">
            {discount !== (activeDiscount?.percent ?? 0)
              ? "Не получилось включить скидку или подготовить картинку. Попробуй ещё раз."
              : "Не получилось подготовить картинку. Попробуй ещё раз."}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-4 md:border-t md:border-[var(--color-line)] md:pt-5">
          <span className="hidden text-[13px] text-ink-soft md:inline">
            {shareSupported ? "Откроется меню «Поделиться»" : "На компьютере файл скачается"}
          </span>
          <div className="flex w-full gap-3 md:w-auto">
            {/* На телефоне «Отмены» нет — закрывают крестиком или тапом мимо.
                Скрываем обёрткой: свой display у кнопки перебивает hidden. */}
            <div className="hidden md:block">
              <Button variant="secondary" onClick={onClose} className="h-11 text-[15px]">
                Отмена
              </Button>
            </div>
            <Button
              onClick={handleAction}
              disabled={actionState === "working"}
              className="h-12 w-full gap-2.5 text-base md:h-11 md:w-auto md:text-[15px]"
            >
              {actionIcon}
              {actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
