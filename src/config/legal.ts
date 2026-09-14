// Единый источник правды по правовым документам сервиса: сторона договора,
// состав внешних сервисов и реестр редакций. Страницы /legal/*, архив и футер
// читают только отсюда — иначе номер редакции в шапке документа, дата в архиве
// и ссылка в футере начинают жить своей жизнью.

export type LegalEntityKind = "ip" | "self-employed" | "ooo";

export type LegalEntity = {
  kind: LegalEntityKind;
  name: string;
  shortName: string;
  inn: string;
  ogrn: string;
  address: string;
  // Адрес для юридически значимых сообщений и претензий (ст. 165.1 ГК),
  // п. 7.3.1 оферты.
  email: string;
};

export const legalEntity: LegalEntity = {
  kind: "ip",
  name: "Индивидуальный предприниматель Каменков Артём Денисович",
  shortName: "ИП Каменков А. Д.",
  inn: "910924469701",
  ogrn: "324911200020401",
  address: "297576, Республика Крым, Симферопольский район, село Лозовое",
  email: "support@okno.business",
};

// Банковские реквизиты нужны в разделе «Реквизиты» оферты. Пустая строка
// означает «ещё не знаем» — страница честно показывает пропуск, а не
// выдумывает счёт.
export type LegalBankDetails = {
  name: string;
  bik: string;
  correspondentAccount: string;
  settlementAccount: string;
};

export const legalBankDetails: LegalBankDetails = {
  name: "",
  bik: "",
  correspondentAccount: "",
  settlementAccount: "",
};

// Пока в оферте зияют пустые банковские реквизиты, документы висят
// черновиками: договор без счёта получателя платежа не работает.
export const isLegalEntityReady = Boolean(
  legalBankDetails.name &&
    legalBankDetails.bik &&
    legalBankDetails.correspondentAccount &&
    legalBankDetails.settlementAccount,
);

// Один адрес на все каналы: юридически значимые сообщения, поддержка и
// обращения по персональным данным. Разведены по трём именам, чтобы при
// появлении отдельного ящика правка была ровно в одном месте.
export const supportEmail = "support@okno.business";
export const privacyContactEmail = "support@okno.business";

// ФИО лица, ответственного за организацию обработки персональных данных
// (ст. 22.1 152-ФЗ). Назначается приказом.
export const privacyOfficer = "Каменков Артём Денисович";

export const legalSiteOrigin = "https://okno.business";

export type LegalSubprocessor = {
  name: string;
  purpose: string;
  data: string;
};

// Состав внешних сервисов собран по фактическим интеграциям
// (см. src/lib/env.ts и okno-functional-description.md, раздел 11.1).
// Дублирует раздел 9 Политики: там — с реквизитами, здесь — таблицей.
export const legalSubprocessors: LegalSubprocessor[] = [
  {
    name: "Podaon SIA (Латвия)",
    purpose: "Размещение (хостинг), хранение и резервное копирование данных Сервиса",
    data: "Все данные учётной записи Пользователя и данные его Клиентов",
  },
  {
    name: "ООО «СМС.РУ»",
    purpose:
      "Доставка SMS-уведомлений о записи, напоминаний и ссылок на самостоятельную отмену",
    data: "Имя и номер телефона Клиента, дата, время и место записи",
  },
  {
    name: "ООО НКО «ЮМани»",
    purpose:
      "Приём вознаграждения за Сервис, предоплаты по записям и оплаты подарочных сертификатов",
    data: "Имя, контактные данные и сведения о платеже без данных платёжных карт",
  },
  {
    name: "ООО «КЛАУДПЭЙМЕНТС»",
    purpose: "Приём и перевод чаевых Клиентов в адрес Пользователя",
    data: "Имя, контактные данные и сведения о платеже без данных платёжных карт",
  },
  {
    name: "Anthropic PBC (США)",
    purpose:
      "Формирование ответов автоматизированного консультанта Сервиса; подготовка черновика напоминания Клиенту по запросу Пользователя",
    // Черновик «давно не были» пишется по истории визитов: в запрос уходят
    // имя Клиента, услуги и давность визита, а также заметки Пользователя о
    // нём. Телефон — нет.
    data: "Текст обращения Клиента, сведения об услугах Пользователя; для черновика напоминания — имя Клиента, сведения о его визитах и заметки Пользователя о нём",
  },
  {
    name: "ООО «ЯНДЕКС»",
    purpose: "Сбор и анализ статистики посещения сайта (веб-аналитика)",
    data: "Обезличенные технические данные, файлы cookie и идентификаторы аналитики",
  },
  {
    name: "Telegram Messenger Inc.",
    purpose:
      "Доставка Пользователю уведомлений о записях, отменах и напоминаниях через бота Сервиса",
    // Бот показывает Пользователю карточку записи, поэтому в Telegram уходит
    // не только факт записи, но и имя с телефоном Клиента — то же, что
    // Пользователь видит в кабинете.
    data: "Идентификатор чата Пользователя, сведения о записи, имя и номер телефона Клиента",
  },
];

