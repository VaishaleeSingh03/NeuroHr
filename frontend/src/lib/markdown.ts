/** Convert AI markdown (**, ##, lists, links, tables) to HTML for TipTap / RichTextContent */

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline **bold**, *italic*, links, `code` — safe for dangerouslySetInnerHTML after escapeHtml base */
export function formatInlineMarkdown(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  return s;
}

export function hasMarkdownSyntax(text: string): boolean {
  return /(\*\*|__|(?:^|[\n>])\s*#{1,3}\s|(?:^|[\n>])\s*[-*]\s|\[[^\]]+\]\([^)]+\)|`[^`]+`)/m.test(text);
}

function isTiptapLikeHtml(text: string): boolean {
  return /<(?:p|h[1-6]|ul|ol|li|strong|em|u|a|br)\b/i.test(text);
}

function htmlToPlainLines(html: string): string {
  if (typeof document === "undefined") {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h[1-6]|li)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.innerText || div.textContent || "").trim();
}

/** Fix ** / * left inside TipTap HTML paragraphs */
function convertMarkdownInHtml(html: string): string {
  let out = html;
  out = out.replace(/\*\*([^*<]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_<]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*([^*<\n]+)\*(?!\*)/g, "<em>$1</em>");
  out = out.replace(/`([^`<]+)`/g, "<code>$1</code>");

  if (typeof document !== "undefined") {
    const div = document.createElement("div");
    div.innerHTML = out;
    for (const p of Array.from(div.querySelectorAll("p"))) {
      const raw = p.textContent?.trim() || "";
      const h2 = raw.match(/^##\s+(.+)$/);
      const h3 = raw.match(/^###\s+(.+)$/);
      const h1 = raw.match(/^#\s+(.+)$/);
      if (h1 || h2 || h3) {
        const title = (h1 || h2 || h3)![1];
        const tag = h3 ? "h3" : "h2";
        const heading = document.createElement(tag);
        heading.innerHTML = formatInlineMarkdown(title);
        p.replaceWith(heading);
      }
    }
    out = div.innerHTML;
  }

  return out;
}

function isTableRow(line: string) {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isTableSeparator(line: string) {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function parseTableRow(line: string) {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
}

function parseMarkdownLines(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(trimmed).map(formatInlineMarkdown);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        rows.push(parseTableRow(lines[i].trim()).map(formatInlineMarkdown));
        i++;
      }
      const thead = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
      blocks.push(`<table class="rich-table">${thead}${tbody}</table>`);
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.+)$/);
    const h2 = trimmed.match(/^##\s+(.+)$/);
    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1 || h2 || h3) {
      const title = (h1 || h2 || h3)![1];
      const tag = h3 ? "h3" : "h2";
      blocks.push(`<${tag}>${formatInlineMarkdown(title)}</${tag}>`);
      i++;
      continue;
    }

    if (/^[-*]\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const tl = lines[i].trim();
        if (!tl) {
          i++;
          break;
        }
        const item = tl.match(/^[-*]\s+(.+)$/);
        if (!item) break;
        items.push(`<li>${formatInlineMarkdown(item[1])}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const tl = lines[i].trim();
      if (!tl) {
        i++;
        break;
      }
      if (/^#{1,3}\s/.test(tl) || /^[-*]\s/.test(tl) || isTableRow(tl)) break;
      paraLines.push(formatInlineMarkdown(tl));
      i++;
    }
    if (paraLines.length) {
      blocks.push(`<p>${paraLines.join("<br/>")}</p>`);
    }
  }

  return blocks.join("");
}

export function markdownToHtml(text: string): string {
  if (!text?.trim()) return "";

  const trimmed = text.trim();

  if (isTiptapLikeHtml(trimmed) && !hasMarkdownSyntax(trimmed)) {
    return trimmed;
  }

  if (isTiptapLikeHtml(trimmed) && hasMarkdownSyntax(trimmed)) {
    const converted = convertMarkdownInHtml(trimmed);
    if (!hasMarkdownSyntax(converted)) {
      return converted;
    }
    return parseMarkdownLines(htmlToPlainLines(converted));
  }

  return parseMarkdownLines(trimmed);
}

export function contentToHtml(content: string): string {
  if (!content) return "";
  return markdownToHtml(content);
}
