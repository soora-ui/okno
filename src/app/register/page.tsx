import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { RegisterForm } from "@/components/forms/register-form";
import { normalizeReferralCode } from "@/lib/referral";
import { parseAccountMode } from "@/lib/account-modes";

// Служебная страница: в выдаче не нужна.
export const metadata: Metadata = {
  title: "Регистрация — okno",
  robots: { index: false, follow: true },
};

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
      <div className="mx-auto w-full max-w-[560px] py-8 sm:py-10">
        <RegisterForm
          referralCode={referralCode}
          initialAccountMode={initialAccountMode}
          initialFullName={initialFullName}
          initialSpecialty={initialSpecialty}
        />
      </div>
    </SiteShell>
  );
}
