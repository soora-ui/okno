import { DateTime } from "luxon";
import type { BookingSlot, Profile, Service } from "@/lib/mock-data";

export type PublicProfileViewProps = {
  profile: Profile;
  services: Service[];
  bookingSlotsByService: Record<string, BookingSlot[]>;
  bookingHref: string;
  homeHref?: string;
  eyebrowLabel: string;
  showDemoSections?: boolean;
  guidedDemo?: boolean;
  guidedDemoCleanHref?: string;
  /**
   * Блок продажи сертификата. Приходит слотом, а не рендерится соседом
   * страницы: соседом он оказывался ниже подвала — клиент видел «Создано
   * в okno», считал страницу законченной и до сертификата не доходил.
   */
  certificateSlot?: React.ReactNode;
};

export type DemoStoryStep = {
  id: string;
  stepLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  settings: string;
  tone?: "light" | "accent" | "ink";
};

export function capitalizeLabel(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function formatSlotDate(date: string) {
  return capitalizeLabel(
    DateTime.fromISO(date, { zone: "utc" }).setLocale("ru").toFormat("ccc, d LLL"),
  );
}

export function getClosestSlots(
  services: Service[],
  bookingSlotsByService: Record<string, BookingSlot[]>,
) {
  const serviceMap = new Map(services.map((service) => [service.id, service]));

  return Object.entries(bookingSlotsByService)
    .flatMap(([serviceId, slots]) =>
      slots.flatMap((slot) =>
        slot.times.slice(0, 2).map((time) => ({
          serviceId,
          serviceTitle: serviceMap.get(serviceId)?.title ?? "Услуга",
          date: slot.value,
          dateLabel: formatSlotDate(slot.value),
          time,
          sortKey: `${slot.value}T${time}`,
        })),
      ),
    )
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .slice(0, 4);
}

export const publicTrustItems = [
  {
    icon: "MessageCircleHeart",
    label: "Подтверждение и детали визита сразу после записи",
  },
  {
    icon: "ShieldCheck",
    label: "Правила записи и отмены мастер настраивает сам",
  },
  {
    icon: "Sparkles",
    label: "Запись онлайн в любое время, без переписок",
  },
] as const;

export const publicInfoItems = [
  {
    icon: "CalendarClock",
    title: "Как проходит запись",
    text: "Сначала выбирается услуга и удобное время, затем клиент подтверждает запись в короткой форме без лишних шагов.",
  },
  {
    icon: "BadgeCheck",
    title: "Что получает клиент",
    text: "Клиент видит актуальные слоты, подтверждает запись в пару шагов и сразу получает экран с деталями визита.",
  },
  {
    icon: "Clock3",
    title: "Что настраивает мастер",
    text: "В кабинете можно менять окно записи, шаг слотов, паузу между визитами, правила самостоятельной отмены и напоминания.",
  },
] as const;

export const publicDemoStorySteps: DemoStoryStep[] = [
  {
    id: "hero",
    stepLabel: "Шаг 1",
    eyebrow: "Первая сцена",
    title: "Клиент сразу попадает на личную витрину мастера",
    description:
      "С первого экрана видно имя мастера, специализацию, район и кнопку записи. Разбираться, куда нажимать, не приходится.",
    settings:
      "Имя, фото, описание, специализация и локация меняются в профиле мастера и сразу обновляют публичную страницу.",
    tone: "light",
  },
  {
    id: "slots",
    stepLabel: "Шаг 2",
    eyebrow: "Свободные окна",
    title: "На первом экране сразу есть ответ на вопрос «когда можно записаться?»",
    description:
      "Ближайшие слоты видны сразу рядом с профилем мастера — не нужно писать в переписку и ждать ответа, чтобы узнать, есть ли свободное время.",
    settings:
      "Окно записи, шаг слотов и пауза между визитами задаются в настройках записи, поэтому расписание всегда подчиняется правилам мастера.",
    tone: "accent",
  },
  {
    id: "works",
    stepLabel: "Шаг 3",
    eyebrow: "Работы",
    title: "Портфолио показывает стиль мастера прямо на странице записи",
    description:
      "Подборка работ встроена в страницу записи. Клиент сразу видит уровень и стиль мастера, а если нужно — открывает всю галерею крупнее.",
    settings:
      "Мастер сам загружает фотографии и управляет порядком работ в кабинете, поэтому портфолио всегда остаётся актуальным.",
    tone: "light",
  },
  {
    id: "services",
    stepLabel: "Шаг 4",
    eyebrow: "Услуги",
    title: "Каталог услуг коротко объясняет, что за визит и сколько он стоит",
    description:
      "Каждая услуга сразу показывает длительность, цену и короткое описание — этого достаточно, чтобы выбрать визит без лишних уточнений.",
    settings:
      "Названия, описания, длительность, цена и порядок карточек полностью управляются в кабинете мастера.",
    tone: "accent",
  },
  {
    id: "rules",
    stepLabel: "Шаг 5",
    eyebrow: "Правила записи",
    title: "Нижний блок снимает вопросы о локации, отмене и уведомлениях",
    description:
      "В конце страницы клиент видит, как проходит запись, что будет после бронирования и какие правила действуют — не нужно уточнять это у мастера отдельно.",
    settings:
      "Самостоятельная отмена, напоминания клиенту и мастеру, а также остальные параметры записи задаются мастером в настройках.",
    tone: "ink",
  },
];
