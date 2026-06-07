"use client";

import { getJdSections, JD_SECTION_ORDER } from "@/lib/jdFormat";
import type { JdJson } from "@/lib/jdFormat";
import RichTextContent from "@/components/ui/RichTextContent";
import { formatInlineMarkdown } from "@/lib/markdown";
import { getPlainText } from "@/lib/richTextUtils";

interface JdViewDocumentProps {
  title: string;
  description: string;
  jdJson?: JdJson | null;
  department?: string;
  experienceLevel?: string;
  employmentType?: string;
  orgName?: string;
  isLivePreview?: boolean;
  status?: string;
}

export default function JdViewDocument({
  title,
  description,
  jdJson,
  department = "Engineering",
  experienceLevel = "2 years",
  employmentType,
  orgName = process.env.NEXT_PUBLIC_ORG_NAME || "XYZ",
  isLivePreview = false,
  status,
}: JdViewDocumentProps) {
  const useStructured = !isLivePreview && Boolean(getPlainText(description).trim());
  const sections = useStructured ? getJdSections(jdJson, description) : {};
  const hasSections = useStructured && JD_SECTION_ORDER.some(({ key }) => {
    const val = sections[key];
    return Array.isArray(val) ? val.length > 0 : Boolean(val);
  });

  const empLabel = employmentType === "internship" ? "Internship" : employmentType === "full_time" ? "Full-time" : null;

  return (
    <article className="min-w-0">
      <header className="mb-6 sm:mb-8 pb-6 border-b border-aqua/15">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-aqua/15 text-teal-dark border border-aqua/20">
            {department} · {experienceLevel}
          </span>
          {empLabel && (
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-cream text-body border border-aqua/15">
              {empLabel}
            </span>
          )}
          {status === "draft" && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Draft
            </span>
          )}
          {isLivePreview && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-100 text-green-800 border border-green-200 animate-pulse">
              Live preview
            </span>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-heading leading-tight break-words">
          {title}
        </h1>
        <p className="text-sm sm:text-base text-muted mt-2">
          at <strong className="text-heading">{orgName}</strong>
        </p>
      </header>

      <div className="jd-body space-y-4 sm:space-y-5 min-w-0">
        {hasSections ? (
          JD_SECTION_ORDER.map(({ key, label, list }) => {
            const sectionLabel = key === "about_company" ? `About ${orgName}` : label;
            const content = sections[key];
            const hasContent = Array.isArray(content) ? content.length > 0 : Boolean(content);
            if (!hasContent) return null;
            return (
              <section key={key} className="rounded-xl border border-aqua/15 bg-white/70 p-4 sm:p-6 min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-heading mb-3">{sectionLabel}</h2>
                {list && Array.isArray(content) ? (
                  <ul className="space-y-2">
                    {content.map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm sm:text-base text-body leading-relaxed">
                        <span className="text-accent shrink-0 mt-1">•</span>
                        <span
                          className="break-words"
                          dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(item) }}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p
                    className="text-sm sm:text-base text-body leading-relaxed break-words"
                    dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(content as string) }}
                  />
                )}
              </section>
            );
          })
        ) : (
          <div className="rounded-xl border border-aqua/15 bg-white/70 p-4 sm:p-6 min-w-0">
            <RichTextContent content={description} variant="on-light" />
          </div>
        )}
      </div>
    </article>
  );
}
