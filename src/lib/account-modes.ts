// Формат аккаунта выбирается дважды: развилкой в герое лендинга и карточками
// в форме регистрации. Список живёт здесь, чтобы ссылка вида /register?mode=studio
// не разъехалась с тем, что форма умеет подсветить.
export const accountModes = [
  {
    value: "solo",
    title: "Одиночный мастер",
    description: "Свой кабинет, первая услуга и личная ссылка для записи.",
  },
  {
    value: "studio",
    title: "Студия",
    description: "Администратор создает сотрудников и следит за всей командой.",
  },
  {
    value: "barbershop",
    title: "Барбершоп",
    description: "Подходит для команды с разными мастерами и отдельными кабинетами.",
  },
  {
    value: "company",
    title: "Компания",
    description: "Для салона, сети или бренда, где нужны роли и общая админка.",
  },
] as const;

export type AccountMode = (typeof accountModes)[number]["value"];

export const defaultAccountMode: AccountMode = "solo";

// Значение приходит из адресной строки, поэтому доверять ему нельзя: всё
// неизвестное сводим к одиночному мастеру, а не роняем страницу.
export function parseAccountMode(value: string | undefined): AccountMode {
  const match = accountModes.find((mode) => mode.value === value);
  return match ? match.value : defaultAccountMode;
}
