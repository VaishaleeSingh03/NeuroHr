"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, GitBranch, Target } from "lucide-react";
import RichTextContent from "@/components/ui/RichTextContent";
import { formatInlineMarkdown } from "@/lib/markdown";
import {
  getJdSections,
  JD_SECTION_ORDER,
  PIPELINE_STEP_LABELS,
  sectionsHaveContent,
  type JdJson,
  type PipelineStep,
  type SkillsMatrix,
} from "@/lib/jdFormat";

interface JdReviewPanelProps {
  description?: string;
  skillsMatrix?: SkillsMatrix | null;
  jdJson?: JdJson | null;
  pipeline?: PipelineStep[] | null;
  orgName?: string;
  /** When true, parse sections from description (HR edits) instead of static jd_json */
  preferDescription?: boolean;
  hasEdits?: boolean;
}

const HR_PIPELINE_STEPS = new Set([
  "analyze_repos",
  "map_skills",
  "draft_jd",
  "serialize_jd",
]);

function SkillTable({
  title,
  items,
  variant,
}: {
  title: string;
  items: { skill: string; category?: string; reason?: string }[];
  variant: "must" | "nice";
}) {
  if (!items.length) return null;
  return (
    <div className={`rounded-xl border p-3 sm:p-4 min-w-0 ${variant === "must" ? "border-aqua/25 bg-aqua/5" : "border-cream-warm bg-cream/40"}`}>
      <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${variant === "must" ? "text-teal-dark" : "text-body"}`}>
        {title} ({items.length})
      </p>
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {items.map((item, i) => (
          <div key={`${item.skill}-${i}`} className="bg-white/70 rounded-lg px-3 py-2 text-sm min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-heading">{item.skill}</span>
              {item.category && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-aqua/10 text-accent capitalize">
                  {item.category}
                </span>
              )}
            </div>
            {item.reason && (
              <p className="text-xs text-muted mt-1 break-words">
                <FormattedText text={item.reason} />
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FormattedText({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(text) }}
    />
  );
}

function SectionCard({
  label,
  content,
  list,
}: {
  label: string;
  content?: string | string[];
  list?: boolean;
}) {
  const hasContent = Array.isArray(content) ? content.length > 0 : Boolean(content?.trim());
  if (!hasContent) return null;

  return (
    <div className="rounded-xl border border-aqua/15 bg-white/60 p-4 sm:p-5 min-w-0">
      <h4 className="text-sm sm:text-base font-bold text-heading mb-3">{label}</h4>
      {list && Array.isArray(content) ? (
        <ul className="space-y-2">
          {content.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-body leading-relaxed">
              <span className="text-accent shrink-0 mt-0.5">•</span>
              <FormattedText text={item} className="break-words" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-body leading-relaxed break-words">
          <FormattedText text={content as string} />
        </p>
      )}
    </div>
  );
}

function pipelineStepDetail(step: PipelineStep) {
  if (step.step === "analyze_repos" && step.repos?.length) {
    return `Repos: ${step.repos.join(", ")}`;
  }
  if (step.step === "map_skills") {
    return `${step.must_have_count ?? 0} must-have · ${step.nice_to_have_count ?? 0} nice-to-have`;
  }
  if (step.step === "draft_jd") {
    return `${step.word_count ?? 0} words drafted`;
  }
  if (step.step === "serialize_jd") {
    return step.title || "Structured metadata saved";
  }
  return step.summary || step.title || "Completed";
}

export default function JdReviewPanel({
  description = "",
  skillsMatrix,
  jdJson,
  pipeline,
  orgName = process.env.NEXT_PUBLIC_ORG_NAME || "XYZ",
  preferDescription = false,
  hasEdits = false,
}: JdReviewPanelProps) {
  const [showPipeline, setShowPipeline] = useState(true);
  const [showSkills, setShowSkills] = useState(true);

  const sections = getJdSections(jdJson, description, { preferDescription });
  const mustHave = skillsMatrix?.must_have || [];
  const niceToHave = skillsMatrix?.nice_to_have || [];
  const pipelineSteps = (pipeline || []).filter((s) => HR_PIPELINE_STEPS.has(s.step));

  const sectionLabel = (key: string, label: string) =>
    key === "about_company" ? `About ${orgName}` : label;

  const hasJdContent = sectionsHaveContent(sections);
  const showRichFallback = hasEdits && !hasJdContent && Boolean(description?.trim());

  return (
    <div className="space-y-4 min-w-0">
      {/* 1. Generated JD — top */}
      <div className="rounded-xl border border-aqua/20 bg-white/60 overflow-hidden min-w-0">
        <div className="px-4 py-3 border-b border-aqua/10 bg-aqua/5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-heading">
            {hasEdits ? "Generated JD — reflects your edits" : "Generated JD — review before approving"}
          </p>
          {hasEdits && (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">
              Updated
            </span>
          )}
        </div>
        <div className="px-4 py-4 space-y-3 max-h-[520px] overflow-y-auto">
          {hasJdContent ? (
            JD_SECTION_ORDER.map(({ key, label, list }) => (
              <SectionCard
                key={key}
                label={sectionLabel(key, label)}
                content={sections[key]}
                list={list}
              />
            ))
          ) : showRichFallback ? (
            <RichTextContent content={description} variant="on-light" />
          ) : (
            <p className="text-sm text-muted italic">JD sections will appear after KB generation completes.</p>
          )}
        </div>
      </div>

      {/* 2. Generation pipeline */}
      {pipelineSteps.length > 0 && (
        <div className="rounded-xl border border-aqua/15 bg-white/50 overflow-hidden min-w-0">
          <button
            type="button"
            onClick={() => setShowPipeline((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-aqua/5 transition-colors"
          >
            <span className="text-sm font-semibold text-heading flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-accent shrink-0" />
              Generation pipeline ({pipelineSteps.length} steps)
            </span>
            {showPipeline ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
          </button>
          {showPipeline && (
            <div className="px-4 pb-4 space-y-2 border-t border-aqua/10">
              {pipelineSteps.map((step, i) => (
                <div key={step.step} className="flex gap-3 items-start pt-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-aqua/15 text-accent text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-heading">
                      {PIPELINE_STEP_LABELS[step.step] || step.step.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted mt-0.5 break-words">
                      {pipelineStepDetail(step)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Skills matrix */}
      {(mustHave.length > 0 || niceToHave.length > 0) && (
        <div className="rounded-xl border border-aqua/15 bg-white/50 overflow-hidden min-w-0">
          <button
            type="button"
            onClick={() => setShowSkills((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-aqua/5 transition-colors"
          >
            <span className="text-sm font-semibold text-heading flex items-center gap-2">
              <Target className="w-4 h-4 text-accent shrink-0" />
              Skills matrix — must-have vs nice-to-have
            </span>
            {showSkills ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
          </button>
          {showSkills && (
            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-aqua/10 pt-3">
              <SkillTable title="Must-have skills" items={mustHave} variant="must" />
              <SkillTable title="Nice-to-have skills" items={niceToHave} variant="nice" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
