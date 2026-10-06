import { useTravel } from "@/data/travel-provider";
import { visibleNoteLines } from "@/data/note-lines";

/** Notes tied to this place, so 「しおりのこの予定にも出ます」 holds on its sheet. */
export function LinkedNotes({
  placeId,
  onOpen,
}: {
  placeId: string;
  onOpen: (noteId: string) => void;
}) {
  const { notes } = useTravel();
  const linked = notes
    .filter((note) => note.placeId === placeId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!linked.length) return null;
  return (
    <section className="detail-section memo-linked">
      <h3>ひもづいたメモ</h3>
      {linked.map((note) => {
        const lines = visibleNoteLines(note.body);
        return (
          <button key={note.id} type="button" onClick={() => onOpen(note.id)}>
            <b>{note.title?.trim() || "無題のメモ"}</b>
            {lines.slice(0, 3).map(({ line, index }) => (
              <span
                key={index}
                className={`memo-ln ${line.kind}${line.done ? " done" : ""}`}
              >
                {line.kind === "c" && (
                  <i
                    className={`memo-cb${line.done ? " on" : ""}`}
                    aria-label={line.done ? "済み" : "未チェック"}
                    role="img"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 12.5l4.5 4.5L19 7.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </i>
                )}
                <span>{line.text}</span>
              </span>
            ))}
            {lines.length > 3 && (
              <span className="memo-more">ほか{lines.length - 3}行</span>
            )}
          </button>
        );
      })}
    </section>
  );
}
