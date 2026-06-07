import { contentToHtml } from "@/lib/markdown";

/** Normalize plain text, markdown, or HTML for TipTap editor/viewer. */
export function toEditorHtml(content?: string | null): string {
  if (!content?.trim()) return "";
  const html = contentToHtml(content.trim());
  return html || `<p>${escapePlain(content.trim())}</p>`;
}

function escapePlain(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
