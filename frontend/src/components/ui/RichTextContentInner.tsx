"use client";

import { useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { getTiptapExtensions } from "@/lib/tiptapExtensions";
import { toEditorHtml } from "@/lib/tiptapContent";

export type RichTextVariant = "on-light" | "on-dark";

interface RichTextContentProps {
  content?: string;
  html?: string;
  variant?: RichTextVariant;
  className?: string;
  maxHeight?: string;
}

export default function RichTextContentInner({
  content,
  html,
  variant = "on-light",
  className,
  maxHeight,
}: RichTextContentProps) {
  const raw = content ?? html ?? "";
  const rendered = useMemo(() => toEditorHtml(raw), [raw]);
  const extensions = useMemo(() => getTiptapExtensions(), []);

  const editor = useEditor(
    {
      extensions,
      content: rendered || "<p></p>",
      editable: false,
      editorProps: {
        attributes: {
          class: "prose prose-sm max-w-none focus:outline-none text-inherit",
        },
      },
    },
    [extensions],
  );

  useEffect(() => {
    if (!editor) return;
    const next = rendered || "<p></p>";
    const current = editor.getHTML();
    if (next !== current) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [rendered, editor]);

  if (!raw?.trim()) return null;

  if (!editor) {
    return (
      <div
        className={cn("rounded-lg border border-aqua/10 bg-cream/30 p-3 animate-pulse text-xs text-muted", className)}
        style={maxHeight ? { maxHeight } : undefined}
        data-tiptap-loading="true"
      >
        Loading…
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rich-text-content rich-text-viewer tiptap-viewer rounded-lg",
        variant === "on-dark" ? "rich-text-content--on-dark" : "rich-text-content--on-light",
        className,
      )}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      data-tiptap-viewer="true"
    >
      <EditorContent editor={editor} />
    </div>
  );
}
