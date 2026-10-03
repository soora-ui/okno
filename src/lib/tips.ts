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

// Чаевые — только за состоявшийся визит: запись подтверждена (не отменена и
// не ждёт предоплату) и уже началась. Отменённой записи благодарить не за что,
// у pending_payment ещё не оплачена сама предоплата — второй платёж рядом
// с первым только запутает, а до начала визита клиент ещё не видел результата,
// и форма на свежесозданной записи выглядит как попытка взять деньги вперёд.
// Критерий тот же, что у «прошедших визитов» в кабинете клиента
// (getClientPastBookings: confirmed + starts_at < now). Одна функция на UI
// (страница подтверждения) и сервер (startTipPayment), чтобы правила не разъехались.
export function isTipAllowed(input: {
  status: string;
  startsAtIso: string;
  now?: number;
}): boolean {
  if (input.status !== "confirmed") {
    return false;
  }

  const startsAt = new Date(input.startsAtIso).getTime();

  return Number.isFinite(startsAt) && startsAt <= (input.now ?? Date.now());
}
