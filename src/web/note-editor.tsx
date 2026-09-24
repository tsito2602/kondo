import { useEffect, useRef, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { useTravel } from "@/data/travel-provider";
import type { TravelNote } from "@/data/types";
import { NOTE_TITLE_LIMIT, NOTE_BODY_LIMIT } from "@/data/notes";
import { Modal } from "./ui";
import { dismissModal } from "./motion";
import { Input } from "./obsidian/input";
import { Textarea } from "./obsidian/textarea";

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
      const { title = "", body } = latest.current;
      saveNote(initial.id, { title, body, content: null }, tripId.current);
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
  const close = () => {
    flush();
    onClose();
  };
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
        <Textarea
          className="note-editor"
          aria-label="メモ本文"
          placeholder="メモを入力..."
          value={draft.body}
          maxLength={NOTE_BODY_LIMIT}
          readOnly={!canEdit}
          onChange={(event) =>
            change({ body: event.target.value, content: null })
          }
        />
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
