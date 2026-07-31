// Единый источник правды по правовым документам сервиса: сторона договора,
// состав внешних сервисов и реестр редакций. Страницы /legal/*, архив и футер
// читают только отсюда — иначе номер редакции в шапке документа, дата в архиве
// и ссылка в футере начинают жить своей жизнью.

export type LegalEntityKind = "ip" | "self-employed" | "ooo";

export type LegalEntity = {
  // Организационно-правовая форма ещё не выбрана — от неё зависит набор
  // обязательных реквизитов (ОГРНИП у ИП, ОГРН и КПП у ООО, ни того ни другого
  // у самозанятого).
  kind: LegalEntityKind | null;
  name: string;
  shortName: string;
  inn: string;
  ogrn: string;
  kpp: string;
  address: string;
  email: string;
  phone: string;
};

// Реквизиты заполняются одной правкой здесь: в текстах оферты и политики они
// не продублированы, там стоит <LegalPending>. Пустая строка означает «ещё не
// знаем» — страница честно показывает пропуск, а не выдумывает значение.
export const legalEntity: LegalEntity = {
  kind: null,
  name: "",
  shortName: "",
  inn: "",
  ogrn: "",
  kpp: "",
  address: "",
  email: "",
  phone: "",
};

// Отдельный адрес для обращений по персональным данным: закон требует канал
// связи с оператором, и он может отличаться от общей почты.
export const privacyContactEmail = "";

export const isLegalEntityReady = Boolean(
  legalEntity.kind &&
    legalEntity.name &&
    legalEntity.inn &&
    legalEntity.address &&
    legalEntity.email,
);

// Факты о размещении инфраструктуры нужны для двух пунктов политики:
// локализации баз данных (ч. 5 ст. 18 152-ФЗ) и трансграничной передачи.
// Заполняются перед публикацией — придумывать их из кода нельзя.
export const dataHosting = {
  databaseLocation: "",
  applicationLocation: "",
  crossBorderCountries: "",
};

// ФИО и должность лица, ответственного за организацию обработки персональных
// данных (ст. 22.1 152-ФЗ).
export const privacyOfficer = "";

export type LegalSubprocessor = {
  name: string;
  purpose: string;
  data: string;
};

// Состав внешних сервисов собран по фактическим интеграциям
// (см. src/lib/env.ts и okno-functional-description.md, раздел 11.1).
export const legalSubprocessors: LegalSubprocessor[] = [
  {
    name: "Supabase",
    purpose: "База данных, аутентификация и хранилище загруженных файлов",
    data: "Все данные учётной записи Пользователя и данные его Клиентов",
  },
  {
    name: "ЮKassa",
    purpose:
      "Оплата подписки Пользователем, а также приём предоплаты и продажа сертификатов через магазин самого Пользователя",
    data: "Данные платежа, контакт плательщика",
  },
  {
    name: "CloudTips",
    purpose: "Приём чаевых Клиентов в адрес Пользователя",
    data: "Данные платежа",
  },
  {
    name: "sms.ru",
    purpose:
      "Отправка SMS, flash-call и обратного звонка для подтверждения номера и уведомлений о записи",
    data: "Номер телефона Клиента, текст транзакционного сообщения",
  },
  {
    name: "Telegram",
    purpose: "Уведомления Пользователю о записях, отменах и напоминаниях",
    data: "Идентификатор чата Пользователя, сведения о записи",
  },
  {
    name: "Anthropic (Claude API)",
    purpose:
      "AI-поддержка Пользователей, AI-консультация Клиентов по мануалам услуг, генерация дизайна подарочного сертификата",
    data: "Текст обращения, мануал услуги, данные оформления профиля",
  },
  {
    name: "Sentry",
    purpose:
      "Мониторинг ошибок и запись сессии интерфейса в момент возникновения ошибки",
    data: "Технические данные устройства и браузера, содержимое экрана в момент ошибки",
  },
];

export type LegalDocumentId = "offer" | "privacy";

export type LegalDocumentStatus = "draft" | "published";

export type LegalEdition = {
  version: string;
  // ISO-дата YYYY-MM-DD. Для черновика — планируемая дата вступления в силу.
  effectiveFrom: string;
  // Заполняется, когда редакцию сменила следующая.
  supersededOn?: string;
  // Действующая редакция читается прямо на странице, архивные выкладываются
  // PDF-файлами в public/legal/.
  source: { kind: "page" } | { kind: "pdf"; href: string };
  summary: string;
};

export type LegalDocument = {
  id: LegalDocumentId;
  title: string;
  navTitle: string;
  description: string;
  href: string;
  archiveHref: string;
  status: LegalDocumentStatus;
  // От новой редакции к старой: первая в списке — действующая.
  editions: LegalEdition[];
};

export const legalDocuments: LegalDocument[] = [
  {
    id: "offer",
    title: "Публичная оферта о предоставлении права использования сервиса okno.business",
    navTitle: "Публичная оферта",
    description:
      "Условия, на которых мастер получает доступ к сервису: предмет договора, тарифы и оплата, расчёты с клиентами, ответственность сторон.",
    href: "/legal/offer",
    archiveHref: "/legal/offer/archive",
    status: "draft",
    editions: [
      {
        version: "1.0",
        effectiveFrom: "2026-07-30",
        source: { kind: "page" },
        summary: "Первая редакция.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Политика в отношении обработки персональных данных",
    navTitle: "Политика обработки персональных данных",
    description:
      "Какие данные обрабатывает сервис, на каком основании, кому передаёт и как субъект может реализовать свои права.",
    href: "/legal/privacy",
    archiveHref: "/legal/privacy/archive",
    status: "draft",
    editions: [
      {
        version: "1.0",
        effectiveFrom: "2026-07-30",
        source: { kind: "page" },
        summary: "Первая редакция.",
      },
    ],
  },
];

const documentById = new Map<LegalDocumentId, LegalDocument>(
  legalDocuments.map((document) => [document.id, document]),
);

export const getLegalDocument = (id: LegalDocumentId) => {
  const document = documentById.get(id);

  if (!document) {
    throw new Error(`Неизвестный правовой документ: ${id}`);
  }

  return document;
};

export const getCurrentLegalEdition = (document: LegalDocument) =>
  document.editions[0];

export const getArchivedLegalEditions = (document: LegalDocument) =>
  document.editions.slice(1);

const legalDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  // Дата в реестре — календарная, без времени. Без явного UTC браузер в минусовом
  // поясе показал бы предыдущий день.
  timeZone: "UTC",
});

export const formatLegalDate = (isoDate: string) =>
  legalDateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
