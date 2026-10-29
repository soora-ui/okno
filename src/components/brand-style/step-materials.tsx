"use client";

import { useState } from "react";
import { FileText, Info, Pencil, Plus, TriangleAlert, X } from "lucide-react";
import { brandFontFamily, brandFontLabel } from "@/components/brand-theme/brand-fonts";
import type { UploadItem, WizardData } from "@/components/brand-style/state";
import {
  Badge,
  CardTitle,
  Chip,
  DropZone,
  Eyebrow,
  FileRow,
  StepTitle,
  WizardCard,
  formatBytes,
} from "@/components/brand-style/ui";
import { NextButton, WizardBody, WizardFoot } from "@/components/brand-style/wizard";
import { Button } from "@/components/ui/button";
import { brandMoods } from "@/lib/brand-theme/generation-prompt";
import { brandFontIds, type BrandFontId } from "@/lib/brand-theme/schema";
import { cn } from "@/lib/utils";

const hexPattern = /^#[0-9a-f]{6}$/i;

// ——— 4.2 «У вас есть брендбук?» ———

export function ChoiceStep({ onPick }: { onPick: (path: "brandbook" | "describe") => void }) {
  const options = [
    {
      path: "brandbook" as const,
      icon: FileText,
      title: "Да, есть брендбук",
      text: "Загрузите PDF или изображения: найдём в них цвета и шрифты.",
      tags: ["PDF", "PNG", "JPG", "до 20 МБ"],
    },
    {
      path: "describe" as const,
      icon: Pencil,
      title: "Нет, опишу сам",
      text: "Укажите цвета кодом, словами или картинкой. Этого достаточно.",
      tags: ["HEX-цвета", "Описание", "Настроение", "Фото"],
    },
  ];

  return (
    <WizardBody>
      <StepTitle
        eyebrow="Материалы"
        title="У вас есть брендбук?"
        sub="От этого зависит, что мы попросим загрузить дальше. Подойдёт и просто описание."
      />
      <div className="grid gap-3.5 sm:grid-cols-2 sm:gap-5">
        {options.map(({ path, icon: Icon, title, text, tags }) => (
          <button
            key={path}
            type="button"
            onClick={() => onPick(path)}
            className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-[22px] text-left shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-hover sm:p-7"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-accent bg-accent-soft text-accent-deep">
              <Icon aria-hidden="true" size={20} strokeWidth={1.6} />
            </span>
            <span className="text-lg font-semibold text-ink">{title}</span>
            <span className="text-sm text-ink-soft">{text}</span>
            <span className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </span>
          </button>
        ))}
      </div>
    </WizardBody>
  );
}

// ——— цвета чипами (4.3 «Что мы нашли», 4.6) ———

