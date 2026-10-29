"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, RotateCcw, TriangleAlert } from "lucide-react";
import { saveManualBrandThemeAction } from "@/app/actions/brand-theme";
import { brandFontFamily, brandFontLabel } from "@/components/brand-theme/brand-fonts";
import { PhoneMock, type MockMaster } from "@/components/brand-style/phone-mock";
import { Badge, Switch } from "@/components/brand-style/ui";
import { WizardFoot } from "@/components/brand-style/wizard";
import { Button } from "@/components/ui/button";
import { brandThemeContrastIssues, fixBrandThemeContrast } from "@/lib/brand-theme/contrast";
import type { BrandThemeVersion } from "@/lib/brand-theme/drafts";
import {
  brandFontIds,
  type BrandDecorSlot,
  type BrandFontId,
  type BrandTheme,
  type BrandThemeColors,
} from "@/lib/brand-theme/schema";

// 4.12 «Ручная настройка»: генерации не тратит. Превью — мгновенная
// миниатюра; настоящая страница — после «Готово», в превью (4.10).

const colorRoles: [keyof BrandThemeColors, string][] = [
  ["background", "Фон страницы"],
  ["card", "Карточки"],
  ["panel", "Панели"],
  ["ink", "Основной текст"],
  ["inkSoft", "Вторичный текст"],
  ["muted", "Подписи"],
  ["line", "Линии"],
  ["accent", "Акцент"],
  ["accentSoft", "Подложка акцента"],
  ["accentDeep", "Насыщенный акцент"],
  ["button", "Кнопка"],
  ["buttonText", "Текст на кнопке"],
  ["secondary", "Второстепенные кнопки"],
  ["decor1", "Цвет декора"],
  ["decor2", "Второй цвет декора"],
];

const decorSlots: [BrandDecorSlot, string][] = [
  ["hero", "Фон шапки"],
  ["avatar", "Рамка вокруг аватара"],
  ["dividers", "Разделители секций"],
  ["cards", "Уголки карточек"],
  ["cta", "Подложка кнопки «Записаться»"],
  ["footer", "Узор в подвале"],
];

// Один ползунок «Острые ↔ Круглые» двигает все три скругления согласованно.
function roundnessOf(theme: BrandTheme) {
  return Math.round((theme.radius.card / 40) * 100);
}

function radiusFor(value: number): BrandTheme["radius"] {
  const card = Math.round((value / 100) * 40);
  return {
    card,
    button: value >= 70 ? 999 : Math.round(card * 0.6),
    image: Math.round(card * 0.7),
  };
}

function ratioText(value: number) {
  return value.toFixed(1).replace(".", ",");
}

