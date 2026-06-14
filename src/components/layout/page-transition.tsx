"use client";

import { usePathname } from "next/navigation";

/**
 * Replays a short entrance animation on every route change by keying the
 * wrapper with the current pathname, so the subtree remounts on navigation.
 * Honours prefers-reduced-motion via the `.page-enter` CSS rule.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
