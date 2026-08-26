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
}: {
  demoName: string;
  demoSpecialty: string;
  demoBio: string;
  services: PreviewService[];
  bookHref: string;
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

  return (
    <Card className="overflow-hidden p-0">
      <div className="m-4 rounded-nested border border-line bg-panel p-5">
        <p className="text-sm text-muted">Соберите свою страницу записи</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

      <div className="space-y-4 px-4 pb-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">
          Так увидит клиент
        </p>
        <div className="rounded-nested border border-line p-4">
          <p className="text-xl font-semibold text-ink">{previewName}</p>
          <p className="mt-1 text-sm leading-6 text-ink-soft">{previewBio}</p>
        </div>
        {services.map((service) => (
          <div key={service.id} className="rounded-nested border border-line p-4">
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
          </div>
        ))}
        <ButtonLink
          href={bookHref}
          variant="secondary"
          className="w-full justify-center"
        >
          Записаться онлайн
        </ButtonLink>
      </div>
    </Card>
  );
}
