"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

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

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      style={{ overflow: "hidden" }}
      initial={{ scale: 0.4, borderRadius: "999px", opacity: 0.5 }}
      whileInView={{ scale: 1, borderRadius: finalRadius, opacity: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: contentDelay, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
