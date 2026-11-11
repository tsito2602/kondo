import { Share } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildParentSheet, type SheetKind } from "@/data/parent-sheet";
import type { Trip } from "@/data/types";
import { useTravel } from "@/data/travel-provider";
import { useKindColors } from "./kind-colors";
import { SegmentSelection } from "./segment-selection";
import {
  pdfOf,
  pngOf,
  renderSheets,
  type ShareFormat,
  type ShareTheme,
} from "./share-render";
import { Modal, useToast } from "./ui";

// しおりを渡す (Tsubasa 2026-11-11, mock kondo-export.html A・1): the trip as
// a PDF or as images for parents, previewed here and handed to the phone's
// share sheet. PDF / 画像 sits at the bottom right above the dock; the files
// are light unless ダーク is picked, whatever the app's own theme.

type Made = {
  key: string;
  previews: { url: string; label: string; ratio: number }[];
  files: File[];
};

const SHEET_KINDS: SheetKind[] = [
  "sightseeing",
  "meal",
  "transport",
  "stay",
  "ticket",
  "shopping",
  "other",
];
const fileName = (name: string) =>
  name.replace(/[\\/:*?"<>|]/g, "").trim() || "しおり";

export function TripShare({
  trip,
  onClose,
}: {
  trip: Trip;
  onClose: () => void;
}) {
  const travel = useTravel();
  const notify = useToast();
  const colors = useKindColors();
  const [format, setFormat] = useState<ShareFormat>("pdf");
  const [theme, setTheme] = useState<ShareTheme>("light");
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [made, setMade] = useState<Made | null>(null);
  const [page, setPage] = useState(1);
  const strip = useRef<HTMLDivElement>(null);
  const sheet = useMemo(
    () =>
      buildParentSheet({
        trip,
        items: travel.items,
        bookings: travel.bookings,
        places: travel.places,
      }),
    [trip, travel.items, travel.bookings, travel.places],
  );
  const days = useMemo(
    () => sheet.days.filter((day) => !left.has(day.day)),
    [sheet, left],
  );
  const kindColors = useMemo(
    () =>
      Object.fromEntries(
        SHEET_KINDS.map((kind) => [kind, colors[kind]]),
      ) as Record<SheetKind, string>,
    [colors],
  );
  const key = `${format}|${theme}|${days.map((day) => day.day).join(",")}`;
  const count = days.length + 1;

  // Made ahead of the tap: iOS only opens the share sheet straight from it.
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const timer = window.setTimeout(async () => {
      try {
        const rendered = await renderSheets({
          sheet,
          days,
          format,
          theme,
          kindColors,
        });
        const name = fileName(sheet.name);
        const pngs =
          format === "img"
            ? await Promise.all(rendered.map(({ canvas }) => pngOf(canvas)))
            : [];
        const files =
          format === "pdf"
            ? [
                new File(
                  [await pdfOf(rendered.map(({ canvas }) => canvas))],
                  `${name}.pdf`,
                  { type: "application/pdf" },
                ),
              ]
            : pngs.map(
                (blob, index) =>
                  new File([blob], `${name}-${index + 1}.png`, {
                    type: "image/png",
                  }),
              );
        const previews = await Promise.all(
          rendered.map(async ({ canvas, label }, index) => {
            const blob =
              pngs[index] ??
              (await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", 0.85),
              ));
            const url = blob ? URL.createObjectURL(blob) : "";
            urls.push(url);
            return { url, label, ratio: canvas.height / canvas.width };
          }),
        );
        if (cancelled) return;
        setMade({ key, previews, files });
      } catch {
        if (!cancelled) notify("しおりを作れませんでした");
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      // Let the next set paint first, then free these.
      window.setTimeout(
        () => urls.forEach((url) => URL.revokeObjectURL(url)),
        2000,
      );
    };
  }, [key, sheet, days, format, theme, kindColors]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPage(1);
    if (strip.current) strip.current.scrollLeft = 0;
  }, [format, days.length]);

  const ready = made?.key === key;
  const share = () => {
    if (!made || !ready) return;
    const data = { files: made.files, title: sheet.name };
    if (navigator.canShare?.(data)) {
      navigator.share(data).catch((error: unknown) => {
        if ((error as Error)?.name !== "AbortError")
          notify("共有できませんでした");
      });
      return;
    }
    // No share sheet (a desktop browser): save the files instead.
    for (const file of made.files) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    }
  };

  const previews = made?.previews ?? [];
  return (
    <Modal
      title="しおりを渡す"
      full
      onClose={onClose}
      dockActions={{
        primary: (
          <button type="button" onClick={share} disabled={!ready}>
            <Share size={20} aria-hidden="true" />
            {ready
              ? "共有する"
              : format === "pdf"
                ? "PDFを作っています"
                : "画像を作っています"}
          </button>
        ),
      }}
    >
      <div className="share-panel" data-format={format}>
        <div
          ref={strip}
          className="share-strip"
          aria-label="渡す中身"
          data-stale={ready ? undefined : "true"}
          onScroll={(event) => {
            const node = event.currentTarget;
            const first = node.firstElementChild as HTMLElement | null;
            if (!first) return;
            const step = first.offsetWidth + 12;
            setPage(
              Math.min(previews.length, Math.round(node.scrollLeft / step) + 1),
            );
          }}
        >
          {previews.map((preview) => (
            <img
              key={preview.url}
              src={preview.url}
              alt={preview.label}
              className="share-page"
              style={{ aspectRatio: `1 / ${preview.ratio}` }}
            />
          ))}
        </div>
        <p className="share-count" aria-live="polite">
          {previews.length ? `${page} / ${previews.length}` : ""}
        </p>
        <div className="share-field">
          <span>入れる日</span>
          <div className="share-days">
            {sheet.days.map((day) => {
              const on = !left.has(day.day);
              return (
                <button
                  key={day.day}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${day.date}を${on ? "外す" : "入れる"}`}
                  onClick={() => {
                    const next = new Set(left);
                    if (on) next.add(day.day);
                    else next.delete(day.day);
                    if (next.size < sheet.days.length) setLeft(next);
                  }}
                >
                  <small>DAY {day.number}</small>
                  <b>{Number(day.day.slice(8))}</b>
                </button>
              );
            })}
          </div>
        </div>
        <div className="share-controls">
          <div className="share-field">
            <span>見た目</span>
            <div className="share-seg share-theme" role="group">
              <SegmentSelection index={theme === "light" ? 0 : 1} />
              {(["light", "dark"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                >
                  {value === "light" ? "ライト" : "ダーク"}
                </button>
              ))}
            </div>
          </div>
          <div
            className="share-seg share-format"
            role="group"
            aria-label="形式"
          >
            <SegmentSelection index={format === "pdf" ? 0 : 1} />
            <button
              type="button"
              aria-pressed={format === "pdf"}
              onClick={() => setFormat("pdf")}
            >
              <b>PDF</b>
              <small>A4</small>
            </button>
            <button
              type="button"
              aria-pressed={format === "img"}
              onClick={() => setFormat("img")}
            >
              <b>画像</b>
              <small>{count}枚</small>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
