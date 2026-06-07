export interface SkillEntry {
  skill: string;
  category?: string;
  reason?: string;
}

export interface SkillsMatrix {
  role_title?: string;
  experience_level?: string;
  must_have?: SkillEntry[];
  nice_to_have?: SkillEntry[];
  must_have_count?: number;
  nice_to_have_count?: number;
}

export interface JdSections {
  about_role?: string;
  responsibilities?: string[];
  qualifications?: string[];
  nice_to_have?: string[];
  benefits?: string[];
  location_experience?: string;
  about_company?: string;
}

export interface JdJson {
  title?: string;
  sections?: JdSections;
  metadata?: {
    role_title?: string;
    department?: string;
    skills_must_have?: string[];
    skills_nice_to_have?: string[];
    generated_at?: string;
  };
}

export interface PipelineStep {
  step: string;
  repos?: string[];
  summary?: string;
  must_have_count?: number;
  nice_to_have_count?: number;
  word_count?: number;
  title?: string;
  count?: number;
}

export const JD_SECTION_ORDER: { key: keyof JdSections; label: string; list?: boolean }[] = [
  { key: "about_role", label: "About the Role" },
  { key: "responsibilities", label: "What You'll Do", list: true },
  { key: "qualifications", label: "Qualifications", list: true },
  { key: "nice_to_have", label: "Nice to Have", list: true },
  { key: "benefits", label: "Benefits", list: true },
  { key: "location_experience", label: "Location & Experience" },
  { key: "about_company", label: "About the Company" },
];

const HEADING_ALIASES: Record<keyof JdSections, RegExp[]> = {
  about_role: [/^about the role$/i],
  responsibilities: [/^what you'?ll do$/i, /^responsibilities$/i],
  qualifications: [/^qualifications$/i, /^must[- ]have$/i],
  nice_to_have: [/^nice to have$/i, /^bonus skills$/i],
  benefits: [/^benefits$/i],
  location_experience: [/^location & experience$/i, /^location and experience$/i],
  about_company: [/^about /i],
};

function stripMarkdownBold(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").trim();
}

function parseListItems(block: string): string[] {
  return block
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter(Boolean)
    .map(stripMarkdownBold);
}

export function parseMarkdownToSections(markdown: string): JdSections {
  const sections: JdSections = {};
  if (!markdown?.trim()) return sections;

  const lines = markdown.split("\n");
  let currentKey: keyof JdSections | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentKey) return;
    const text = buffer.join("\n").trim();
    if (!text) {
      buffer = [];
      return;
    }
    const def = JD_SECTION_ORDER.find((s) => s.key === currentKey);
    if (def?.list) {
      sections[currentKey] = parseListItems(text) as never;
    } else {
      sections[currentKey] = stripMarkdownBold(text.replace(/\n+/g, " ")) as never;
    }
    buffer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    const heading = line.match(/^#{1,3}\s+(.+)$/) || line.match(/^\*\*(.+?)\*\*$/);
    if (heading) {
      const title = stripMarkdownBold(heading[1]);
      const matched = (Object.keys(HEADING_ALIASES) as (keyof JdSections)[]).find((key) =>
        HEADING_ALIASES[key].some((rx) => rx.test(title))
      );
      if (matched) {
        flush();
        currentKey = matched;
        continue;
      }
    }
    if (currentKey) buffer.push(raw);
  }
  flush();
  return sections;
}

function htmlToMarkdownLike(html: string): string {
  if (!html?.trim()) return "";
  if (typeof document === "undefined") {
    return html.replace(/<\/(p|h[1-3]|li)>/gi, "\n").replace(/<[^>]+>/g, "").trim();
  }

  const div = document.createElement("div");
  div.innerHTML = html;
  const lines: string[] = [];

  const pushHeading = (text: string) => {
    const cleaned = text.replace(/^#+\s*/, "").trim();
    if (!cleaned) return;
    lines.push(`## ${cleaned}`, "");
  };

  for (const node of Array.from(div.children)) {
    const tag = node.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      pushHeading(node.textContent || "");
      continue;
    }

    if (tag === "p") {
      const raw = node.textContent?.trim() || "";
      const hashHeading = raw.match(/^#{1,3}\s+(.+)$/);
      if (hashHeading) {
        pushHeading(hashHeading[1]);
        continue;
      }
      const strong = node.querySelector("strong");
      if (strong && raw === (strong.textContent?.trim() || "")) {
        pushHeading(raw);
        continue;
      }
      if (raw) lines.push(raw, "");
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      for (const li of Array.from(node.querySelectorAll(":scope > li"))) {
        const item = li.textContent?.trim();
        if (item) lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

export function parseDescriptionToSections(description?: string): JdSections {
  if (!description?.trim()) return {};
  const trimmed = description.trim();
  const markdown = /<[a-z][\s\S]*>/i.test(trimmed) ? htmlToMarkdownLike(trimmed) : trimmed;
  return parseMarkdownToSections(markdown);
}

export function sectionsHaveContent(sections: JdSections): boolean {
  return JD_SECTION_ORDER.some(({ key }) => {
    const val = sections[key];
    return Array.isArray(val) ? val.length > 0 : Boolean(val);
  });
}

export function getJdSections(
  jdJson?: JdJson | null,
  description?: string,
  opts?: { preferDescription?: boolean },
): JdSections {
  const parsed = parseDescriptionToSections(description || "");
  if (opts?.preferDescription && sectionsHaveContent(parsed)) {
    return parsed;
  }
  const fromJson = jdJson?.sections;
  if (fromJson && Object.keys(fromJson).length > 0) {
    return fromJson;
  }
  return parsed;
}

export const PIPELINE_STEP_LABELS: Record<string, string> = {
  analyze_repos: "Analyze repos & tech stack",
  map_skills: "Map must-have vs nice-to-have skills",
  draft_jd: "Draft 7-section JD",
  serialize_jd: "Serialize structured metadata",
};
