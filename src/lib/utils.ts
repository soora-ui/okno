export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

// Русское склонение по числу: 1 запись / 2 записи / 5 записей.
// Проверяем остатки от 10 и 100, иначе «21 записей» и «22 визитов».
export function pluralizeRu(
  count: number,
  one: string,
  few: string,
  many: string,
) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} ${one}`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} ${few}`;
  }

  return `${count} ${many}`;
}
