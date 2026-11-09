"use client";

import { useSyncExternalStore } from "react";
import { ButtonLink } from "@/components/ui/button";

// Кнопки шапки на страницах, которые отдаются готовым HTML (главная): сервер
// не читает куку сессии, иначе страница рендерилась бы заново на каждый
// запрос. Вошедшего мастера узнаём уже в браузере по куке Supabase и вместо
// «Войти / Начать бесплатно» показываем вход в кабинет. Это только подсказка
// в интерфейсе: сам кабинет по-прежнему проверяет сессию на сервере.
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/;

function hasSessionCookie() {
  return SESSION_COOKIE.test(document.cookie);
}

// Кука за время жизни страницы не меняется так, чтобы за этим стоило следить:
// вход и выход всегда идут с переходом на другую страницу.
function subscribe() {
  return () => {};
}

export function GuestHeaderActions() {
  const signedIn = useSyncExternalStore(subscribe, hasSessionCookie, () => false);

  if (signedIn) {
    return <ButtonLink href="/dashboard">В кабинет</ButtonLink>;
  }

  return (
    <>
      <ButtonLink href="/login" variant="ghost">
        Войти
      </ButtonLink>
      <ButtonLink href="/register">Начать бесплатно</ButtonLink>
    </>
  );
}
