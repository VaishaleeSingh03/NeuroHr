"use client";

import { useEffect, useMemo } from "react";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import { Bold, Italic, Underline as UnderlineIcon, Link2, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTiptapExtensions } from "@/lib/tiptapExtensions";
import { toEditorHtml } from "@/lib/tiptapContent";

export interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  disabled?: boolean;
  /** full = lists + formatting; minimal = bold/italic/underline/link only */
  variant?: "full" | "minimal";
}

function ToolbarButton({
  children,
  onClick,
  active,
  title,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1 min-w-[2.25rem] px-2.5 py-2 rounded-lg text-xs font-semibold transition-all border shadow-sm",
        active
          ? "bg-aqua text-inverse border-aqua"
          : "text-teal-dark bg-white border-aqua/30 hover:bg-aqua/10 hover:border-aqua/50",
      )}
    >
      {children}
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

export default function RichTextEditorInner({
  value = "",
  onChange,
  placeholder = "Write here…",
  className,
  minHeight = "100px",
  disabled = false,
  variant = "full",
}: RichTextEditorProps) {
  const htmlValue = useMemo(() => toEditorHtml(value), [value]);
  const extensions = useMemo(() => getTiptapExtensions(placeholder), [placeholder]);

  const editor = useEditor(
    {
      extensions,
      content: htmlValue || "<p></p>",
      editable: !disabled,
      editorProps: {
        attributes: {
          class: "prose prose-sm max-w-none focus:outline-none px-3 py-2 text-heading min-h-[inherit]",
          "data-placeholder": placeholder,
        },
      },
      onUpdate: ({ editor: ed }) => onChange?.(ed.getHTML()),
    },
    [extensions],
  );

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const normalizedCurrent = current === "<p></p>" ? "" : current;
    const normalizedValue = htmlValue || "";
    if (normalizedValue !== normalizedCurrent) {
      editor.commands.setContent(normalizedValue || "<p></p>", { emitUpdate: false });
    }
  }, [htmlValue, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [disabled, editor]);

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) return null;
      return {
        bold: ed.isActive("bold"),
        italic: ed.isActive("italic"),
        underline: ed.isActive("underline"),
        bulletList: ed.isActive("bulletList"),
        orderedList: ed.isActive("orderedList"),
        link: ed.isActive("link"),
      };
    },
  });

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter link URL", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  if (!editor) {
    return (
      <div
        className={cn("rounded-xl border border-aqua/20 bg-white/70 animate-pulse", className)}
        style={{ minHeight }}
        data-tiptap-loading="true"
      />
    );
  }

  return (
    <div
      className={cn("tiptap-editor rounded-xl border border-aqua/20 bg-white/70 overflow-hidden", className)}
      data-tiptap-editor="true"
    >
      <div className="flex flex-wrap gap-1.5 border-b border-aqua/20 px-2.5 py-2 bg-teal-dark/5">
        <ToolbarButton
          active={toolbar?.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
          label="Bold"
        >
          <Bold className="w-4 h-4 shrink-0" strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          active={toolbar?.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
          label="Italic"
        >
          <Italic className="w-4 h-4 shrink-0" strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          active={toolbar?.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
          label="Underline"
        >
          <UnderlineIcon className="w-4 h-4 shrink-0" strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton active={toolbar?.link} onClick={setLink} title="Add link" label="Link">
          <Link2 className="w-4 h-4 shrink-0" strokeWidth={2.5} />
        </ToolbarButton>
        {variant === "full" && (
          <>
            <span className="w-px h-6 bg-aqua/20 self-center mx-0.5" />
            <ToolbarButton
              active={toolbar?.bulletList}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Bullet list"
            >
              <List className="w-4 h-4 shrink-0" strokeWidth={2.5} />
            </ToolbarButton>
            <ToolbarButton
              active={toolbar?.orderedList}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="Numbered list"
            >
              <ListOrdered className="w-4 h-4 shrink-0" strokeWidth={2.5} />
            </ToolbarButton>
          </>
        )}
        <span className="ml-auto text-[10px] font-medium text-label self-center pr-1 hidden sm:inline">Format</span>
      </div>
      <div style={{ minHeight }} className="rich-text-editor">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
