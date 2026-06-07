"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  dark?: boolean;
  hover?: boolean;
}

export default function GlassCard({ children, className, delay = 0, dark = false, hover = true }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
      className={cn(
        dark ? "glass-card-dark" : "glass-card",
        "p-4 sm:p-6",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
