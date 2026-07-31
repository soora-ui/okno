import { cn } from "@/lib/utils";

// Фон карточки по умолчанию берётся из темы страницы записи (--ui-card-bg).
// Если вызывающий код сам задаёт фон (className="bg-panel" или style.background*),
// инлайновую подстановку не делаем — иначе она перебивает класс и акцентные
// карточки остаются белыми.
const hasOwnBackground = (className?: string, style?: React.CSSProperties) =>
  /(^|\s)bg-/.test(className ?? "") ||
  Boolean(style?.background) ||
  Boolean(style?.backgroundColor) ||
  Boolean(style?.backgroundImage);

export function Card({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      style={
        hasOwnBackground(className, style)
          ? style
          : { backgroundColor: "var(--ui-card-bg)", ...style }
      }
      className={cn(
        "rounded-card border border-line p-6 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