export type LegalDocumentId =
  | "offer"
  | "privacy"
  | "cookie"
  | "rules"
  | "consent"
  | "consent-client";

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

// Редакция 02.08.2026 — первая для всех шести документов, поэтому архивы
// пусты, а не заполнены прежними версиями.
const firstEdition: LegalEdition = {
  version: "1.0",
  effectiveFrom: "2026-08-02",
  source: { kind: "page" },
  summary: "Первая редакция.",
};

const draftStatus: LegalDocumentStatus = isLegalEntityReady
  ? "published"
  : "draft";

export const legalDocuments: LegalDocument[] = [
  {
    id: "offer",
    title: "Публичная оферта okno.business",
    navTitle: "Публичная оферта",
    description:
      "Условия, на которых мастер получает доступ к сервису: предмет договора, тарифы и оплата, автопродление и возврат, ответственность сторон. С Приложением № 1 — поручением на обработку персональных данных клиентов.",
    href: "/legal/offer",
    archiveHref: "/legal/offer/archive",
    status: draftStatus,
    editions: [firstEdition],
  },
  {
    id: "privacy",
    title: "Политика в отношении обработки персональных данных",
    navTitle: "Политика обработки персональных данных",
    description:
      "Какие данные обрабатывает сервис, на каком основании, кому передаёт и как субъект может реализовать свои права.",
    href: "/legal/privacy",
    archiveHref: "/legal/privacy/archive",
    status: draftStatus,
    editions: [firstEdition],
  },
  {
    id: "cookie",
    title: "Политика обработки файлов cookie",
    navTitle: "Политика обработки файлов cookie",
    description:
      "Какие файлы cookie использует сайт, зачем они нужны, сколько хранятся и как изменить свой выбор.",
    href: "/legal/cookie",
    archiveHref: "/legal/cookie/archive",
    status: draftStatus,
    editions: [firstEdition],
  },
  {
    id: "rules",
    title: "Правила использования Сервиса okno",
    navTitle: "Правила использования Сервиса",
    description:
      "Порядок использования функциональных возможностей сервиса, требования к размещаемым материалам и порядок модерации.",
    href: "/legal/rules",
    archiveHref: "/legal/rules/archive",
    status: draftStatus,
    editions: [firstEdition],
  },
  {
    id: "consent",
    title: "Согласие на обработку персональных данных Пользователя Сервиса okno",
    navTitle: "Согласие на обработку ПДн — мастер",
    description:
      "Текст согласия, которое мастер даёт при регистрации: трансграничная передача, рекламные сообщения и необязательные файлы cookie.",
    href: "/legal/consent",
    archiveHref: "/legal/consent/archive",
    status: draftStatus,
    editions: [firstEdition],
  },
  {
    id: "consent-client",
    title:
      "Согласие на обработку персональных данных Клиента Пользователя Сервиса okno",
    navTitle: "Согласие на обработку ПДн — клиент",
    description:
      "Шаблон согласия для публичной страницы записи. Оператором данных клиента выступает сам мастер, его реквизиты подставляются в текст.",
    href: "/legal/consent-client",
    archiveHref: "/legal/consent-client/archive",
    status: draftStatus,
    editions: [firstEdition],
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
