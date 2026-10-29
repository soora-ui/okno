"use client";

import { brandFontLabel } from "@/components/brand-theme/brand-fonts";
import type { WizardData, WizardStep } from "@/components/brand-style/state";
import { Badge, StepTitle, WizardCard } from "@/components/brand-style/ui";
import { WizardBody, WizardFoot } from "@/components/brand-style/wizard";
import { Button } from "@/components/ui/button";
import type { BrandFontId } from "@/lib/brand-theme/schema";

// 4.6 «Всё готово к созданию»: пожелания и сводка того, что уйдёт в генерацию.

function pluralImages(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "изображение";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "изображения";
  return "изображений";
}

export function ReviewStep({
  data,
  update,
  generationsLeft,
  onEdit,
  onBack,
  onGenerate,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  generationsLeft: number;
  onEdit: (step: WizardStep) => void;
  onBack: () => void;
  onGenerate: () => void;
}) {
  const ok = (kind: string) =>
    data.uploads.filter((item) => item.kind === kind && item.state.status === "uploaded");
  const files = [...ok("brandbook"), ...ok("colorPhoto")];
  const logo = data.uploads.find((item) => item.material?.id === data.logoId);
  const examples = ok("example");
  const materialsStep: WizardStep = data.path ?? "choice";

  const fonts = (["heading", "body"] as const)
    .map((role) => data.preferredFonts[role])
    .filter((font): font is string => Boolean(font))
    .map((font) => brandFontLabel(font as BrandFontId));
  const sourceFonts =
    data.analysis.status === "done"
      ? data.analysis.fonts.filter((font) => !font.available).map((font) => font.name)
      : [];

  const rows: { label: string; content: React.ReactNode; step: WizardStep }[] = [];
  if (files.length > 0) {
    rows.push({ label: "Файлы", content: files.map((item) => item.name).join(", "), step: materialsStep });
  }
  if (data.hexColors.length > 0) {
    rows.push({
      label: "Цвета",
      step: materialsStep,
      content: (
        <span className="flex gap-1.5">
          {data.hexColors.map((color) => (
            <span key={color} title={color} className="h-5 w-5 rounded-full border border-black/15" style={{ backgroundColor: color }} />
          ))}
        </span>
      ),
    });
  }
  if (fonts.length > 0) {
    rows.push({
      label: "Шрифты",
      step: materialsStep,
      content: `${[...new Set(fonts)].join(", ")}${sourceFonts.length > 0 ? ` вместо ${sourceFonts.join(", ")}` : ""}`,
    });
  }
  if (data.colorWords.trim()) {
    rows.push({ label: "Словами", content: `«${data.colorWords.trim()}»`, step: "describe" });
  }
  if (data.moods.length > 0) {
    rows.push({
      label: "Настроение",
      step: "describe",
      content: (
        <span className="flex flex-wrap gap-1.5">
          {data.moods.map((mood) => (
            <Badge key={mood} tone="sage">
              {mood}
            </Badge>
          ))}
        </span>
      ),
    });
  }
  if (logo) rows.push({ label: "Логотип", content: logo.name, step: "logo" });
  if (examples.length > 0) {
    rows.push({ label: "Примеры", content: `${examples.length} ${pluralImages(examples.length)}`, step: "logo" });
  }

  return (
    <>
      <WizardBody>
        <StepTitle
          eyebrow="Пожелания"
          title="Всё готово к созданию"
          sub="Проверьте, что мы будем использовать. Любой пункт можно поправить."
        />
        <WizardCard>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">
              Как вы хотите, чтобы выглядела страница? <span className="text-xs font-normal text-muted">Необязательно</span>
            </span>
            <textarea
              value={data.wishes}
              onChange={(event) => update({ wishes: event.target.value })}
              maxLength={1000}
              rows={3}
              placeholder="Например: больше воздуха, заголовки покрупнее, без тёмных цветов"
              className="min-h-[88px] w-full rounded-field border border-line bg-[var(--ui-field-bg)] outline-none focus:border-[var(--color-accent-deep)] focus:shadow-[0_0_0_2px_var(--color-accent-deep)] px-4 py-3 text-[15px] text-ink placeholder:text-[var(--ui-placeholder)]"
            />
          </label>
        </WizardCard>

        <WizardCard className="gap-0">
          <h2 className="pb-3 text-xl font-semibold tracking-[-0.01em] text-ink">Что загружено</h2>
          {rows.length === 0 ? (
            <p className="border-t border-line py-4 text-sm text-ink-soft">
              Пока ничего — вернитесь к материалам или опишите стиль словами.
            </p>
          ) : null}
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 border-t border-line py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">{row.label}</span>
                <span className="min-w-0 truncate text-sm text-ink">{row.content}</span>
              </div>
              <Button variant="ghost" onClick={() => onEdit(row.step)} className="shrink-0 px-3">
                Изменить
              </Button>
            </div>
          ))}
        </WizardCard>

        <label className="flex cursor-pointer items-center gap-3 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={data.rightsAccepted}
            onChange={(event) => update({ rightsAccepted: event.target.checked })}
            className="h-5 w-5 accent-[var(--color-accent-deep)]"
          />
          У меня есть права на загруженные материалы
        </label>
      </WizardBody>
      <WizardFoot onBack={onBack}>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={onGenerate} disabled={!data.rightsAccepted || rows.length === 0} className="disabled:opacity-40">
            Создать варианты палитры
          </Button>
          <span className="text-[11px] text-muted">
            {generationsLeft > 0 ? "Спишется 1 генерация из 3" : "Бесплатные генерации закончились"}
          </span>
        </div>
      </WizardFoot>
    </>
  );
}
