import {
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTravel } from "@/data/travel-provider";
import { toggleNoteCheck, visibleNoteLines } from "@/data/note-lines";
import type { TravelNote } from "@/data/types";
import { DockToast, ThumbDock } from "./thumb-dock";
import { poof, sink, spring } from "./memo-motion";
import { PageTop } from "./page-top";
import { useJellyScroll } from "./jelly-scroll";
import { AddButton } from "./ui";
import {
  CheckBox,
  NoteMeta,
  PinFilledIcon,
  PlaceChip,
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

/**
 * Tiles laid out like Google Keep (Tsubasa 2026-10-07): in order, each into
 * the column that is shortest so far, every column starting at the top.
 * Heights are measured; until then a tile counts as average.
 */
function MemoTiles({
  ids,
  render,
}: {
  ids: string[];
  render: (id: string) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(2);
  const [heights, setHeights] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const wide = matchMedia("(min-width: 760px)");
    const update = () => setCount(wide.matches ? 3 : 2);
    update();
    wide.addEventListener("change", update);
    return () => wide.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const measure = () => {
      const next: Record<string, number> = {};
      root
        .querySelectorAll<HTMLElement>(":scope > .memo-col > .memo-tile")
        .forEach((tile) => {
          const id = tile.dataset.noteId;
          if (id) next[id] = tile.offsetHeight;
        });
      setHeights((current) =>
        Object.keys(next).length === Object.keys(current).length &&
        Object.entries(next).every(([id, h]) => current[id] === h)
          ? current
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    root
      .querySelectorAll(":scope > .memo-col > .memo-tile")
      .forEach((tile) => observer.observe(tile));
    return () => observer.disconnect();
  });
  const known = Object.values(heights);
  const average = known.length
    ? known.reduce((sum, h) => sum + h, 0) / known.length
    : 120;
  const columns: string[][] = Array.from({ length: count }, () => []);
  const filled = Array<number>(count).fill(0);
  for (const id of ids) {
    const shortest = filled.indexOf(Math.min(...filled));
    columns[shortest].push(id);
    filled[shortest] += (heights[id] ?? average) + 10;
  }
  return (
    <div className="memo-tiles" ref={box}>
      {columns.map((column, index) => (
        <div className="memo-col" key={index}>
          {column.map(render)}
        </div>
      ))}
    </div>
  );
}

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
  const page = useRef<HTMLDivElement>(null);
  // Fast scrolls leave the tiles a little behind (kondo-cartoon jelly scroll).
  useJellyScroll(page, ".memo-tile, .memo-lab");
  // On arrival the labels and tiles land one after another, 40 ms apart.
  useLayoutEffect(() => {
    page.current
      ?.querySelectorAll(".memo-tile, .memo-lab")
      .forEach((element, index) => sink(element, -20, index * 40));
  }, []);
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
    <MemoTiles
      ids={list.map((note) => note.id)}
      render={(id) => {
        const note = list.find((entry) => entry.id === id)!;
        return (
          <NoteTile
            key={note.id}
            note={note}
            link={places.find((entry) => entry.place.id === note.placeId)}
            canEdit={travel.canEdit}
            onOpen={() => setOpen({ note, fresh: false })}
            onToggle={(index) => toggle(note, index)}
          />
        );
      }}
    />
  );
  return (
    <div className="page notes-page" ref={page}>
      <PageTop
        tab="notes"
        sub={`${all.length}件`}
        title="メモ"
        actions={
          <>
            <button
              className="page-plus"
              aria-label="メモを探す"
              aria-pressed={query !== null}
              onClick={() => setQuery(query === null ? "" : null)}
            >
              <SearchIcon />
            </button>
          </>
        }
      />
      {travel.canEdit && (
        <AddButton
          label="メモを書く"
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
        />
      )}
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
          <div className="memo-lab">
            <b>メモ</b>
            <span>{rest.length}件</span>
          </div>
          {tiles(rest)}
        </>
      )}
      {!visible.length && (
        <p className="memo-empty">
          {needle ? "見つかりませんでした" : "メモはまだありません"}
        </p>
      )}
      {removed && (
        <ThumbDock mode="toast">
          <DockToast
            back={
              <button aria-label="旅行一覧へ戻る" onClick={() => navigate("/")}>
                <BackIcon />
              </button>
            }
            message="消しました"
            onUndo={undo}
            duration={NOTE_UNDO_MS}
            restartKey={removed.id}
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
