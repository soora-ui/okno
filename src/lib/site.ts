// Единый источник правды для отображаемого домена публичных ссылок мастера.
// Реальные переходы используют относительные пути / env.appUrl; здесь — то,
// что мы показываем клиенту глазами (okno.business/username).
export const publicLinkHost = "okno.business";

export function formatPublicProfileLink(username: string): string {
  return `${publicLinkHost}/${username}`;
}

const translitMap: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

export function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => translitMap[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// Автогенерация публичной ссылки от имени мастера и его ниши.
// Например: "Алина" + "Маникюр и брови" → "alina-manikyur".
export function suggestUsername(fullName: string, specialty: string): string {
  const namePart = slugifyName(fullName);
  const nichePart = slugifyName(specialty).split("-").filter(Boolean)[0] ?? "";
  return [namePart, nichePart].filter(Boolean).join("-").slice(0, 40);
}
