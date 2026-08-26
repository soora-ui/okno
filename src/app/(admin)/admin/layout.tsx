import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { AdminNav } from "@/components/admin/admin-nav";
import { requirePlatformAdmin } from "@/lib/admin/access";
import { getUnresolvedErrorGroupCount } from "@/lib/admin/queries";

export const metadata = {
  title: "okno · Админ-панель",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Единая точка защиты всей панели: не-админ получает 404.
  const admin = await requirePlatformAdmin();
  const unresolvedErrors = await getUnresolvedErrorGroupCount();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div className="space-y-1">
          <Link href="/admin" className="text-xl font-semibold text-ink">
            okno · Админ-панель
          </Link>
          <p className="text-sm text-ink-soft">{admin.email}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition hover:-translate-y-0.5"
            style={{ backgroundColor: "var(--ui-card-bg)" }}
          >
            Выйти
          </button>
        </form>
      </header>

      <div className="mt-6">
        <AdminNav unresolvedErrors={unresolvedErrors} />
      </div>

      <main className="mt-8">{children}</main>
    </div>
  );
}
