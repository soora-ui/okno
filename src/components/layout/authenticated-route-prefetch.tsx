"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type NetworkAwareNavigator = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
};

function shouldSkipPrefetch() {
  if (typeof window === "undefined") {
    return true;
  }

  const connection = (navigator as NetworkAwareNavigator).connection;
  if (!connection) {
    return false;
  }

  return (
    connection.saveData ||
    connection.effectiveType === "slow-2g" ||
    connection.effectiveType === "2g"
  );
}

export function AuthenticatedRoutePrefetch({
  routes,
}: {
  routes: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (shouldSkipPrefetch()) {
      return;
    }

    const targets = routes.filter((route) => route !== pathname).slice(0, 2);

    if (targets.length === 0) {
      return;
    }

    let cancelled = false;
    const timeoutIds: number[] = [];

    const startPrefetch = () => {
      targets.forEach((href, index) => {
        const timeoutId = window.setTimeout(() => {
          if (!cancelled) {
            router.prefetch(href);
          }
        }, 1200 + index * 1400);

        timeoutIds.push(timeoutId);
      });
    };

    if (document.readyState === "complete") {
      startPrefetch();
    } else {
      const onLoad = () => {
        if (!cancelled) {
          startPrefetch();
        }
      };

      window.addEventListener("load", onLoad, { once: true });

      return () => {
        cancelled = true;
        window.removeEventListener("load", onLoad);
        timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      };
    }

    return () => {
      cancelled = true;
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [pathname, router, routes]);

  return null;
}
