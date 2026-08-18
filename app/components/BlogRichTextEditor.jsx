"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import {
  FiBold,
  FiItalic,
  FiLink,
  FiList,
  FiRotateCcw,
  FiRotateCw,
  FiType,
  FiUnderline,
} from "react-icons/fi";

function ToolbarButton({ active, disabled, onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm transition-colors ${
        active
          ? "border-[color-mix(in_srgb,var(--cw-neon)_35%,transparent)] bg-[color-mix(in_srgb,var(--cw-neon)_14%,var(--cw-surface))] text-[var(--cw-neon)]"
          : "border-transparent text-[var(--cw-ink-dim)] hover:bg-[var(--cw-overlay)]"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

export default function BlogRichTextEditor({
  value = "",
  onChange,
  placeholder = "Write your blog content…",
  minHeight = 220,
  ariaLabel = "Blog content",
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm prose-invert max-w-none focus:outline-none px-3 py-2 bg-[var(--cw-canvas)] text-[var(--cw-ink)] prose-headings:text-[var(--cw-ink)] prose-p:text-[var(--cw-ink-dim)] prose-li:text-[var(--cw-ink-dim)] prose-strong:text-[var(--cw-ink)] prose-a:text-[var(--cw-neon)] prose-img:rounded-lg prose-hr:border-[var(--cw-hairline)] prose-blockquote:text-[var(--cw-ink-muted)] [&_p]:my-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-4 [&_blockquote]:border-[var(--cw-hairline-strong)] [&_blockquote]:pl-3 [&_blockquote]:italic [&_a]:text-[var(--cw-neon)] [&_a]:underline",
        style: `min-height: ${minHeight}px`,
        "aria-label": ariaLabel,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value || "";
    if (next !== current && next !== current.replace("<p></p>", "")) {
      editor.commands.setContent(next, false);
    }
  }, [editor, value]);

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href;
    const url = window.prompt("Link URL", previous || "https://");
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
        className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-raised)] animate-pulse"
        style={{ minHeight }}
      />
    );
  }

  return (
    <div className="rounded-lg border border-[var(--cw-hairline)] bg-[var(--cw-surface)] overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--cw-hairline)] bg-[var(--cw-raised)] px-2 py-1.5">
        <ToolbarButton
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <FiBold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <FiItalic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <FiUnderline className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-[var(--cw-hairline-strong)]" />
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <span className="text-[11px] font-bold">H2</span>
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <span className="text-[11px] font-bold">H3</span>
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-[var(--cw-hairline-strong)]" />
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <FiList className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <span className="text-[11px] font-bold">1.</span>
        </ToolbarButton>
        <ToolbarButton
          title="Blockquote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <FiType className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Insert link" active={editor.isActive("link")} onClick={setLink}>
          <FiLink className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-[var(--cw-hairline-strong)]" />
        <ToolbarButton
          title="Undo"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <FiRotateCcw className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Redo"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <FiRotateCw className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function isRichTextEmpty(html = "") {
  const text = String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  return !text;
}
