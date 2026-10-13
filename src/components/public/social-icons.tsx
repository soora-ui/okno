import type { SocialNetwork } from "@/lib/booking-page-settings";

// Брендовых иконок в lucide нет (их убрали из пакета), поэтому рисуем свои —
// упрощённые, в одну краску currentColor, чтобы они перекрашивались вместе
// с темой страницы, как остальные иконки.
export function SocialIcon({
  network,
  size = 18,
  className,
}: {
  network: SocialNetwork;
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    className,
    "aria-hidden": true,
  } as const;

  switch (network) {
    case "telegram":
      return (
        <svg {...common} fill="currentColor">
          <path d="M20.7 3.6 2.9 10.5c-1.2.5-1.2 1.2-.2 1.5l4.6 1.4 1.7 5.4c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.2-2.2 4.6 3.4c.8.5 1.5.2 1.7-.8l3-14.2c.3-1.3-.5-1.8-1.5-1.4Zm-3.4 4-7.6 6.9-.3 3.2-1.4-4.6 9-5.7c.4-.3.7 0 .3.2Z" />
        </svg>
      );
    case "vk":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12.8 18c-6 0-9.5-4.1-9.6-11h3c.1 5 2.3 7.2 4.1 7.6V7h2.8v4.3c1.8-.2 3.6-2.2 4.3-4.3h2.8c-.5 2.6-2.4 4.5-3.8 5.3 1.4.6 3.6 2.4 4.4 5.7h-3.1c-.7-2.2-2.4-3.9-4.6-4.1V18h-.3Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
        </svg>
      );
    case "twitter":
      return (
        <svg {...common} fill="currentColor">
          <path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.3l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.9L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common} fill="currentColor">
          <path d="M16.6 3c.4 2.4 1.8 3.9 4.2 4.1v3c-1.5.1-2.9-.4-4.2-1.2v6.1c0 4.6-4.4 6.9-7.9 5.3-3.6-1.6-3.9-7.3.3-8.6.8-.3 1.6-.3 2.4-.2v3.2c-.4-.1-.8-.2-1.2-.1-2.4.4-2.3 3.6-.2 4.1 1.6.4 3.3-.6 3.3-2.7V3h3.3Z" />
        </svg>
      );
  }
}
