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
      className="page-header flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 min-w-0"
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {Icon && (
          <div className="hidden sm:flex p-2.5 bg-aqua/10 rounded-xl shrink-0">
            <Icon className="w-6 h-6 text-accent" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="page-title break-words">{title}</h1>
          {subtitle && <p className="page-subtitle break-words">{subtitle}</p>}
        </div>
      </div>
      {action && (
        <div className="w-full sm:w-auto shrink-0 btn-group-responsive [&_button]:min-h-[2.5rem]">
          {action}
        </div>
      )}
    </motion.div>
  );
}
