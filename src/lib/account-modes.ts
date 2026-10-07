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
    description:
      "Команда мастеров: салон, барбершоп или сеть. Администратор создаёт сотрудников и видит всех.",
  },
] as const;

export type AccountMode = (typeof accountModes)[number]["value"];

export const defaultAccountMode: AccountMode = "solo";

// Раньше были ещё «Барбершоп» и «Компания» — по сути та же студия. Тип
// команды уточняется потом в настройках, а старые ссылки ведут в студию.
const legacyTeamModes = new Set(["barbershop", "company"]);

// Значение приходит из адресной строки, поэтому доверять ему нельзя: всё
// неизвестное сводим к одиночному мастеру, а не роняем страницу.
export function parseAccountMode(value: string | undefined): AccountMode {
  if (value && legacyTeamModes.has(value)) return "studio";
  const match = accountModes.find((mode) => mode.value === value);
  return match ? match.value : defaultAccountMode;
}
