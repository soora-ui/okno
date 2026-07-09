// Параметры чаевых мастеру. Импортируются и сервером (валидация), и
// клиентским UI (кнопки быстрого выбора суммы).

export const tipAmountOptionsRub = [100, 200, 300, 500] as const;

export const tipMinAmountRub = 50;
export const tipMaxAmountRub = 30_000;

export function isValidTipAmount(amount: number): boolean {
  return (
    Number.isInteger(amount) &&
    amount >= tipMinAmountRub &&
    amount <= tipMaxAmountRub
  );
}
