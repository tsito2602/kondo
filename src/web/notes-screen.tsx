import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTravel } from "@/data/travel-provider";
import { toggleNoteCheck, visibleNoteLines } from "@/data/note-lines";
import type { TravelNote } from "@/data/types";
import { ContextDock, ThumbDock } from "./thumb-dock";
import { poof, sink, spring } from "./memo-motion";
import {
  CheckBox,
  NoteMeta,
  PinFilledIcon,
  PlaceChip,
  PlusIcon,
  SearchIcon,
  useNotePlaces,
  type NotePlace,
} from "./memo-parts";

const loadNoteEditor = () =>
  import("./note-editor").then((module) => ({ default: module.NoteEditor }));
const NoteEditor = lazy(loadNoteEditor);

/** How long the dock offers 元に戻す before the note is really deleted. */
export const NOTE_UNDO_MS = 5000;
const TILE_LINES = 5;

function NoteTile({
  note,
  link,
  canEdit,
  onOpen,
  onToggle,
}: {
  note: TravelNote;
  link?: NotePlace;
  canEdit: boolean;
  onOpen: () => void;
  onToggle: (index: number) => void;
}) {
  const lines = visibleNoteLines(note.body);
  const title = note.title?.trim() || "無題のメモ";
  return (
    <article className="memo-tile" data-note-id={note.id} data-press-card>
      <button className="memo-tile-open" onClick={onOpen}>
        <b>{title}</b>
      </button>
      {lines.length > 0 && (
        <div className="memo-lines">
          {lines.slice(0, TILE_LINES).map(({ line, index }) => (
            <div
              key={index}
              className={`memo-ln ${line.kind}${line.done ? " done" : ""}`}
            >
              {line.kind === "c" && (
                <CheckBox
                  done={line.done}
                  disabled={!canEdit}
                  label={line.text || "チェック"}
                  onToggle={() => onToggle(index)}
                />
              )}
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      )}
      {lines.length > TILE_LINES && (
        <div className="memo-more">ほか{lines.length - TILE_LINES}行</div>
      )}
      {link && <PlaceChip link={link} />}
      <NoteMeta note={note} />
    </article>
  );
}

export function NotesScreen() {
  const travel = useTravel();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const places = useNotePlaces();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState<{
    note: TravelNote;
    fresh: boolean;
  } | null>(null);
  const [removed, setRemoved] = useState<TravelNote | null>(null);
  const [leaving, setLeaving] = useState<TravelNote | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const removedRef = useRef<TravelNote | null>(null);
  const order = useRef<string[]>([]);
  const deleteNote = travel.deleteNote;
  const commitRemoval = useRef(() => {});
  commitRemoval.current = () => {
    clearTimeout(undoTimer.current);
    const note = removedRef.current;
    removedRef.current = null;
    setRemoved(null);
    if (note) deleteNote(note.id);
  };
  useEffect(() => {
    void loadNoteEditor().catch(() => undefined);
    const commit = () => commitRemoval.current();
    window.addEventListener("pagehide", commit);
    return () => {
      window.removeEventListener("pagehide", commit);
      commit();
    };
  }, []);
  // しおり's place sheet opens a linked note here.
  const linkedId = params.get("note");
  useEffect(() => {
    if (!linkedId) return;
    const note = travel.notes.find((entry) => entry.id === linkedId);
    if (note) setOpen({ note, fresh: false });
    setParams(
      (current) => {
        current.delete("note");
        return current;
      },
      { replace: true },
    );
  }, [linkedId, travel.notes, setParams]);
  // A deleted tile flattens and bursts into dots, then the dock offers it back.
  useEffect(() => {
    if (!leaving) return;
    let cancelled = false;
    const tile = tileOf(leaving.id);
    void poof(tile).then(() => {
      if (cancelled) return;
      commitRemoval.current();
      removedRef.current = leaving;
      setRemoved(leaving);
      setLeaving(null);
      undoTimer.current = setTimeout(
        () => commitRemoval.current(),
        NOTE_UNDO_MS,
      );
      requestAnimationFrame(() =>
        document
          .querySelectorAll(".notes-page .memo-tile")
          .forEach((element, index) => sink(element, 8, index * 20)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [leaving]);
  const undo = () => {
    clearTimeout(undoTimer.current);
    const note = removedRef.current;
    removedRef.current = null;
    setRemoved(null);
    if (!note) return;
    requestAnimationFrame(() =>
      spring(tileOf(note.id), [
        { transform: "scale(.6) rotate(-3deg)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ]),
    );
  };

  const all = travel.notes.filter((note) => note.id !== removed?.id);
  const needle = query?.trim().toLowerCase() ?? "";
  // Newest first, but a tick on a tile must not make it jump: keep the order
  // while the list is on screen and only re-sort after the editor closes.
  const sorted = [...all]
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
    .map((note) => note.id);
  const previous = order.current;
  if (
    previous.length !== sorted.length ||
    sorted.some((id) => !previous.includes(id))
  )
    order.current = [
      ...sorted.filter((id) => !previous.includes(id)),
      ...previous.filter((id) => sorted.includes(id)),
    ];
  const rank = new Map(order.current.map((id, index) => [id, index]));
  const visible = all
    .filter(
      (note) =>
        !needle ||
        `${note.title ?? ""}\n${note.body}`.toLowerCase().includes(needle),
    )
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const pins = visible.filter((note) => note.pinned);
  const rest = visible.filter((note) => !note.pinned);
  const toggle = (note: TravelNote, index: number) => {
    travel.saveNote(note.id, {
      title: note.title ?? "",
      body: toggleNoteCheck(note.body, index),
      content: null,
    });
  };
  const tiles = (list: TravelNote[]) => (
    <div className="memo-tiles">
      {list.map((note) => (
        <NoteTile
          key={note.id}
          note={note}
          link={places.find((entry) => entry.place.id === note.placeId)}
          canEdit={travel.canEdit}
          onOpen={() => setOpen({ note, fresh: false })}
          onToggle={(index) => toggle(note, index)}
        />
      ))}
    </div>
  );
  return (
    <div className="page notes-page">
      <div className="memo-top">
        <div>
          <h2>メモ</h2>
        </div>
        <div className="memo-acts">
          <button
            className="memo-round"
            aria-label="メモを探す"
            aria-pressed={query !== null}
            onClick={() => setQuery(query === null ? "" : null)}
          >
            <SearchIcon />
          </button>
          {travel.canEdit && (
            <button
              className="memo-round"
              aria-label="メモを書く"
              onClick={() =>
                setOpen({
                  fresh: true,
                  note: {
                    id: crypto.randomUUID(),
                    body: "",
                    title: "",
                    updatedAt: Date.now() / 1000,
                  },
                })
              }
            >
              <PlusIcon />
            </button>
          )}
        </div>
      </div>
      {query !== null && (
        <label
          className="memo-search"
          ref={(element) => {
            if (element && !element.dataset.landed) {
              element.dataset.landed = "true";
              sink(element, -10);
            }
          }}
        >
          <SearchIcon />
          <input
            autoFocus
            type="text"
            enterKeyHint="search"
            aria-label="メモを探す"
            placeholder="メモを探す"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}
      {pins.length > 0 && (
        <>
          <div className="memo-lab">
            <b>
              <PinFilledIcon />
              ピン留め
            </b>
          </div>
          {tiles(pins)}
        </>
      )}
      {rest.length > 0 && (
        <>
          {pins.length > 0 && (
            <div className="memo-lab">
              <b>メモ</b>
              <span>{rest.length}件</span>
            </div>
          )}
          {tiles(rest)}
        </>
      )}
      {!visible.length && (
        <p className="memo-empty">
          {needle ? "見つかりませんでした" : "メモはまだありません"}
        </p>
      )}
      {removed && (
        <ThumbDock mode="context">
          <ContextDock
            back={
              <button aria-label="旅行一覧へ戻る" onClick={() => navigate("/")}>
                <BackIcon />
              </button>
            }
            actions={
              <button className="memo-undo" onClick={undo}>
                <span>消しました</span>
                <b>元に戻す</b>
              </button>
            }
          />
        </ThumbDock>
      )}
      {open && (
        <Suspense fallback={<p role="status">メモを開いています…</p>}>
          <NoteEditor
            initial={open.note}
            fresh={open.fresh}
            onClose={() => {
              order.current = [];
              setOpen(null);
            }}
            onDelete={(note) => setLeaving(note)}
          />
        </Suspense>
      )}
    </div>
  );
}

const tileOf = (id: string) =>
  [...document.querySelectorAll<HTMLElement>(".memo-tile")].find(
    (tile) => tile.dataset.noteId === id,
  );

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}
