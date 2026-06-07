"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type { RichTextVariant } from "./RichTextContentInner";

function ViewerSkeleton({ className, maxHeight }: { className?: string; maxHeight?: string }) {
  return (
    <div
      className={cn("rounded-lg border border-aqua/10 bg-cream/30 p-3 flex items-center gap-2 text-xs text-muted", className)}
      style={maxHeight ? { maxHeight } : undefined}
      data-tiptap-loading="true"
    >
      <Loader2 className="w-3 h-3 animate-spin text-aqua" />
      Loading…
    </div>
  );
}

const RichTextContent = dynamic(() => import("./RichTextContentInner"), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

export default RichTextContent;
