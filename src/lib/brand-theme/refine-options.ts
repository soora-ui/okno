// Быстрые правки и места страницы для «Поправить» (макет 4.11). Отдельно от
// refine.ts: их рисует клиент, а refine.ts тянет SDK и серверные модули.

export const brandRefineChips = [
  "Темнее",
  "Светлее",
  "Меньше декора",
  "Больше декора",
  "Другой шрифт заголовков",
  "Кнопка ярче",
  "Убрать узоры",
] as const;

export type BrandRefineChip = (typeof brandRefineChips)[number];

// «Выбрать элемент на странице»: правка привязывается к месту.
export const brandRefineTargets = {
  cta: "Кнопка «Записаться»",
  hero: "Шапка страницы",
  headings: "Заголовки",
  cards: "Карточки услуг",
  background: "Фон страницы",
  decor: "Декор",
} as const;

export type BrandRefineTarget = keyof typeof brandRefineTargets;
