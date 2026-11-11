import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/forms/email-auth-forms";

export const metadata: Metadata = {
  title: "Сброс пароля — okno",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <SiteShell compact resolveAuth={false} showFooter>
      <div className="mx-auto flex max-w-xl justify-center py-12">
        <Card className="w-full space-y-5">
          <div className="space-y-2">
            <h1 className="text-center text-4xl font-semibold text-ink">Сброс пароля</h1>
            <p className="text-center text-sm leading-6 text-ink-soft">
              Укажи почту, с которой входишь в okno, — пришлём ссылку, по ней можно задать новый пароль.
            </p>
          </div>
          <ForgotPasswordForm />
          <ButtonLink href="/login" variant="ghost" className="w-full px-0">
            Вспомнил пароль — войти
          </ButtonLink>
        </Card>
      </div>
    </SiteShell>
  );
}
