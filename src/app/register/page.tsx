import Link from "next/link";
import { Building2, CheckCircle2, Link2, Users2 } from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RegisterForm } from "@/components/forms/register-form";
import { publicLinkHost } from "@/lib/site";
import { normalizeReferralCode } from "@/lib/referral";
import { parseAccountMode } from "@/lib/account-modes";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    ref?: string;
    mode?: string;
    name?: string;
    specialty?: string;
  }>;
}) {
  const query = await searchParams;
  const referralCode = normalizeReferralCode(query.ref);
  // Развилка в герое лендинга уже спросила формат работы — переспрашивать с
  // нуля незачем, поэтому приходим на нужную карточку заранее выбранной.
  const initialAccountMode = parseAccountMode(query.mode);
  // Имя и ниша приходят из конструктора ссылки в героe. Значения из адресной
  // строки могут быть какими угодно, поэтому обрезаем до длины живого поля.
  const prefill = (value: string | undefined) => (value ?? "").trim().slice(0, 80);
  const initialFullName = prefill(query.name);
  const initialSpecialty = prefill(query.specialty);

  return (
    <SiteShell compact resolveAuth={false} showFooter>
      <div className="mx-auto flex max-w-3xl justify-center py-10">
        <div className="w-full space-y-6">
          <Card className="space-y-5">
            <div className="space-y-2">
              <h1 className="text-center text-4xl font-semibold text-ink">
                Регистрация
              </h1>
              <p className="text-center text-sm leading-6 text-ink-soft">
                Можно стартовать как один мастер или сразу открыть рабочее пространство для команды.
              </p>
            </div>
            <RegisterForm
              referralCode={referralCode}
              initialAccountMode={initialAccountMode}
              initialFullName={initialFullName}
              initialSpecialty={initialSpecialty}
            />
            {/* Оферта считает акцептом завершение регистрации — значит, момент
                принятия условий должен быть виден прямо здесь. */}
            {/* Оферта (п. 3.6) требует подтверждения, что мастер ознакомился и
                с Правилами, а Согласие берётся отдельным действием — ссылки на
                оба документа должны быть здесь же. */}
            <p className="text-center text-xs leading-5 text-muted">
              Создавая аккаунт, вы принимаете{" "}
              <Link
                href="/legal/offer"
                className="underline underline-offset-4 transition hover:text-ink"
              >
                публичную оферту
              </Link>
              ,{" "}
              <Link
                href="/legal/rules"
                className="underline underline-offset-4 transition hover:text-ink"
              >
                правила использования сервиса
              </Link>{" "}
              и{" "}
              <Link
                href="/legal/consent"
                className="underline underline-offset-4 transition hover:text-ink"
              >
                согласие на обработку персональных данных
              </Link>
              , а также подтверждаете, что ознакомились с{" "}
              <Link
                href="/legal/privacy"
                className="underline underline-offset-4 transition hover:text-ink"
              >
                политикой обработки персональных данных
              </Link>
              .
            </p>
          </Card>

          <Card className="space-y-4 bg-panel">
            <div className="rounded-nested border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <Link2 size={18} className="text-accent-deep" />
                <p className="font-medium text-ink">{publicLinkHost}/ваша-ссылка</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                У мастера сразу появится рабочая ссылка для клиентов, а у студии откроется отдельная админка.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Профиль мастера", icon: CheckCircle2 },
                { label: "Команда и роли", icon: Users2 },
                { label: "Студия под контролем", icon: Building2 },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-panel bg-surface px-4 py-3">
                  <item.icon size={18} className="shrink-0 text-success" />
                  <p className="text-sm text-ink-soft">{item.label}</p>
                </div>
              ))}
            </div>
            <ButtonLink href="/login" variant="ghost" className="w-full">
              У меня уже есть аккаунт
            </ButtonLink>
          </Card>
        </div>
      </div>
    </SiteShell>
  );
}
