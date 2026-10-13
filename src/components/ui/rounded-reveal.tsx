"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { useRevealed } from "./use-revealed";

type RoundedRevealProps = {
  children: ReactNode;
  className?: string;
  finalRadius?: string;
  contentDelay?: number;
};

export function RoundedReveal({
  children,
  className,
  finalRadius = "24px",
  contentDelay = 0.35,
}: RoundedRevealProps) {
  const shouldReduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // 100 — десктопный отступ триггера; на мобильных хук сам ужимает его до 40.
  const revealed = useRevealed(ref, 100);

  // См. комментарий в Reveal: ветка на shouldReduceMotion меняла структуру DOM
  // между сервером и клиентом и ломала гидратацию.
  const settled = shouldReduceMotion || revealed;

  return (
    <motion.div
      ref={ref}
      data-reveal
      className={className}
      style={{ overflow: "hidden" }}
      initial={{ scale: 0.4, borderRadius: "999px", opacity: 0.5 }}
      animate={
        settled
          ? { scale: 1, borderRadius: finalRadius, opacity: 1 }
          : { scale: 0.4, borderRadius: "999px", opacity: 0.5 }
      }
      transition={
        shouldReduceMotion ? { duration: 0 } : { duration: 1, ease: [0.16, 1, 0.3, 1] }
      }
    >
      {/* h-full: если обёртке задали высоту (колонка героя), содержимое
          её занимает; без заданной высоты это ничего не меняет. */}
      <motion.div
        data-reveal
        className="h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: settled ? 1 : 0 }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { duration: 0.6, delay: contentDelay, ease: "easeOut" }
        }
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
