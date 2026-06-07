"use client";

import { CheckCircle, Loader2, Circle } from "lucide-react";
import { motion } from "framer-motion";

export interface PipelineProgressStep {
  id: string;
  label: string;
}

interface JdPipelineProgressProps {
  title: string;
  subtitle?: string;
  steps: PipelineProgressStep[];
  activeIndex: number;
  complete?: boolean;
}

export const KB_GENERATION_STEPS: PipelineProgressStep[] = [
  { id: "analyze_repos", label: "Analyzing repos & tech stack" },
  { id: "map_skills", label: "Mapping must-have vs nice-to-have skills" },
  { id: "draft_jd", label: "Drafting 7-section JD" },
  { id: "serialize_jd", label: "Serializing structured metadata" },
];

export const MANUAL_JD_STEPS: PipelineProgressStep[] = [
  { id: "parse", label: "Parsing job description" },
  { id: "skills", label: "Extracting skills & experience" },
  { id: "salary", label: "Estimating salary insights" },
];

export default function JdPipelineProgress({
  title,
  subtitle,
  steps,
  activeIndex,
  complete = false,
}: JdPipelineProgressProps) {
  return (
    <div className="rounded-xl border border-aqua/25 bg-gradient-to-br from-aqua/10 via-white/80 to-cream/40 p-4 sm:p-5 min-w-0">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-aqua/15 shrink-0">
          {!complete ? (
            <Loader2 className="w-5 h-5 text-accent animate-spin" />
          ) : (
            <CheckCircle className="w-5 h-5 text-accent" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-heading">{title}</p>
          {subtitle && <p className="text-xs text-muted mt-0.5 break-words">{subtitle}</p>}
        </div>
      </div>

      {!complete && (
        <div className="h-1.5 w-full rounded-full bg-cream overflow-hidden mb-4">
          <motion.div
            className="h-full rounded-full bg-aqua"
            initial={{ width: "8%" }}
            animate={{ width: `${Math.min(95, 12 + activeIndex * 18)}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}

      <div className="space-y-2.5">
        {steps.map((step, i) => {
          const done = complete || i < activeIndex;
          const active = !complete && i === activeIndex;
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors min-w-0 ${
                active ? "bg-aqua/10 border border-aqua/20" : done ? "opacity-90" : "opacity-50"
              }`}
            >
              {done ? (
                <CheckCircle className="w-4 h-4 text-accent shrink-0" />
              ) : active ? (
                <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-muted shrink-0" />
              )}
              <span className={`break-words ${active ? "font-semibold text-heading" : "text-body"}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
