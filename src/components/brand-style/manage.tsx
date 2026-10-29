"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetBrandThemeAction, applyBrandThemeAction } from "@/app/actions/brand-theme";
import { BrandApiError, deleteMaterial, uploadMaterial } from "@/components/brand-style/api";
import { PhoneMock, type MockMaster } from "@/components/brand-style/phone-mock";
import { Badge, GenerationsCounter, formatBytes } from "@/components/brand-style/ui";
import { Button, ButtonLink } from "@/components/ui/button";
import type { BrandThemeVersion } from "@/lib/brand-theme/drafts";
import type { BrandMaterialKind } from "@/lib/brand-theme/materials";
import type { StoredBrandMaterial } from "@/lib/brand-theme/storage";

const kindLabel: Record<BrandMaterialKind, string> = {
  brandbook: "Брендбук",
  logo: "Логотип",
  example: "Пример",
  colorPhoto: "Фото с цветами",
};

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDay(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(iso))
    .replace(/\s?г\.$/, "");
}

export function ManageBrandStyle({
  versions,
  materials: initialMaterials,
  generationsLeft,
  hasAccess,
  appliedAt,
  master,
}: {
  versions: BrandThemeVersion[];
  materials: StoredBrandMaterial[];
  generationsLeft: number;
  hasAccess: boolean;
  appliedAt: string | null;
  master: MockMaster;
}) {
  const router = useRouter();
  const [materials, setMaterials] = useState(initialMaterials);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Номера версий — по порядку создания: первая сгенерированная — «Версия 1».
  const ordered = [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const numberOf = (id: string) => ordered.findIndex((version) => version.id === id) + 1;
  const active = versions.find((version) => version.status === "active") ?? null;
  const history = versions.slice(0, 9);

  const run = (action: () => Promise<{ success: boolean; message: string }>) =>
    startTransition(async () => {
      const result = await action();
      setNotice(result.message);
      if (result.success) router.refresh();
    });

  const examples = materials.filter((item) => item.kind === "example");
  const singles = materials.filter((item) => item.kind !== "example");

  const replace = async (material: StoredBrandMaterial, file: File) => {
    try {
      const next = await uploadMaterial(material.kind, file, () => undefined);
      await deleteMaterial(material.id);
      setMaterials((current) => current.map((item) => (item.id === material.id ? next : item)));
      setNotice("Файл заменён. Новый стиль соберётся уже с ним.");
    } catch (error) {
      setNotice(error instanceof BrandApiError ? error.message : "Не получилось заменить файл.");
    }
  };

  const remove = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => deleteMaterial(id)));
      setMaterials((current) => current.filter((item) => !ids.includes(item.id)));
    } catch (error) {
      setNotice(error instanceof BrandApiError ? error.message : "Не получилось удалить файл.");
    }
  };

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 py-6">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Настройки · Запись · Оформление страницы</span>
        <h1 className="text-[30px] font-semibold tracking-[-0.025em] text-ink">Фирменный стиль</h1>
      </div>

      {!hasAccess ? (
        <p className="rounded-panel border p-4 text-sm text-ink" style={{ backgroundColor: "var(--color-warning-soft)", borderColor: "var(--color-warning)" }}>
          Тариф закончился: стиль остаётся на странице записи, но менять его можно после продления.
        </p>
      ) : null}

      <section className="flex flex-col gap-6 rounded-card border border-line bg-surface p-6 shadow-card sm:flex-row sm:items-center">
        {active ? (
          <>
            <PhoneMock theme={active.theme} scope="manage-active" master={master} width={150} height={270} className="self-center" />
            <div className="flex flex-1 flex-col gap-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="ok">Активен</Badge>
                {formatDay(appliedAt ?? active.appliedAt) ? (
                  <span className="text-xs text-muted">Применён {formatDay(appliedAt ?? active.appliedAt)}</span>
                ) : null}
              </div>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
                Версия {numberOf(active.id)} · «{active.name}»
              </h2>
              <p className="text-sm text-ink-soft">Так сейчас выглядит ваша страница записи для клиентов.</p>
              <div>
                <GenerationsCounter left={generationsLeft} label={`Осталось ${generationsLeft} генерации из 3`} />
              </div>
              <div className="flex flex-wrap gap-3">
                {hasAccess ? (
                  <ButtonLink href={`/brand-style?manual=${active.id}`} variant="secondary">
                    Настроить вручную
                  </ButtonLink>
                ) : null}
                <Button variant="ghost" disabled={pending} onClick={() => run(resetBrandThemeAction)}>
                  Вернуть стандартный пресет
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col gap-3">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Фирменный стиль не применён</h2>
            <p className="text-sm text-ink-soft">
              {versions.length > 0
                ? "Ниже — варианты, которые вы уже собрали. Любой можно посмотреть и применить."
                : "Загрузите брендбук или опишите стиль словами — соберём оформление вашей страницы записи."}
            </p>
            {hasAccess && versions.length === 0 ? (
              <div>
                <ButtonLink href="/brand-style">Создать фирменный стиль</ButtonLink>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {notice ? (
        <p role="status" className="text-sm text-ink-soft">
          {notice}
        </p>
      ) : null}

      {history.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold text-ink">История версий</h2>
            <span className="text-xs text-muted">Предыдущие варианты сохраняются</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {history.map((version) => (
              <article key={version.id} className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-3">
                <div className="flex gap-3">
                  <PhoneMock theme={version.theme} scope={`hist-${version.id.slice(0, 8)}`} master={master} width={80} height={140} frame={false} className="overflow-hidden rounded-[14px] border border-line" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-semibold text-ink">Версия {numberOf(version.id)}</span>
                    <span className="truncate text-xs text-ink-soft">{version.name}</span>
                    <span className="text-xs text-muted">{formatDateTime(version.createdAt)}</span>
                    <span>
                      {version.status === "active" ? (
                        <Badge tone="ok">Активна</Badge>
                      ) : version.status === "draft" ? (
                        <Badge tone="warn">Черновик</Badge>
                      ) : (
                        <Badge>Предыдущая</Badge>
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <ButtonLink href={`/brand-style?theme=${version.id}`} variant="secondary" className="flex-1">
                    Посмотреть
                  </ButtonLink>
                  <Button
                    className="flex-1"
                    disabled={!hasAccess || pending || version.status === "active"}
                    onClick={() => run(() => applyBrandThemeAction(version.id))}
                  >
                    Применить
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {materials.length > 0 ? (
        <section className="flex flex-col rounded-card border border-line bg-surface p-6 shadow-card">
          <div className="flex items-baseline justify-between gap-3 pb-3">
            <h2 className="text-xl font-semibold text-ink">Загруженные материалы</h2>
            <span className="text-xs text-muted">Заменить можно в любой момент</span>
          </div>
          {singles.map((material) => (
            <div key={material.id} className="flex items-center justify-between gap-3 border-t border-line py-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-ink">{material.name}</span>
                <span className="text-xs text-muted">
                  {kindLabel[material.kind]} · {formatBytes(material.sizeBytes)}
                  {material.moderation === "rejected" ? " · не прошёл проверку" : ""}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-medium text-ink hover:bg-[var(--color-panel)]">
                  Заменить
                  <input
                    type="file"
                    className="sr-only"
                    accept={material.kind === "logo" ? "image/png,image/svg+xml" : material.kind === "brandbook" ? "application/pdf,image/png,image/jpeg" : "image/png,image/jpeg,image/webp"}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void replace(material, file);
                    }}
                  />
                </label>
                <Button variant="ghost" className="text-[var(--color-danger)]" onClick={() => void remove([material.id])}>
                  Удалить
                </Button>
              </div>
            </div>
          ))}
          {examples.length > 0 ? (
            <div className="flex items-center justify-between gap-3 border-t border-line py-3">
              <div className="flex flex-col">
                <span className="text-sm text-ink">Примеры оформления</span>
                <span className="text-xs text-muted">{examples.length} изображ.</span>
              </div>
              <Button variant="ghost" className="text-[var(--color-danger)]" onClick={() => void remove(examples.map((item) => item.id))}>
                Удалить
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {hasAccess ? (
        <section className="flex flex-col gap-4 rounded-panel border border-accent bg-accent-soft p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Новые материалы или другой бренд?</p>
            <p className="text-xs text-ink-soft">Создайте стиль заново. Текущий останется в истории.</p>
          </div>
          <ButtonLink href="/brand-style">Создать новый стиль</ButtonLink>
        </section>
      ) : null}
    </div>
  );
}
