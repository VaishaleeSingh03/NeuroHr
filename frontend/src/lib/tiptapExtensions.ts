import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

export function getTiptapExtensions(placeholder?: string): Extensions {
  const extensions: Extensions = [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      codeBlock: false,
    }),
    Underline,
    Link.configure({ openOnClick: true, autolink: true, linkOnPaste: true }),
  ];

  if (placeholder) {
    extensions.push(Placeholder.configure({ placeholder }));
  }

  return extensions;
}
