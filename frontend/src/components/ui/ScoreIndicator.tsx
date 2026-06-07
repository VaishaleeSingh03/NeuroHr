"use client";

import { motion } from "framer-motion";
import { cn, getScoreClass } from "@/lib/utils";

interface ScoreIndicatorProps {
  score: number;
  label?: string;
  size?: "sm" | "md" | "lg";
  showRing?: boolean;
}

const SIZES = { sm: 48, md: 72, lg: 96 };

export default function ScoreIndicator({ score, label, size = "md", showRing = true }: ScoreIndicatorProps) {
  const dim = SIZES[size];
  const circumference = 2 * Math.PI * (dim / 2 - 4);
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-2">
      {showRing ? (
        <div className="relative" style={{ width: dim, height: dim }}>
          <svg width={dim} height={dim} className="-rotate-90">
            <circle cx={dim / 2} cy={dim / 2} r={dim / 2 - 4} fill="none" stroke="#F6E6C2" strokeWidth="6" />
            <motion.circle
              cx={dim / 2}
              cy={dim / 2}
              r={dim / 2 - 4}
              fill="none"
              stroke="#00B8B8"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn("font-bold text-heading", size === "lg" ? "text-xl sm:text-2xl" : "text-base sm:text-lg")}>
              {Math.round(score)}%
            </span>
          </div>
        </div>
      ) : (
        <span className={cn("score-badge", getScoreClass(score))}>{Math.round(score)}%</span>
      )}
      {label && <span className="text-xs sm:text-sm text-label font-medium">{label}</span>}
    </div>
  );
}
