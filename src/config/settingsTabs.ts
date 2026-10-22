// Разделы настроек мастера. Отдельно от клиентского компонента: по ?tab=
// раздел выбирает ещё и серверная страница (ссылки из уведомлений и ЮKassa).
export const settingsTabIds = [
  "profile",
  "schedule",
  "services",
  "booking",
  "account",
] as const;

export type SettingsTabId = (typeof settingsTabIds)[number];

export const isSettingsTabId = (value: unknown): value is SettingsTabId =>
  settingsTabIds.includes(value as SettingsTabId);
