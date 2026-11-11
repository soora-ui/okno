import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/forms/email-auth-forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Новый пароль — okno",
  robots: { index: false, follow: false },
};

// Сюда ведёт /auth/confirm после ссылки из письма сброса: сессия уже открыта,
// осталось задать пароль.
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <SiteShell compact resolveAuth={false} showFooter>
      <div className="mx-auto flex max-w-xl justify-center py-12">
        <Card className="w-full space-y-5">
          <div className="space-y-2">
            <h1 className="text-center text-4xl font-semibold text-ink">Новый пароль</h1>
            <p className="text-center text-sm leading-6 text-ink-soft">
              {user?.email
                ? `Для входа с адресом ${user.email}.`
                : "Ссылка из письма устарела или уже использована."}
            </p>
          </div>
          {user?.email ? (
            <ResetPasswordForm />
          ) : (
            <ButtonLink href="/forgot-password" className="w-full">
              Запросить новую ссылку
            </ButtonLink>
          )}
        </Card>
      </div>
    </SiteShell>
  );
}
