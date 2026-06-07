"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}

export default function PageHeader({ title, subtitle, icon: Icon, action }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="hidden sm:flex p-2.5 bg-aqua/10 rounded-xl">
            <Icon className="w-6 h-6 text-accent" />
          </div>
        )}
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </motion.div>
  );
}
