import Link from "next/link";
import { legalDocuments, legalEntity } from "@/config/legal";
import { landingDemoPublicPageHref } from "@/lib/landing-demo";
import { publicLinkHost } from "@/lib/site";

const serviceLinks = [
  { href: "/", label: "Главная" },
  { href: "/pricing", label: "Тарифы" },
  { href: landingDemoPublicPageHref, label: "Пример страницы записи" },
  { href: "/register", label: "Регистрация" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="print-hidden mt-16 border-t border-line pt-10">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
        <div className="space-y-3">
          <p className="text-lg font-semibold tracking-tight text-ink">
            {publicLinkHost}
          </p>
          <p className="max-w-sm text-sm leading-6 text-ink-soft">
            Онлайн-запись для мастеров бьюти-сферы, студий и барбершопов.
            Расписание, база клиентов и уведомления в одном месте.
          </p>
        </div>

        <nav aria-label="Разделы сайта" className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Сервис</p>
          <ul className="space-y-2">
            {serviceLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-6 items-center text-sm text-ink-soft transition hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Правовые документы" className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Документы
          </p>
          <ul className="space-y-2">
            {legalDocuments.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={doc.href}
                  className="inline-flex min-h-6 items-center text-sm text-ink-soft transition hover:text-ink"
                >
                  {doc.navTitle}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/legal"
                className="inline-flex min-h-6 items-center text-sm text-ink-soft transition hover:text-ink"
              >
                Все документы и архив редакций
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <p className="text-sm text-muted">
          © {year} {publicLinkHost}
        </p>
        <p className="text-sm text-muted">
          {legalEntity.shortName || legalEntity.name} · ИНН {legalEntity.inn}
        </p>
      </div>
    </footer>
  );
}
