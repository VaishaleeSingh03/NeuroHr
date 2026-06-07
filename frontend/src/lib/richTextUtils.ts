/** Plain-text helpers (no TipTap imports). */
export function getPlainText(html: string) {
  if (!html?.trim()) return "";
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, "").trim();
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() || "";
}

export function isRichTextEmpty(html: string) {
  return !getPlainText(html);
}

/** TipTap HTML for API storage — keeps bold, italic, underline, links. */
export function getRichHtml(html: string) {
  const trimmed = html?.trim() || "";
  if (!trimmed || trimmed === "<p></p>") return "";
  return trimmed;
}
