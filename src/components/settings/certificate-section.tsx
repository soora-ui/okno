"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { CertificateDesignModal } from "@/components/settings/certificate-design-modal";
import { CertificateSalesToggle } from "@/components/settings/certificate-sales-toggle";
import { GiftCertificateSettingsForm } from "@/components/forms/settings-forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { maxCertificateTemplateRegenerations } from "@/lib/certificates/limits";
import type { CertificateTemplateSummary } from "@/lib/data";
import type { Profile } from "@/lib/mock-data";
import type { SectionStatus } from "@/components/settings/record-section-nav";

// Статусы см. okno-tz-certificates-ui-flow.md — «Не настроено»/«Черновик»
// схлопнуты в warning (нет template_id), «Готово, но выключено» — в none
// (мастер сам решает, включать продажу), «Активно» — в complete.
export function getCertificateSectionStatus(
  profile: Profile,
  certificateTemplate: CertificateTemplateSummary | null,
): SectionStatus {
  if (profile.bookingPageSettings.giftCertificatesEnabled) return "complete";
  if (!certificateTemplate) return "warning";
  return "none";
}

// Единый раздел «Подарочные сертификаты» (okno-tz-certificates-ui-flow.md).
// Раньше здесь было два отдельных блока (настройки + дизайн отдельной
// карточкой) — мастер мог настроить номиналы и не долистать до дизайна,
// из-за чего продажа технически включалась без шаблона. Теперь номиналы/
// срок действия, состояние дизайна и тумблер продажи живут в одной
// карточке, а тумблер физически не включается без template_id (см.
// CertificateSalesToggle + серверную проверку в
// updateCertificateSalesEnabledAction).

function pluralizeAttempts(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return "перегенерация";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "перегенерации";
  return "перегенераций";
}

export function CertificateSection({
  profile,
  certificateTemplate,
}: {
  profile: Profile;
  certificateTemplate: CertificateTemplateSummary | null;
}) {
  const [isModalOpen, setModalOpen] = useState(false);
  const hasTemplate = Boolean(certificateTemplate);
  const attemptsLeft = Math.max(
    0,
    maxCertificateTemplateRegenerations - (certificateTemplate?.regenerationCount ?? 0),
  );

  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-3">
        <Gift size={18} className="text-accent-deep" />
        <h2 className="text-xl font-semibold text-ink">Подарочные сертификаты</h2>
      </div>
      <p className="text-sm leading-6 text-ink-soft">
        Клиенты смогут купить сертификат прямо на публичной странице и оплатить его онлайн.
        Сразу после оплаты покупателю становится доступно скачивание PDF-сертификата с QR-кодом.
      </p>

      <GiftCertificateSettingsForm profile={profile} />

      <div className="overflow-hidden rounded-panel border border-line bg-panel p-4">
        {hasTemplate ? (
          <div className="flex flex-wrap items-center gap-4">
            {certificateTemplate?.previewPngBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element -- data: base64 превью, next/image его не оптимизирует
              <img
                src={`data:image/png;base64,${certificateTemplate.previewPngBase64}`}
                alt="Превью сертификата"
                className="aspect-[35/24] w-36 shrink-0 rounded-tight border border-line bg-surface object-contain"
              />
            ) : (
              <div className="flex aspect-[35/24] w-36 shrink-0 items-center justify-center rounded-tight border border-dashed border-line bg-surface text-xs text-muted">
                Превью недоступно
              </div>
            )}
            <div className="flex flex-1 flex-col gap-3">
              <p className="text-sm font-medium text-ink">
                Шаблон готов · осталось {attemptsLeft} {pluralizeAttempts(attemptsLeft)}
              </p>
              <Button variant="secondary" onClick={() => setModalOpen(true)} className="self-start">
                Изменить дизайн
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex aspect-[35/24] w-36 items-center justify-center rounded-tight border border-dashed border-line bg-surface text-xs text-muted">
              Нет превью сертификата
            </div>
            <Button onClick={() => setModalOpen(true)}>Давай создадим</Button>
          </div>
        )}
      </div>

      <CertificateSalesToggle
        enabled={profile.bookingPageSettings.giftCertificatesEnabled}
        hasTemplate={hasTemplate}
        onRequireDesign={() => setModalOpen(true)}
      />

      <CertificateDesignModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        profile={profile}
        certificateTemplate={certificateTemplate}
      />
    </Card>
  );
}
