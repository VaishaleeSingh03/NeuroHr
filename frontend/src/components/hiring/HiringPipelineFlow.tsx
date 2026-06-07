"use client";

import Link from "next/link";
import { Loader2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { FULL_HIRING_PIPELINE, getPipelineStepHref } from "@/lib/hiringPipeline";

interface Props {
  currentStep: number;
  className?: string;
  /** When true (default), every step links to its page + section anchor */
  linkable?: boolean;
  /** Candidate portal — maps recruiter steps to job-openings / interviews */
  candidate?: boolean;
  processing?: boolean;
  activeDetail?: string;
  /** Inline expandable panels per step (jobs page) */
  expandable?: boolean;
  expandedStep?: number | null;
  stepPanels?: Partial<Record<number, React.ReactNode>>;
}

export default function HiringPipelineFlow({
  currentStep,
  className = "",
  linkable = true,
  candidate = false,
  processing = false,
  activeDetail,
  expandable = false,
  expandedStep = null,
  stepPanels,
}: Props) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-2 sm:gap-2.5">
        {FULL_HIRING_PIPELINE.map((step) => {
          const done = step.id < currentStep;
          const active = step.id === currentStep;
          const isProcessing = active && processing;
          const isExpanded = expandable && expandedStep === step.id;
          const hasPanel = expandable && Boolean(stepPanels?.[step.id]);
          const href = getPipelineStepHref(step.id, { candidate });

          const detail = active && (activeDetail || isProcessing)
            ? activeDetail || step.short
            : step.short;

          const header = (
            <div
              className={`flex items-start gap-3 p-3 sm:p-3.5 rounded-xl border transition-all duration-300 min-w-0 w-full text-left ${
                linkable ? "cursor-pointer hover:border-aqua/50 hover:bg-aqua/5" : ""
              } ${
                active || isExpanded
                  ? "border-aqua bg-aqua/10 shadow-sm"
                  : done
                    ? "border-aqua/25 bg-cream/50"
                    : "border-transparent bg-white/30 opacity-70 hover:opacity-100"
              }`}
            >
              <span
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  active || isExpanded
                    ? "bg-aqua text-inverse"
                    : done
                      ? "bg-aqua/20 text-accent"
                      : "bg-cream-warm/80 text-muted"
                }`}
              >
                {done ? (
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                ) : isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  step.id
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold text-sm flex flex-wrap items-center gap-2 ${active || isExpanded ? "text-heading" : done ? "text-body" : "text-muted"}`}>
                  <span>{step.label}</span>
                  {active && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-aqua text-inverse shrink-0">
                      {isProcessing ? "Processing" : "Current"}
                    </span>
                  )}
                  {done && !active && (
                    <span className="text-[10px] font-semibold uppercase text-accent/80">Done</span>
                  )}
                  {expandable && hasPanel && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-muted shrink-0">
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </p>
                <p className={`text-xs mt-0.5 break-words ${active || isExpanded ? "text-body" : "text-muted"}`}>
                  {detail}
                </p>
                {isProcessing && (
                  <div className="mt-2 h-1 w-full max-w-xs rounded-full bg-cream overflow-hidden">
                    <div className="h-full w-1/3 rounded-full bg-aqua animate-pulse" />
                  </div>
                )}
              </div>
            </div>
          );

          const panelBlock = isExpanded && stepPanels?.[step.id] ? (
            <div className="ml-2 sm:ml-4 pl-3 sm:pl-4 border-l-2 border-aqua/20 py-3 pr-1 min-w-0 animate-fade-in">
              {stepPanels[step.id]}
            </div>
          ) : null;

          const stepBlock = linkable ? (
            <Link href={href} className="block scroll-mt-24">
              {header}
            </Link>
          ) : (
            header
          );

          return (
            <div key={step.id} id={step.anchor} className="min-w-0 scroll-mt-24">
              {stepBlock}
              {panelBlock}
            </div>
          );
        })}
      </div>
    </div>
  );
}
