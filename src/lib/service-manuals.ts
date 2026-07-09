import { z } from "zod";

// Общие константы и схема мануала AI-консультации. Импортируются и server
// action'ом, и клиентским UI, чтобы правила валидации и тексты не разъезжались.

export const manualMinLength = 20;
export const manualMaxLength = 8000;

export const manualConfirmationLabel =
  "Я подтверждаю, что мануал верен и я несу ответственность за его содержание";

// Не жёсткая форма, а подсказка-структура в placeholder (как в ТЗ).
export const manualPlaceholder = `- Когда можно повторить процедуру
- Что нельзя делать после (срок, активности, уход)
- Какие реакции нормальны, какие — повод обратиться к мастеру/врачу
- Что подходит/не подходит конкретно для этой услуги`;

export const serviceManualFormSchema = z.object({
  serviceId: z.string().min(1),
  content: z.string().trim().min(manualMinLength).max(manualMaxLength),
  // Чекбокс ответственности. Без него мануал не подтверждается и для
  // клиентов не активируется — это юридическое ядро всего модуля.
  confirmed: z.literal("on"),
});

export type ServiceManualSummary = {
  serviceId: string;
  content: string;
  version: number;
  isActive: boolean;
  isConfirmed: boolean;
  confirmedAtLabel: string | null;
};