function ColorChips({
  colors,
  onChange,
  max = 8,
}: {
  colors: string[];
  onChange: (colors: string[]) => void;
  max?: number;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("#");

  const commit = () => {
    const value = draft.trim().toLowerCase();
    if (hexPattern.test(value) && !colors.includes(value)) onChange([...colors, value]);
    setDraft("#");
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap gap-2.5">
      {colors.map((color) => (
        <span
          key={color}
          className="inline-flex min-h-11 items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-1"
        >
          <span className="h-8 w-8 rounded-full border border-black/15" style={{ backgroundColor: color }} />
          <span className="font-mono text-xs uppercase tracking-[0.02em] text-ink">{color}</span>
          <button
            type="button"
            onClick={() => onChange(colors.filter((item) => item !== color))}
            aria-label={`Убрать цвет ${color}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-[var(--color-panel)]"
          >
            <X size={14} />
          </button>
        </span>
      ))}
      {colors.length < max ? (
        adding ? (
          <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-accent-deep)] bg-surface py-1 pl-3 pr-1">
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "Escape") setAdding(false);
              }}
              aria-label="Код цвета"
              maxLength={7}
              className="w-[84px] bg-transparent font-mono text-xs uppercase text-ink outline-none"
            />
            <Button variant="secondary" className="min-h-9 px-3 py-1" onClick={commit}>
              Добавить
            </Button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-line px-4 text-sm font-medium text-ink hover:bg-[var(--color-accent-soft)]"
          >
            <Plus size={16} />
            Добавить цвет
          </button>
        )
      ) : null}
    </div>
  );
}

function FontSelect({
  value,
  onChange,
  label,
}: {
  value: BrandFontId | null;
  onChange: (value: BrandFontId) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value as BrandFontId)}
      className="min-h-12 w-full rounded-field border border-line bg-[var(--ui-field-bg)] outline-none focus:border-[var(--color-accent-deep)] focus:shadow-[0_0_0_2px_var(--color-accent-deep)] px-4 text-[15px] text-ink"
    >
      <option value="" disabled>
        Выберите шрифт
      </option>
      {brandFontIds.map((id) => (
        <option key={id} value={id}>
          {brandFontLabel(id)}
        </option>
      ))}
    </select>
  );
}

// ——— 4.3 «Загрузите брендбук» ———

export function BrandbookStep({
  data,
  update,
  addFiles,
  removeUpload,
  retryAnalysis,
  onDescribeInstead,
  onBack,
  onNext,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  addFiles: (files: File[]) => void;
  removeUpload: (key: string) => void;
  retryAnalysis: () => void;
  onDescribeInstead: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const files = data.uploads.filter((item) => item.kind === "brandbook");
  const uploading = files.some((item) => item.state.status === "uploading");
  const ready = files.some((item) => item.state.status === "uploaded");
  const analysis = data.analysis;
  const [pickingFont, setPickingFont] = useState(false);

  return (
    <>
      <WizardBody>
        <StepTitle
          eyebrow="Материалы · брендбук"
          title="Загрузите брендбук"
          sub="PDF, PNG или JPG, до 20 МБ. Из PDF мы разбираем первые 15 страниц."
        />
        <DropZone
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onFiles={addFiles}
          title="Перетащите файлы сюда"
        />
        {files.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {files.map((item) => (
              <FileRow
                key={item.key}
                name={item.name}
                size={formatBytes(item.size)}
                isPdf={item.isPdf}
                state={item.state}
                onRemove={() => removeUpload(item.key)}
              />
            ))}
          </div>
        ) : null}

        {ready || analysis.status !== "idle" ? (
          <WizardCard>
            <CardTitle
              title="Что мы нашли"
              aside={
                analysis.status === "loading" || uploading ? (
                  <Badge>Разбираем страницы…</Badge>
                ) : analysis.status === "done" ? (
                  <Badge tone="ok">Разобрано</Badge>
                ) : null
              }
            />

            {analysis.status === "loading" ? (
              <div className="flex gap-2.5" aria-label="Разбираем файлы">
                {[0, 1, 2, 3].map((index) => (
                  <span key={index} className="h-11 w-11 animate-pulse rounded-full bg-[var(--color-panel)]" />
                ))}
              </div>
            ) : null}

            {analysis.status === "error" || (analysis.status === "done" && !analysis.readable) ? (
              <div
                className="flex flex-col gap-3 rounded-panel border p-4 text-ink"
                style={{ backgroundColor: "var(--color-warning-soft)", borderColor: "var(--color-warning)" }}
              >
                <div className="flex items-start gap-3">
                  <TriangleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-warning" />
                  <div>
                    <p className="text-sm font-semibold">Не смогли найти цвета в файле</p>
                    <p className="text-[13px] text-ink-soft">
                      {analysis.status === "error"
                        ? analysis.message
                        : "Похоже, это скан в плохом качестве. Укажите цвета вручную или загрузите файл получше."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={onDescribeInstead}>Указать вручную</Button>
                  {analysis.status === "error" ? (
                    <Button variant="secondary" onClick={retryAnalysis}>
                      Попробовать ещё раз
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {analysis.status === "done" && analysis.readable ? (
              <>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Eyebrow>Цвета</Eyebrow>
                    <span className="text-xs text-muted">Лишнее можно убрать, своё — добавить</span>
                  </div>
                  <ColorChips colors={data.hexColors} onChange={(hexColors) => update({ hexColors })} />
                </div>

                <hr className="h-px border-0 bg-[var(--color-line)]" />

                <div className="flex flex-col gap-3">
                  <Eyebrow>Шрифты</Eyebrow>
                  {analysis.fonts.length === 0 ? (
                    <p className="text-sm text-ink-soft">
                      Шрифты в файлах не узнали — подберём сами по настроению бренда.
                    </p>
                  ) : null}
                  {analysis.fonts.map((font) => {
                    const role = font.role === "body" ? "body" : "heading";
                    const chosen = data.preferredFonts[role] as BrandFontId | null;
                    if (font.available) {
                      return (
                        <div key={font.name} className="flex items-center justify-between gap-3 rounded-panel border border-line p-4">
                          <div>
                            <p className="text-sm font-medium text-ink" style={{ fontFamily: brandFontFamily(font.available) }}>
                              {brandFontLabel(font.available)}
                            </p>
                            <p className="text-xs text-muted">
                              {role === "body" ? "Основной текст" : "Заголовки"} · есть в наборе, подключим как есть
                            </p>
                          </div>
                          <Badge tone="ok">Подходит</Badge>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={font.name}
                        className="flex flex-col gap-3 rounded-panel border p-4"
                        style={{ backgroundColor: "var(--color-warning-soft)", borderColor: "var(--color-warning)" }}
                      >
                        <div className="flex items-start gap-3">
                          <Info aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-warning" />
                          <div>
                            <p className="text-sm font-semibold text-ink">В брендбуке — {font.name}</p>
                            <p className="text-[13px] text-ink-soft">
                              Его нельзя подключить на сайте, поэтому подобрали похожий
                              {chosen ? `: ${brandFontLabel(chosen)}` : ""}.
                            </p>
                          </div>
                        </div>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          <div className="rounded-panel border border-line bg-surface p-4">
                            <p className="text-xs text-muted">{font.name} · из брендбука</p>
                            <p className="mt-1 text-2xl font-semibold text-ink">{fontSample}</p>
                          </div>
                          {chosen ? (
                            <div className="rounded-panel border border-[var(--color-ink)] bg-surface p-4">
                              <p className="text-xs text-muted">{brandFontLabel(chosen)} · подобран</p>
                              <p className="mt-1 text-2xl text-ink" style={{ fontFamily: brandFontFamily(chosen) }}>
                                {fontSample}
                              </p>
                            </div>
                          ) : null}
                        </div>
                        {pickingFont ? (
                          <FontSelect
                            label="Шрифт вместо фирменного"
                            value={chosen}
                            onChange={(value) => {
                              update({ preferredFonts: { ...data.preferredFonts, [role]: value } });
                              setPickingFont(false);
                            }}
                          />
                        ) : (
                          <div className="flex flex-wrap items-center gap-3">
                            <Button variant="secondary" onClick={() => setPickingFont(true)}>
                              Выбрать другой
                            </Button>
                            <span className="text-xs text-muted">Заголовки и основной текст можно разделить позже</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </WizardCard>
        ) : null}
      </WizardBody>
      <WizardFoot onBack={onBack}>
        <NextButton onClick={onNext} disabled={!ready || uploading || analysis.status === "loading"} />
      </WizardFoot>
    </>
  );
}

// Образец для сравнения шрифтов: как в макете, название студии.
const fontSample = "Ваша студия";

// ——— 4.4 «Опишите свой стиль» ———

const swatches = [
  "#f6efe5", "#f0dfe3", "#e8b9c6", "#c98f93", "#8e4a55", "#5b2a4e",
  "#cdbfe8", "#9db39f", "#d0c0ae", "#c9a24f", "#23241f", "#1f3df0",
];

const moodColors: Record<string, [string, string, string]> = {
  Нежно: ["#f3dcdc", "#cdbfe8", "#fffaf6"],
  Дерзко: ["#d6176f", "#101840", "#ffffff"],
  Минимализм: ["#ffffff", "#23241f", "#d3c5b3"],
  Люкс: ["#12110f", "#c9a24f", "#f1eadb"],
  Натурально: ["#9db39f", "#e8dccd", "#f6efe5"],
  Ярко: ["#1f3df0", "#ffd23f", "#ffffff"],
  Строго: ["#23241f", "#656055", "#eee7dc"],
  Винтаж: ["#8e6c2f", "#c98f93", "#f5ecdb"],
};

function hueToHex(hue: number) {
  const s = 0.55;
  const l = 0.55;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function DescribeStep({
  data,
  update,
  addFiles,
  removeUpload,
  onBack,
  onNext,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  addFiles: (files: File[]) => void;
  removeUpload: (key: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const colors = data.hexColors.length > 0 ? data.hexColors : ["#"];
  const [active, setActive] = useState(0);
  const [hue, setHue] = useState(280);
  const photos = data.uploads.filter((item) => item.kind === "colorPhoto");

  const setColor = (index: number, value: string) => {
    const next = [...colors];
    next[index] = value.toLowerCase();
    update({ hexColors: next.filter((color) => color !== "#") });
  };
  const validCount = colors.filter((color) => hexPattern.test(color)).length;
  const hasAnything =
    validCount > 0 || data.colorWords.trim() !== "" || data.moods.length > 0 ||
    photos.some((item) => item.state.status === "uploaded");

  return (
    <>
      <WizardBody>
        <StepTitle
          eyebrow="Материалы · описание"
          title="Опишите свой стиль"
          sub="Подойдёт любой способ, а лучше несколько сразу. Ничего из этого не обязательно."
        />

        <WizardCard>
          <CardTitle
            title="Цвета кодом"
            sub="До 5 цветов в формате HEX"
            aside={<Badge>{validCount} из 5</Badge>}
          />
          <div className="grid gap-2.5 sm:grid-cols-4">
            {colors.map((color, index) => (
              <label key={index} className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink">Цвет {index + 1}</span>
                <span
                  className={cn(
                    "flex min-h-12 items-center gap-2.5 rounded-field border bg-[var(--ui-field-bg)] px-3",
                    active === index ? "border-[var(--color-accent-deep)] outline outline-2 outline-offset-1 outline-[var(--color-accent-deep)]" : "border-line",
                    color.length > 1 && !hexPattern.test(color) && "border-[var(--color-danger)]",
                  )}
                >
                  <span className="h-5 w-5 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: hexPattern.test(color) ? color : "transparent" }} />
                  <input
                    value={color}
                    onFocus={() => setActive(index)}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      setColor(index, raw.startsWith("#") ? raw : `#${raw}`);
                    }}
                    maxLength={7}
                    className="min-w-0 flex-1 bg-transparent font-mono text-xs uppercase text-ink outline-none"
                  />
                  <Pencil aria-hidden="true" size={14} className="text-ink-soft" />
                </span>
              </label>
            ))}
            {colors.length < 5 ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink">Ещё цвет</span>
                <button
                  type="button"
                  onClick={() => {
                    update({ hexColors: [...colors.filter((c) => c !== "#"), "#d0c0ae"] });
                    setActive(colors.length);
                  }}
                  className="flex min-h-12 items-center gap-2 rounded-field border border-dashed border-line px-3 text-sm text-ink-soft hover:bg-[var(--color-accent-soft)]"
                >
                  <Plus size={16} />
                  Добавить
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 rounded-panel border border-line bg-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Палитра</Eyebrow>
              <span className="text-xs text-muted">Для выбранного поля</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {swatches.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Цвет ${swatch}`}
                  onClick={() => setColor(Math.min(active, colors.length - 1), swatch)}
                  className={cn(
                    "h-9 w-9 rounded-full border border-black/15 transition hover:-translate-y-0.5",
                    colors[active] === swatch && "outline outline-2 outline-offset-2 outline-[var(--color-accent-deep)]",
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={360}
              value={hue}
              aria-label="Оттенок"
              onChange={(event) => {
                const next = Number(event.target.value);
                setHue(next);
                setColor(Math.min(active, colors.length - 1), hueToHex(next));
              }}
              className="h-2 w-full cursor-pointer appearance-none rounded-full"
              style={{
                background:
                  "linear-gradient(90deg,#e66 0%,#eb6 17%,#de6 33%,#6d9 50%,#6be 67%,#96e 83%,#e6b 100%)",
              }}
            />
          </div>
        </WizardCard>

        <WizardCard>
          <CardTitle title="Словами" sub="Что чувствуете, когда думаете о своём бренде" />
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">Опишите, как ощущается ваш бренд</span>
            <textarea
              value={data.colorWords}
              onChange={(event) => update({ colorWords: event.target.value })}
              maxLength={500}
              rows={3}
              placeholder="тёплый беж, немного золота, без розового"
              className="min-h-[88px] w-full rounded-field border border-line bg-[var(--ui-field-bg)] outline-none focus:border-[var(--color-accent-deep)] focus:shadow-[0_0_0_2px_var(--color-accent-deep)] px-4 py-3 text-[15px] text-ink placeholder:text-[var(--ui-placeholder)]"
            />
          </label>
          <p className="text-xs text-muted">Можно писать, чего не должно быть. Это тоже поможет.</p>
        </WizardCard>

        <WizardCard>
          <CardTitle title="Настроение" sub="Выберите всё, что подходит" />
          <div className="flex flex-wrap gap-2.5">
            {brandMoods.map((mood) => (
              <Chip
                key={mood}
                on={data.moods.includes(mood)}
                onClick={() =>
                  update({
                    moods: data.moods.includes(mood)
                      ? data.moods.filter((item) => item !== mood)
                      : [...data.moods, mood],
                  })
                }
              >
                <span aria-hidden="true" className="flex h-2.5 w-6 overflow-hidden rounded-full">
                  {moodColors[mood].map((color) => (
                    <i key={color} className="h-full flex-1" style={{ backgroundColor: color }} />
                  ))}
                </span>
                {mood}
              </Chip>
            ))}
          </div>
        </WizardCard>

        <WizardCard>
          <CardTitle title="Картинкой" sub="Фото вывески, интерьера или упаковки: возьмём из него цвета" />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <DropZone
              compact
              accept="image/png,image/jpeg,image/webp"
              onFiles={addFiles}
              title="Добавить фото"
              hint="PNG или JPG, до 20 МБ"
            />
            <div className="flex flex-col gap-2.5">
              {photos.map((item: UploadItem) => (
                <FileRow
                  key={item.key}
                  name={item.name}
                  size={formatBytes(item.size)}
                  isPdf={false}
                  state={item.state}
                  onRemove={() => removeUpload(item.key)}
                />
              ))}
            </div>
          </div>
        </WizardCard>
      </WizardBody>
      <WizardFoot onBack={onBack}>
        <NextButton
          onClick={onNext}
          disabled={!hasAnything || photos.some((item) => item.state.status === "uploading")}
        />
      </WizardFoot>
    </>
  );
}
