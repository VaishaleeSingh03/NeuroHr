"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import GlassCard from "./GlassCard";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: string;
  delay?: number;
  href?: string;
}

export default function StatCard({ title, value, icon: Icon, change, delay = 0, href }: StatCardProps) {
  const content = (
    <GlassCard
      delay={delay}
      hover={!!href}
      className={`relative overflow-hidden ${href ? "cursor-pointer hover:border-aqua/40 hover:shadow-glow transition-shadow" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-label font-medium truncate">{title}</p>
          <motion.p
            className="text-xl sm:text-2xl lg:text-3xl font-bold text-heading mt-1"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay + 0.2, type: "spring", stiffness: 200 }}
          >
            {value}
          </motion.p>
          {change && <p className="text-xs text-accent mt-1 font-medium">{change}</p>}
          {href && <p className="text-xs text-accent/80 mt-2 font-medium">View details →</p>}
        </div>
        <motion.div
          whileHover={href ? { rotate: 8, scale: 1.05 } : undefined}
          className="p-2 sm:p-3 bg-aqua/10 rounded-xl flex-shrink-0"
        >
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-accent" />
        </motion.div>
      </div>
      <div className="absolute -bottom-4 -right-4 w-20 sm:w-24 h-20 sm:h-24 bg-aqua/5 rounded-full" />
    </GlassCard>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua rounded-2xl">
      {content}
    </Link>
  );
}
