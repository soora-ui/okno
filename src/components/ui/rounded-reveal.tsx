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
  const revealed = useRevealed(ref, 100);

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      data-reveal
      className={className}
      style={{ overflow: "hidden" }}
      initial={{ scale: 0.4, borderRadius: "999px", opacity: 0.5 }}
      animate={
        revealed
          ? { scale: 1, borderRadius: finalRadius, opacity: 1 }
          : { scale: 0.4, borderRadius: "999px", opacity: 0.5 }
      }
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        data-reveal
        initial={{ opacity: 0 }}
        animate={{ opacity: revealed ? 1 : 0 }}
        transition={{ duration: 0.6, delay: contentDelay, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
