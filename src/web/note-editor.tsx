import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  RemoveFormatting,
  Undo2,
  Redo2,
  Check,
  Trash2,
} from "lucide-react";
import { useTravel } from "@/data/travel-provider";
import type { TravelNote } from "@/data/types";
import {
  legacyNoteContent,
  notePlainText,
  validNoteContent,
  NOTE_TITLE_LIMIT,
  NOTE_BODY_LIMIT,
} from "@/data/notes";
import { Modal } from "./ui";
import { dismissModal } from "./motion";
import { Input } from "./obsidian/input";

export function NoteEditor({
  initial,
  onClose,
}: {
  initial: TravelNote;
  onClose: () => void;
}) {
  const {
    saveNote,
    deleteNote,
    canEdit,
    selectedTrip,
    notes,
    pendingCount,
    error: syncError,
  } = useTravel();
  const [draft, setDraft] = useState(initial);
  const [saveError, setSaveError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const latest = useRef(initial);
  const dirty = useRef(false);
  const exists = useRef(notes.some((note) => note.id === initial.id));
  const tripId = useRef(selectedTrip!.id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty.current || !canEdit) return;
    if (
      !exists.current &&
      !latest.current.title?.trim() &&
      !latest.current.body.trim()
    ) {
      dirty.current = false;
      setWaiting(false);
      return;
    }
    try {
      const { title = "", body, content } = latest.current;
      saveNote(initial.id, { title, body, content }, tripId.current);
      dirty.current = false;
      exists.current = true;
      setWaiting(false);
      setSaveError("");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "保存できませんでした。もう一度お試しください。",
      );
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const persist = () => flushRef.current();
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persist);
      persist();
    };
  }, []);
  const change = (patch: Partial<TravelNote>) => {
    latest.current = { ...latest.current, ...patch };
    dirty.current = true;
    setDraft(latest.current);
    setWaiting(true);
    setSaveError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 500);
  };
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
        link: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        trailingNode: false,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
        a11y: {
          checkboxLabel: (node) => `${node.textContent || "項目"}を完了`,
        },
      }),
      Extension.create({
        name: "noteLimit",
        addProseMirrorPlugins: () => [
          new Plugin({
            filterTransaction(transaction) {
              if (!transaction.docChanged) return true;
              const content = transaction.doc.toJSON();
              if (
                !validNoteContent(content) ||
                notePlainText(content).length > NOTE_BODY_LIMIT
              ) {
                setSaveError(
                  "メモの文字数・書式の上限に達しました。内容を短くしてお試しください。",
                );
                return false;
              }
              return true;
            },
          }),
        ],
      }),
    ],
    content: validNoteContent(initial.content)
      ? initial.content
      : legacyNoteContent(initial.body),
    editable: canEdit,
    autofocus: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      scrollThreshold: { top: 170, bottom: 24, left: 0, right: 0 },
      scrollMargin: { top: 170, bottom: 24, left: 0, right: 0 },
      attributes: {
        class: "note-rich-text",
        role: "textbox",
        "aria-label": "メモ本文",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => {
      const content = editor.getJSON();
      change({ content, body: notePlainText(content) });
    },
  });
  useEffect(() => {
    editor?.setEditable(canEdit, false);
  }, [editor, canEdit]);
  const close = () => {
    flush();
    onClose();
  };
  const controls = editor
    ? [
        {
          label: "太字",
          icon: Bold,
          active: editor.isActive("bold"),
          run: () => editor.chain().focus().toggleBold().run(),
        },
        {
          label: "斜体",
          icon: Italic,
          active: editor.isActive("italic"),
          run: () => editor.chain().focus().toggleItalic().run(),
        },
        {
          label: "下線",
          icon: Underline,
          active: editor.isActive("underline"),
          run: () => editor.chain().focus().toggleUnderline().run(),
        },
        {
          label: "取り消し線",
          icon: Strikethrough,
          active: editor.isActive("strike"),
          run: () => editor.chain().focus().toggleStrike().run(),
        },
        {
          label: "見出し",
          icon: Heading2,
          active: editor.isActive("heading", { level: 2 }),
          run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        },
        {
          label: "書式を解除",
          icon: RemoveFormatting,
          run: () => editor.chain().focus().clearNodes().unsetAllMarks().run(),
        },
        {
          label: "箇条書き",
          icon: List,
          active: editor.isActive("bulletList"),
          run: () => editor.chain().focus().toggleBulletList().run(),
        },
        {
          label: "番号付きリスト",
          icon: ListOrdered,
          active: editor.isActive("orderedList"),
          run: () => editor.chain().focus().toggleOrderedList().run(),
        },
        {
          label: "チェックリスト",
          icon: ListChecks,
          active: editor.isActive("taskList"),
          run: () => editor.chain().focus().toggleTaskList().run(),
        },
        {
          label: "元に戻す",
          icon: Undo2,
          disabled: !editor.can().undo(),
          run: () => editor.chain().focus().undo().run(),
        },
        {
          label: "やり直す",
          icon: Redo2,
          disabled: !editor.can().redo(),
          run: () => editor.chain().focus().redo().run(),
        },
      ]
    : [];
  return (
    <Modal
      title="メモ"
      full
      onClose={close}
      dockActions={
        canEdit
          ? {
              primary: (
                <button onClick={() => dismissModal(close)}>
                  <Check size={18} aria-hidden="true" />
                  完了
                </button>
              ),
              actions: (
                <button
                  className="danger"
                  aria-label="メモを削除"
                  onClick={() => {
                    if (!confirm("このメモを削除しますか？")) return;
                    if (timer.current) clearTimeout(timer.current);
                    dirty.current = false;
                    deleteNote(initial.id);
                    dismissModal(onClose);
                  }}
                >
                  <Trash2 size={20} />
                </button>
              ),
            }
          : undefined
      }
    >
      <div className="note-compose">
        <Input
          className="note-title"
          aria-label="メモのタイトル"
          placeholder="タイトル"
          value={draft.title ?? ""}
          maxLength={NOTE_TITLE_LIMIT}
          readOnly={!canEdit}
          onChange={(event) => change({ title: event.target.value })}
        />
        {canEdit && (
          <div className="note-toolbar" role="group" aria-label="本文の書式">
            {controls.map(({ label, icon: Icon, active, disabled, run }) => (
              <button
                key={label}
                type="button"
                className={`icon-button ${active ? "selected" : ""}`}
                aria-label={label}
                title={label}
                aria-pressed={active}
                disabled={disabled}
                onPointerDown={(event) => event.preventDefault()}
                onClick={run}
              >
                <Icon size={19} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <EditorContent editor={editor} />
        {canEdit && (
          <p
            className={`small ${saveError || syncError ? "danger" : "muted"}`}
            role="status"
          >
            {saveError ||
              syncError ||
              (waiting
                ? "保存中…"
                : pendingCount
                  ? "変更は自動保存され、接続時に同期されます。"
                  : "変更は自動で保存されます。")}
          </p>
        )}
      </div>
    </Modal>
  );
}
