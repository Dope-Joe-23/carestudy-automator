import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { renderAssistantMarkdownForEditing } from "@/components/assistant-markdown-html";
import { markdownFromEditorHtml } from "@/lib/studentDocumentMarkdown";

type StudentDocumentRichEditorProps = {
  content: string;
  onChange: (content: string) => void;
  onSelectionChange?: () => void;
  style?: CSSProperties;
};

export type StudentDocumentRichEditorHandle = {
  getElement: () => HTMLDivElement | null;
  runCommand: (command: string, value?: string) => boolean;
};

export const StudentDocumentRichEditor = forwardRef<
  StudentDocumentRichEditorHandle,
  StudentDocumentRichEditorProps
>(function StudentDocumentRichEditor({ content, onChange, onSelectionChange, style }, ref) {
  const [initialBlocks] = useState(() => {
    const template = document.createElement("template");
    template.innerHTML = renderAssistantMarkdownForEditing(content);
    const root = template.content.firstElementChild;
    return root ? Array.from(root.childNodes).map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      return (node as HTMLElement).outerHTML;
    }).filter((block) => block.trim()) : [];
  });
  // Keep the HTML prop identity stable across parent updates. Parent state is
  // updated as the user types; recreating these objects on every render makes
  // React rewrite innerHTML and drops the browser's active selection/caret.
  const blockHtml = useMemo(
    () => initialBlocks.map((html) => ({ __html: html })),
    [initialBlocks],
  );
  const editorRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<(HTMLElement | null)[]>([]);
  const selectionChangeRef = useRef(onSelectionChange);
  const suppressInputRef = useRef(false);

  useEffect(() => {
    selectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    const updateSelection = () => selectionChangeRef.current?.();
    document.addEventListener("selectionchange", updateSelection);
    return () => document.removeEventListener("selectionchange", updateSelection);
  }, []);

  const publishChange = () => {
    const html = blockRefs.current
      .map((block) => block?.outerHTML ?? "")
      .join("");
    onChange(markdownFromEditorHtml(html));
  };

  const runCommand = (command: string, value?: string) => {
    const editor = editorRef.current;
    if (!editor) return false;
    const before = editor.innerHTML;
    suppressInputRef.current = true;
    try {
      document.execCommand(command, false, value);
    } finally {
      window.requestAnimationFrame(() => {
        suppressInputRef.current = false;
      });
    }
    if (editor.innerHTML !== before) publishChange();
    return editor.innerHTML !== before;
  };

  useImperativeHandle(ref, () => ({
    getElement: () => editorRef.current,
    runCommand,
  }));

  return (
    <div
      ref={editorRef}
      role="group"
      aria-label="Edit chapter text"
      onMouseUp={onSelectionChange}
      onKeyUp={onSelectionChange}
      className="student-document-rich-editor mt-1.5 min-h-[60vh] space-y-2 text-foreground"
      style={style}
    >
      {initialBlocks.map((html, index) => (
        <div
          key={index}
          ref={(element) => { blockRefs.current[index] = element; }}
          role="textbox"
          aria-label={`Edit chapter text, block ${index + 1}`}
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onInput={() => {
            if (!suppressInputRef.current) publishChange();
          }}
          className="whitespace-pre-wrap rounded-sm outline-none focus:outline-none"
          dangerouslySetInnerHTML={blockHtml[index]}
        />
      ))}
    </div>
  );
});
