import {
  getConsultantContext,
  getServiceIdsWithManual,
} from "@/lib/repositories/consultant-repository";
import { hasCapability } from "@/lib/subscription";

// Показывать ли виджет консультанта. Отдельный модуль, потому что решение
// одинаковое для обеих страниц, а условий несколько: подтверждённый мануал,
// активная услуга и тариф мастера.
//
// Тариф проверяется и здесь, и в роуте. Дублирование намеренное: здесь — чтобы
// не рисовать клиенту кнопку, которая ответит отказом, в роуте — чтобы гейт
// нельзя было обойти прямым запросом.

/** Доступна ли консультация по конкретной услуге. */
export async function isConsultationAvailable(input: {
  serviceId: string;
}): Promise<boolean> {
  const context = await getConsultantContext({ serviceId: input.serviceId });

  return Boolean(context && hasCapability(context.profile, "aiConsultation"));
}

/**
 * Услуги мастера, по которым есть о чём консультировать. Публичная страница
 * ставит кнопку только на карточки этих услуг — пустой список означает, что
 * кнопки не будет нигде.
 */
export async function getConsultantServiceIds(input: {
  profileId: string;
  profile: Parameters<typeof hasCapability>[0];
}): Promise<string[]> {
  if (!hasCapability(input.profile, "aiConsultation")) {
    return [];
  }

  return getServiceIdsWithManual({ profileId: input.profileId });
}
