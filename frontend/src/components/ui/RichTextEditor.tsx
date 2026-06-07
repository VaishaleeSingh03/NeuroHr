"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type { RichTextEditorProps } from "./RichTextEditorInner";
export { getPlainText, getRichHtml, isRichTextEmpty } from "@/lib/richTextUtils";

function EditorSkeleton({ minHeight = "100px", className }: { minHeight?: string; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-aqua/20 bg-white/70 flex items-center justify-center text-muted text-xs gap-2",
        className,
      )}
      style={{ minHeight }}
      data-tiptap-loading="true"
    >
      <Loader2 className="w-4 h-4 animate-spin text-aqua" />
      Loading TipTap editor…
    </div>
  );
}

const RichTextEditor = dynamic(() => import("./RichTextEditorInner"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

export default RichTextEditor;