export function ManualScreen({
  base,
  master,
  onCancel,
  onSaved,
}: {
  base: BrandThemeVersion;
  master: MockMaster;
  onCancel: () => void;
  onSaved: (variant: BrandThemeVersion) => void;
}) {
  const [theme, setTheme] = useState<BrandTheme>(base.theme);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const issues = useMemo(() => brandThemeContrastIssues(theme), [theme]);

  const setColor = (role: keyof BrandThemeColors, value: string) =>
    setTheme((current) => ({ ...current, colors: { ...current.colors, [role]: value.toLowerCase() } }));

  const save = () =>
    startSave(async () => {
      setError(null);
      const result = await saveManualBrandThemeAction({ parentId: base.id, tokens: theme });
      if (result.success && result.themeId) {
        onSaved({
          ...base,
          id: result.themeId,
          status: "draft",
          name: "Ручная настройка",
          explanation: `Ваши правки поверх варианта «${base.name}».`,
          theme,
          contrastFixes: [],
          createdAt: new Date().toISOString(),
          appliedAt: null,
        });
      } else {
        setError(result.message);
      }
    });

  return (
    <>
      <main className="flex flex-1 flex-col lg:flex-row">
        <div className="flex flex-col items-center gap-3 px-4 py-6 lg:flex-1 lg:py-10">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink">Ручная настройка</h1>
            <Badge tone="ok">Не тратит генерации</Badge>
          </div>
          <PhoneMock theme={theme} scope="manual" master={master} width={300} height={560} className="lg:sticky lg:top-24" />
        </div>

        <aside className="flex flex-col gap-7 border-line bg-surface px-4 py-6 sm:px-6 lg:w-[400px] lg:border-l">
          <section className="flex flex-col">
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-lg font-semibold text-ink">Цвета</h2>
              {issues.length > 0 ? (
                <Badge tone="warn">
                  {issues.length} {issues.length === 1 ? "предупреждение" : issues.length < 5 ? "предупреждения" : "предупреждений"}
                </Badge>
              ) : null}
            </div>
            {colorRoles.map(([role, label]) => {
              const issue = issues.find((item) => item.adjust === role);
              return (
                <div key={role} className="border-t border-line">
                  <label className="flex cursor-pointer items-center gap-3 py-2.5">
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-black/15" style={{ backgroundColor: theme.colors[role] }}>
                      <input
                        type="color"
                        value={theme.colors[role]}
                        onChange={(event) => setColor(role, event.target.value)}
                        aria-label={label}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm text-ink">{label}</span>
                      <span className="font-mono text-[11px] uppercase text-muted">{theme.colors[role]}</span>
                    </span>
                    <Pencil aria-hidden="true" size={14} className="text-ink-soft" />
                  </label>
                  {issue ? (
                    <div className="mb-2.5 flex flex-col gap-2.5 rounded-panel border p-3" style={{ backgroundColor: "var(--color-warning-soft)", borderColor: "var(--color-warning)" }}>
                      <p className="flex items-start gap-2 text-xs text-ink">
                        <TriangleAlert aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-warning" />
                        <span>
                          <b>{issue.label} плохо читается.</b> Контраст {ratioText(issue.ratio)} : 1, а нужно не меньше 4,5 : 1.
                        </span>
                      </p>
                      <div>
                        <Button variant="secondary" className="min-h-9 px-3 py-1" onClick={() => setTheme((current) => fixBrandThemeContrast(current).theme)}>
                          Исправить автоматически
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-ink">Шрифты</h2>
            {(["heading", "body"] as const).map((role) => (
              <label key={role} className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink">{role === "heading" ? "Заголовки" : "Основной текст"}</span>
                <select
                  value={theme.fonts[role]}
                  onChange={(event) =>
                    setTheme((current) => ({
                      ...current,
                      fonts: { ...current.fonts, [role]: event.target.value as BrandFontId },
                    }))
                  }
                  className="min-h-12 w-full rounded-field border border-line bg-[var(--ui-field-bg)] outline-none focus:border-[var(--color-accent-deep)] focus:shadow-[0_0_0_2px_var(--color-accent-deep)] px-4 text-[15px] text-ink"
                >
                  {brandFontIds
                    .filter((id) => role === "heading" || id !== "caveat")
                    .map((id) => (
                      <option key={id} value={id}>
                        {brandFontLabel(id)}
                      </option>
                    ))}
                </select>
                <span
                  className={role === "heading" ? "text-xl text-ink" : "text-sm text-ink-soft"}
                  style={{ fontFamily: brandFontFamily(theme.fonts[role]) }}
                >
                  {role === "heading" ? master.name : `${master.services[0]?.title ?? "Маникюр с покрытием"}, ${master.services[0]?.meta ?? "2 часа"}`}
                </span>
              </label>
            ))}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-ink">Скругления</h2>
            <input
              type="range"
              min={0}
              max={100}
              value={roundnessOf(theme)}
              aria-label="Скругления"
              onChange={(event) => setTheme((current) => ({ ...current, radius: radiusFor(Number(event.target.value)) }))}
              className="w-full accent-[var(--color-accent-deep)]"
            />
            <div className="flex justify-between text-xs text-muted">
              <span>Острые</span>
              <span>Круглые</span>
            </div>
          </section>

          <section className="flex flex-col">
            <h2 className="pb-2 text-lg font-semibold text-ink">Декор</h2>
            {decorSlots.map(([slot, label]) => (
              <div key={slot} className="flex items-center justify-between gap-3 border-t border-line py-2.5">
                <span className="text-sm text-ink">{label}</span>
                <Switch
                  label={label}
                  on={theme.decorSlots[slot]}
                  onChange={(on) => setTheme((current) => ({ ...current, decorSlots: { ...current.decorSlots, [slot]: on } }))}
                />
              </div>
            ))}
            <div className="flex flex-col gap-1 border-t border-line pt-3">
              <div className="flex items-center justify-between text-sm text-ink">
                <span>Интенсивность декора</span>
                <span className="text-xs text-muted">{theme.decorIntensity}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={theme.decorIntensity}
                aria-label="Интенсивность декора"
                onChange={(event) => setTheme((current) => ({ ...current, decorIntensity: Number(event.target.value) }))}
                className="w-full accent-[var(--color-accent-deep)]"
              />
            </div>
          </section>

          <div>
            <Button variant="secondary" className="gap-2" onClick={() => setTheme(base.theme)}>
              <RotateCcw size={16} />
              Сбросить к сгенерированному
            </Button>
          </div>
          {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        </aside>
      </main>
      <WizardFoot onBack={onCancel}>
        <Button onClick={save} disabled={saving}>
          {saving ? "Сохраняем…" : "Готово"}
        </Button>
      </WizardFoot>
    </>
  );
}
