import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import { useAuth } from "@/auth/auth-provider";
import { useTravel } from "@/data/travel-provider";
import type { TravelNote } from "@/data/types";
import { NOTE_TITLE_LIMIT, NOTE_BODY_LIMIT } from "@/data/notes";
import {
  parseNoteBody,
  parseNoteLine,
  serializeNoteLines,
  type NoteLine,
  type NoteLineKind,
} from "@/data/note-lines";
import { Modal } from "./ui";
import { dismissModal } from "./motion";
import { bubble, memoEditorTransition, sink, spring } from "./memo-motion";
import {
  AddCheckIcon,
  AddHeadingIcon,
  CheckBox,
  LinkPlaceIcon,
  NoteMeta,
  PinFilledIcon,
  PinIcon,
  PlaceChip,
  ShowIcon,
  TrashIcon,
  planDayLabel,
  useNotePlaces,
} from "./memo-parts";

const PLACEHOLDER: Record<NoteLineKind, string> = {
  p: "書く",
  c: "やること",
  h: "見出し",
};

/** One growing textarea per line, so a check line keeps its own box. */
function LineText({
  value,
  inputRef,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
  inputRef?: (element: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fit = () => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    // The dialog lays out after its children mount, and wrapping changes
    // with width: measure again whenever the width settles.
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      fit();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <textarea
      {...props}
      ref={(element) => {
        ref.current = element;
        inputRef?.(element);
      }}
      rows={1}
      value={value}
    />
  );
}

export function NoteEditor({
  initial,
  onClose,
  onDelete,
  fresh = false,
}: {
  initial: TravelNote;
  onClose: () => void;
  /** The list poofs the note and offers 元に戻す before it is really deleted. */
  onDelete: (note: TravelNote) => void;
  fresh?: boolean;
}) {
  const {
    saveNote,
    canEdit,
    selectedTrip,
    notes,
    error: syncError,
  } = useTravel();
  const { user } = useAuth();
  const places = useNotePlaces();
  const [draft, setDraft] = useState(initial);
  const [lines, setLines] = useState<NoteLine[]>(() => {
    const parsed = parseNoteBody(initial.body);
    return parsed.length ? parsed : [{ kind: "p", text: "", done: false }];
  });
  const [saveError, setSaveError] = useState("");
  const [picking, setPicking] = useState(false);
  const [showing, setShowing] = useState(false);
  const latest = useRef(initial);
  const dirty = useRef(false);
  const exists = useRef(notes.some((note) => note.id === initial.id));
  const tripId = useRef(selectedTrip!.id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const lineRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusNext = useRef<{ index: number; caret: number } | null>(null);
  const dialogBody = useRef<HTMLDivElement>(null);
  const deleting = useRef(false);
  const [transition] = useState(() =>
    memoEditorTransition(
      () =>
        fresh
          ? document.querySelector('.notes-page [aria-label="メモを書く"]')
          : document.querySelector(
              `.memo-tile[data-note-id="${CSS.escape(initial.id)}"]`,
            ),
      () => deleting.current,
    ),
  );
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty.current || !canEdit) return;
    if (
      !exists.current &&
      !latest.current.title?.trim() &&
      !latest.current.body.trim()
    ) {
      dirty.current = false;
      return;
    }
    try {
      const { title = "", body, pinned, placeId } = latest.current;
      saveNote(
        initial.id,
        { title, body, content: null, pinned, placeId },
        tripId.current,
      );
      dirty.current = false;
      exists.current = true;
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
  useEffect(() => {
    // ＋ means "write now": start on the title instead of the dialog heading.
    if (fresh && canEdit) titleRef.current?.focus({ preventScroll: true });
  }, [fresh, canEdit]);
  useLayoutEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    focusNext.current = null;
    const element = lineRefs.current[next.index];
    element?.focus();
    element?.setSelectionRange(next.caret, next.caret);
  });
  const change = (patch: Partial<TravelNote>) => {
    latest.current = { ...latest.current, ...patch };
    dirty.current = true;
    setDraft(latest.current);
    setSaveError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 500);
  };
  const changeLines = (next: NoteLine[]) => {
    const body = serializeNoteLines(next);
    if (body.length > NOTE_BODY_LIMIT) return;
    setLines(next);
    change({ body, content: null });
  };
  const close = () => {
    flush();
    onClose();
  };

  const editLine = (index: number, value: string) => {
    const [first, ...rest] = value.split("\n");
    const next = [...lines];
    next[index] = { ...next[index], text: first };
    if (rest.length) {
      // A pasted block keeps its own checks and headings line by line.
      next.splice(index + 1, 0, ...rest.map(parseNoteLine));
      focusNext.current = {
        index: index + rest.length,
        caret: next[index + rest.length].text.length,
      };
    }
    changeLines(next);
  };
  const keyLine = (
    index: number,
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const line = lines[index];
    const { selectionStart, selectionEnd } = event.currentTarget;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const next = [...lines];
      if (line.kind === "c" && !line.text) {
        // Enter on an empty check ends the list, like every notes app.
        next[index] = { kind: "p", text: "", done: false };
        focusNext.current = { index, caret: 0 };
      } else {
        next[index] = { ...line, text: line.text.slice(0, selectionStart) };
        next.splice(index + 1, 0, {
          kind: line.kind === "c" ? "c" : "p",
          text: line.text.slice(selectionEnd),
          done: false,
        });
        focusNext.current = { index: index + 1, caret: 0 };
      }
      changeLines(next);
    } else if (
      event.key === "Backspace" &&
      selectionStart === 0 &&
      selectionEnd === 0
    ) {
      if (line.kind !== "p") {
        event.preventDefault();
        const next = [...lines];
        next[index] = { kind: "p", text: line.text, done: false };
        focusNext.current = { index, caret: 0 };
        changeLines(next);
      } else if (index > 0) {
        event.preventDefault();
        const next = [...lines];
        const previous = next[index - 1];
        next[index - 1] = { ...previous, text: previous.text + line.text };
        next.splice(index, 1);
        focusNext.current = { index: index - 1, caret: previous.text.length };
        changeLines(next);
      }
    }
  };
  const toggle = (index: number) => {
    const next = [...lines];
    next[index] = { ...next[index], done: !next[index].done };
    changeLines(next);
  };
  const addLine = (kind: NoteLineKind) => {
    const next = [...lines];
    const last = next.at(-1);
    if (last && !last.text && last.kind === "p")
      next[next.length - 1] = { kind, text: "", done: false };
    else next.push({ kind, text: "", done: false });
    focusNext.current = { index: next.length - 1, caret: 0 };
    changeLines(next);
    requestAnimationFrame(() => {
      const row = lineRefs.current[next.length - 1]?.closest(".memo-ln");
      sink(row, 10);
      row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };
  const togglePin = (button: Element) => {
    const pinned = !latest.current.pinned;
    change({ pinned });
    bubble(button, pinned ? "上にピン留めしました" : "ピン留めを外しました");
  };
  const link = (placeId: string | null) => {
    change({ placeId });
    setPicking(false);
    requestAnimationFrame(() =>
      spring(dialogBody.current?.querySelector(".memo-link-row .memo-chip"), [
        { transform: "scale(.6)" },
        { transform: "none" },
      ]),
    );
  };
  const remove = () => {
    deleting.current = true;
    flush();
    const note = latest.current;
    const saved = exists.current;
    dismissModal(() => {
      onClose();
      if (saved) onDelete(note);
    });
  };

  // The mock offers the trip's planned places: a day and a place.
  const planned = places.filter((entry) => entry.plan);
  const linked = places.find((entry) => entry.place.id === draft.placeId);
  const live = notes.find((note) => note.id === initial.id);
  const meta: TravelNote = live ?? {
    ...draft,
    updatedBy: user?.id ?? null,
    updatedAt: Date.now() / 1000,
  };
  const showLines = lines.filter((line) => line.text.trim());

  const tools = (
    <>
      {canEdit && (
        <>
          <button aria-label="チェックを足す" onClick={() => addLine("c")}>
            <AddCheckIcon />
          </button>
          <button aria-label="見出しを足す" onClick={() => addLine("h")}>
            <AddHeadingIcon />
          </button>
          <button
            aria-label="ピン留め"
            aria-pressed={Boolean(draft.pinned)}
            className={draft.pinned ? "on" : ""}
            onClick={(event) => togglePin(event.currentTarget)}
          >
            {draft.pinned ? <PinFilledIcon /> : <PinIcon />}
          </button>
        </>
      )}
      <button aria-label="見せる" onClick={() => setShowing(true)}>
        <ShowIcon />
      </button>
      {canEdit && (
        <button aria-label="メモを消す" onClick={remove}>
          <TrashIcon />
        </button>
      )}
    </>
  );

  return (
    <Modal
      title={draft.title?.trim() || "メモ"}
      full
      transition={transition}
      onClose={close}
      dockActions={
        showing
          ? {
              primary: (
                <button
                  className="memo-show-close"
                  onClick={() => setShowing(false)}
                >
                  閉じる
                </button>
              ),
            }
          : {
              actions: tools,
              wide: true,
            }
      }
    >
      <div className="memo-editor" ref={dialogBody}>
        <NoteMeta note={meta} />
        <LineText
          className="memo-title"
          aria-label="メモのタイトル"
          placeholder="タイトル"
          value={draft.title ?? ""}
          maxLength={NOTE_TITLE_LIMIT}
          readOnly={!canEdit}
          inputRef={(element) => {
            titleRef.current = element;
          }}
          onChange={(event) =>
            change({ title: event.target.value.replace(/\n/g, " ") })
          }
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            lineRefs.current[0]?.focus();
          }}
        />
        {(linked || (canEdit && planned.length > 0)) && (
          <div className="memo-link-row">
            {linked ? (
              <>
                <button
                  type="button"
                  className="memo-chip-button"
                  aria-label={`${linked.place.title}へのひもづけを変える`}
                  aria-expanded={picking}
                  disabled={!canEdit}
                  onClick={() => setPicking(!picking)}
                >
                  <PlaceChip link={linked} />
                </button>
                {linked.plan && <small>しおりのこの予定にも出ます</small>}
              </>
            ) : (
              <button
                type="button"
                className="memo-link-add"
                aria-expanded={picking}
                onClick={() => setPicking(!picking)}
              >
                <LinkPlaceIcon />
                日と場所にひもづける
              </button>
            )}
          </div>
        )}
        {picking && (
          <div className="memo-picks" role="group" aria-label="ひもづける場所">
            {planned.map((entry) => (
              <button
                type="button"
                key={entry.place.id}
                aria-pressed={entry.place.id === draft.placeId}
                onClick={() => link(entry.place.id)}
              >
                <span className="memo-chip">
                  <span className="memo-chip-no">
                    <span>{entry.number}</span>
                  </span>
                  <em>{entry.place.title}</em>
                </span>
                <small>{entry.plan && planDayLabel(entry.plan.day)}</small>
              </button>
            ))}
            {linked && (
              <button
                type="button"
                className="memo-unlink"
                onClick={() => link(null)}
              >
                ひもづけを外す
              </button>
            )}
          </div>
        )}
        <div className="memo-lines">
          {lines.map((line, index) => (
            <div
              key={index}
              className={`memo-ln ${line.kind}${line.done ? " done" : ""}`}
            >
              {line.kind === "c" && (
                <CheckBox
                  done={line.done}
                  disabled={!canEdit}
                  label={line.text || "チェック"}
                  onToggle={() => toggle(index)}
                />
              )}
              <LineText
                aria-label={`${index + 1}行目`}
                placeholder={PLACEHOLDER[line.kind]}
                value={line.text}
                readOnly={!canEdit}
                inputRef={(element) => {
                  lineRefs.current[index] = element;
                }}
                onChange={(event) => editLine(index, event.target.value)}
                onKeyDown={(event) => keyLine(index, event)}
              />
            </div>
          ))}
        </div>
        {(saveError || syncError) && (
          <p className="small danger" role="status">
            {saveError || syncError}
          </p>
        )}
      </div>
      {showing && (
        <ShowView title={draft.title?.trim() ?? ""} lines={showLines} />
      )}
    </Modal>
  );
}

/** 見せる: the note's lines in big type for a taxi driver or shop staff. */
function ShowView({ title, lines }: { title: string; lines: NoteLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const view = ref.current;
    void spring(
      view,
      [
        { transform: "scale(.9)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      "split",
    );
    view
      ?.querySelectorAll(".memo-show-big > span")
      .forEach((element, index) => sink(element, 16, 80 + index * 70));
  }, []);
  return (
    <div className="memo-show" ref={ref} role="region" aria-label="見せる">
      {title && <small>{title}</small>}
      <div className="memo-show-big">
        {lines.map((line, index) => (
          <span key={index}>{line.text}</span>
        ))}
      </div>
    </div>
  );
}
