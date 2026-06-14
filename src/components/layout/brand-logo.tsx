import Link from "next/link";

export function BrandLogo({
  href = "/",
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 text-sm font-semibold text-ink">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white">
        o
      </span>
      okno
      {children}
    </Link>
  );
}
