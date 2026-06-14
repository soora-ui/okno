import { BriefcaseBusiness, MessageCircleMore, Users2 } from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/components/forms/login-form";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    reason?: string;
  }>;
};

function getLoginHint(reason?: string) {
  if (reason === "setup") {
    return "Рабочий кабинет пока не настроен: подключи рабочие ключи Supabase или переключи APP_MODE в demo.";
  }

  if (reason === "disabled") {
    return "Этот кабинет сейчас отключен администратором. Если доступ нужен снова, его нужно включить в админке студии.";
  }

  if (reason === "auth") {
    return "Чтобы открыть кабинет, войди в аккаунт еще раз.";
  }

  return null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hint = getLoginHint(params.reason);

  return (
    <SiteShell compact resolveAuth={false}>
      <div className="mx-auto flex max-w-xl justify-center py-12">
        <Card className="w-full space-y-5">
          <div className="space-y-2">
            <h1 className="text-center text-4xl font-semibold text-ink">
              Вход в okno
            </h1>
            <p className="text-center text-sm leading-6 text-ink-soft">
              Администраторы и сотрудники входят по email и паролю, а система сама откроет нужный кабинет.
            </p>
          </div>
          {hint ? (
            <div className="rounded-[20px] border border-line bg-panel px-4 py-3 text-sm leading-6 text-ink-soft">
              {hint}
            </div>
          ) : null}
          <LoginForm redirectTo={params.next} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] border border-line bg-panel px-4 py-4">
              <div className="flex items-center gap-2 text-ink">
                <BriefcaseBusiness size={16} />
                <p className="text-sm font-medium">Администратор</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Видит сотрудников, ближайшие записи, общую клиентскую базу и настройки студии.
              </p>
            </div>
            <div className="rounded-[20px] border border-line bg-panel px-4 py-4">
              <div className="flex items-center gap-2 text-ink">
                <Users2 size={16} />
                <p className="text-sm font-medium">Сотрудник</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Работает в своем личном кабинете и видит только свои записи, услуги и клиентов.
              </p>
            </div>
          </div>
          <div className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line bg-surface px-5 py-3 text-sm font-medium text-ink">
            <MessageCircleMore size={16} className="mr-2" />
            Войти через Telegram
          </div>
          <ButtonLink href="/register" variant="ghost" className="w-full px-0">
            Создать аккаунт
          </ButtonLink>
        </Card>
      </div>
    </SiteShell>
  );
}
