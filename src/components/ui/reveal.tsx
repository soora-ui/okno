"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { useRevealed } from "./use-revealed";

type RevealProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  variant?: "fade-up" | "fade" | "scale" | "blur";
};

const variants = {
  "fade-up": {
    hidden: { opacity: 0, y: 32 },
    visible: { opacity: 1, y: 0 },
  },
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  scale: {
    hidden: { opacity: 0, scale: 0.96 },
    visible: { opacity: 1, scale: 1 },
  },
  blur: {
    hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
    visible: { opacity: 1, y: 0, filter: "blur(0px)" },
  },
};

export function Reveal({
  children,
  delay = 0,
  className,
  variant = "fade-up",
}: RevealProps) {
  const shouldReduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const revealed = useRevealed(ref);

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      data-reveal
      className={className}
      initial="hidden"
      // Состояние ведёт useRevealed, а не whileInView: наблюдателя дублирует
      // проверка геометрии, иначе блок теряется при быстрой прокрутке.
      animate={revealed ? "visible" : "hidden"}
      variants={variants[variant]}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
