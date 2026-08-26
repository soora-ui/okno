import type { BookingSlot } from "@/lib/mock-data";

// Общие типы AI-консультанта, который отвечает КЛИЕНТАМ мастера по конкретной
// услуге. Не путать с AI-поддержкой сервиса (src/lib/support-assistant/):
// там собеседник — мастер, база знаний — карта функционала okno, а цена
// ошибки — неверно понятая настройка. Здесь цена ошибки — неверный совет по
// уходу после процедуры, и вся конструкция модуля построена вокруг этого.

export type ConsultantPromptContext = {
  serviceTitle: string;
  masterName: string;
  /** Подтверждённый мануал услуги — единственный источник сведений бота. */
  manual: string;
  /** Публичный контакт мастера или null, если он его не указал. */
  masterContact: string | null;
  /**
   * Известна ли дата визита клиента. От этого зависит, может ли сервис вообще
   * посчитать дату повторного визита: на публичной странице клиент аноним, и
   * считать не от чего.
   */
  canOfferRepeatVisit: boolean;
};

/** Предложение записаться повторно. Считается кодом, не моделью. */
export type RepeatVisitOffer = {
  /** ISO-дата дня, `2026-08-30`. */
  date: string;
  /** Человекочитаемая подпись дня, «30 августа». */
  dateLabel: string;
  times: string[];
  serviceId: string;
  username: string;
};

export type ConsultantReply = {
  reply: string;
  /** Показывать ли под ответом, что это не медицинская рекомендация. */
  showMedicalDisclaimer: boolean;
  repeatVisit: RepeatVisitOffer | null;
};

export type ConsultantSlotsSource = {
  /** Слоты услуги начиная с указанной даты. */
  slotsFrom: (fromDate: string) => Promise<BookingSlot[]> | BookingSlot[];
};
