import Image from "next/image";
import { cn } from "@/lib/utils";

// Фото мастера или его инициалы. Заглушку-силуэт не показываем: чужое лицо
// вместо мастера хуже, чем две буквы на шалфейной подложке.
export function MasterAvatar({
  name,
  url,
  size,
  className,
}: {
  name: string;
  url: string | null;
  size: number;
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("ru"))
    .join("");

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-accent-soft font-semibold text-accent-deep",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden={url ? undefined : true}
    >
      {url ? (
        <Image
          src={url}
          alt={name}
          width={size * 2}
          height={size * 2}
          className="h-full w-full object-cover"
        />
      ) : (
        initials || "•"
      )}
    </span>
  );
}
