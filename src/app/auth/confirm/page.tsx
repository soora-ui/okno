import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmLinkForm } from "@/components/forms/email-auth-forms";
import { isConfirmLinkType, type ConfirmLinkType } from "@/lib/auth/email-hook";

export const metadata: Metadata = {
  title: "Подтверждение — okno",
  robots: { index: false, follow: false },
  // Токен из ссылки не должен уходить на сторонние сайты в Referer.
  referrer: "no-referrer",
};

type ConfirmPageProps = {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
};

const copy: Record<ConfirmLinkType, { title: string; lead: string; button: string }> = {
  signup: {
    title: "Подтверждение почты",
    lead: "Остался один шаг — подтверди почту, и можно входить в кабинет.",
    button: "Подтвердить почту",
  },
  recovery: {
    title: "Сброс пароля",
    lead: "Нажми кнопку — и задашь новый пароль от кабинета.",
    button: "Задать новый пароль",
  },
  email_change: {
    title: "Смена почты",
    lead: "Подтверди адрес, чтобы входить в кабинет с новой почтой.",
    button: "Подтвердить",
  },
};

// Ссылка из письма открывает эту страницу, а токен тратится только по кнопке:
// почтовые сканеры заранее открывают ссылки и иначе сжигали бы его сами.
export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const params = await searchParams;
  const type = params.type;
  const tokenHash = params.token_hash ?? "";
  const isValid = isConfirmLinkType(type) && tokenHash.length > 0;

  return (
    <SiteShell compact resolveAuth={false} showFooter>
      <div className="mx-auto flex max-w-xl justify-center py-12">
        <Card className="w-full space-y-5">
          <div className="space-y-2">
            <h1 className="text-center text-4xl font-semibold text-ink">
              {isValid ? copy[type].title : "Ссылка неполная"}
            </h1>
            <p className="text-center text-sm leading-6 text-ink-soft">
              {isValid
                ? copy[type].lead
                : "Похоже, ссылка обрезалась. Открой её из письма ещё раз или скопируй целиком."}
            </p>
          </div>
          {isValid ? (
            <ConfirmLinkForm tokenHash={tokenHash} type={type} label={copy[type].button} />
          ) : (
            <ButtonLink href="/login" className="w-full">
              Ко входу
            </ButtonLink>
          )}
        </Card>
      </div>
    </SiteShell>
  );
}
