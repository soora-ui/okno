"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { publicLinkHost, suggestUsername } from "@/lib/site";

type PreviewService = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  price: number;
};

// Ссылку собираем тем же suggestUsername, что и форма регистрации: если бы
// здесь была своя логика, посетитель увидел бы в героe один адрес, а после
// регистрации получил другой — обещание, которое мы сами и нарушили бы.
export function HeroLinkBuilder({
  demoName,
  demoSpecialty,
  demoBio,
  services,
  bookHref,
  layout = "column",
}: {
  demoName: string;
  demoSpecialty: string;
  demoBio: string;
  services: PreviewService[];
  bookHref: string;
  /** column — узкая колонка; wide — на всю ширину: форма слева, превью справа. */
  layout?: "column" | "wide";
}) {
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("");

  const filled = fullName.trim().length > 0 || specialty.trim().length > 0;
  const username = useMemo(
    () => suggestUsername(fullName, specialty),
    [fullName, specialty],
  );

  // Пока поля пустые, карточка остаётся демо-профилем: пустая заготовка не
  // объясняет, что вообще получится на выходе.
  const previewName = filled ? fullName.trim() || "Ваше имя" : demoName;
  const previewBio = filled ? specialty.trim() || demoSpecialty : demoBio;

  const registerHref = filled
    ? `/register?mode=solo&name=${encodeURIComponent(fullName.trim())}&specialty=${encodeURIComponent(specialty.trim())}`
    : "/register?mode=solo";

  const wide = layout === "wide";

  const form = (
    <div
      className={`rounded-nested border border-line bg-panel p-5 ${
        wide ? "flex h-full flex-col justify-center lg:p-8" : "m-4"
      }`}
    >
      {wide ? (
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted">
            Твоя страница записи
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Соберите свою страницу за минуту
          </h2>
          <p className="text-sm leading-6 text-ink-soft">
            Впишите имя и нишу — ссылка и превью страницы соберутся сразу.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">Соберите свою страницу записи</p>
      )}
      <div className={`grid gap-3 sm:grid-cols-2 ${wide ? "mt-6" : "mt-4"}`}>
        <Input
          label="Как вас зовут"
          placeholder="Алина"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="off"
        />
        <Input
          label="Ниша"
          placeholder="Маникюр и брови"
          value={specialty}
          onChange={(event) => setSpecialty(event.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="mt-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">
          Ваша ссылка
        </p>
        <p className="mt-1 break-all text-lg font-medium text-ink">
          {publicLinkHost}/{username || "ваша-ссылка"}
        </p>
      </div>
      <ButtonLink
        href={registerHref}
        className="mt-4 w-full justify-center gap-2"
      >
        {filled ? "Занять ссылку и начать" : "Начать бесплатно"}
        <ArrowRight size={16} />
      </ButtonLink>
    </div>
  );

  const preview = (
    <div className={`space-y-4 ${wide ? "" : "px-4 pb-4"}`}>
      <p className="text-xs uppercase tracking-[0.18em] text-muted">
        Так увидит клиент
      </p>
      <div className="rounded-nested border border-line p-4">
        <p className="text-xl font-semibold text-ink">{previewName}</p>
        <p className="mt-1 text-sm leading-6 text-ink-soft">{previewBio}</p>
      </div>
      <div className={wide ? "grid gap-4 md:grid-cols-3" : "space-y-4"}>
        {services.map((service) => (
          <div
            key={service.id}
            className={`rounded-nested border border-line p-4 ${wide ? "flex h-full flex-col" : ""}`}
          >
            {wide ? (
              <>
                <p className="font-medium text-ink">{service.title}</p>
                <p className="mt-1 flex-1 text-sm leading-6 text-muted">{service.description}</p>
                <p className="mt-3 text-sm text-ink-soft">
                  {service.durationMinutes} мин · {service.price} ₽
                </p>
              </>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-medium text-ink">{service.title}</p>
                  <p className="text-sm leading-6 text-muted">
                    {service.description}
                  </p>
                </div>
                <div className="shrink-0 whitespace-nowrap text-right text-sm text-ink-soft">
                  <p>{service.durationMinutes} мин</p>
                  <p>{service.price} ₽</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <ButtonLink
        href={bookHref}
        variant="secondary"
        className="w-full justify-center"
      >
        Записаться онлайн
      </ButtonLink>
    </div>
  );

  if (wide) {
    return (
      <Card className="overflow-hidden p-4 sm:p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-8">
          {form}
          <div className="lg:py-3 lg:pr-3">{preview}</div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      {form}
      {preview}
    </Card>
  );
}
