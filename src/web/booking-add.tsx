import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/auth/auth-provider";
import {
  demoImportRows,
  findDuplicateBooking,
  importedBookingInput,
  importFileTypes,
  importReviewText,
  importTitle,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_FILES,
  receiveBookingImport,
  type ImportedBooking,
} from "@/data/booking-import";
import { useTravel } from "@/data/travel-provider";
import type { Booking } from "@/data/types";
import { findAirportByCode } from "@/data/airports";
import { mapUrl } from "@/data/places";
import type { BookingKind } from "@/data/types";
import { monthDay, spring } from "./booking-card";
import { useLayer } from "./booking-detail";
import { bookingIcons, CheckIcon, ClipIcon } from "./booking-icons";
import { BookingEditor, bookingKinds, type BookingInput } from "./editors";
import { anim, RM } from "./cartoon";
import { reduceMotion } from "./motion";
import { DockGroup } from "./cartoon-dock";
import { ThumbDock } from "./thumb-dock";
import { useToast } from "./ui";

type Travel = ReturnType<typeof useTravel>;
type Row = {
  key: string;
  row: ImportedBooking;
  duplicate?: Booking;
  /** Edited in the review; replaces what was read. */
  input?: BookingInput;
  fixed: boolean;
};

const fileType = (file: File) =>
  file.type ||
  (/\.heic$/i.test(file.name)
    ? "image/heic"
    : /\.heif$/i.test(file.name)
      ? "image/heif"
      : /\.pdf$/i.test(file.name)
        ? "application/pdf"
        : "");
const fileBadge = (file: File) => {
  const type = fileType(file);
  return type === "application/pdf"
    ? "PDF"
    : (type.split("/")[1] ?? "IMG").replace("jpeg", "JPG").toUpperCase();
};
const fileSize = (file: File) =>
  file.size >= 1024 * 1024
    ? `${(file.size / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(file.size / 1024))}KB`;

/** Attach the chosen files to saved bookings. New bookings reach the server first. */
export async function attachDocuments(
  travel: Travel,
  isDemo: boolean,
  notify: (message: string) => void,
  items: { bookingId: string; file: File }[],
) {
  if (!items.length) return;
  try {
    if (!isDemo) await travel.sync();
    for (const { bookingId, file } of items) {
      const type = fileType(file);
      if (!importFileTypes.includes(type) || file.size > IMPORT_MAX_BYTES)
        throw new Error("書類はPDFか画像で、20MB以下にしてください");
      await travel.uploadBookingDocument(bookingId, {
        filename: file.name,
        contentType: type,
        size: file.size,
        bytes: await file.arrayBuffer(),
      });
    }
  } catch (cause) {
    notify(
      `${cause instanceof Error ? cause.message : "書類を付けられませんでした"}。予約の詳細からあとで追加できます`,
    );
  }
}

/** Images go to the model as JPEG/PNG/WebP/GIF data URLs, scaled down when large. */
async function filePayload(file: File) {
  const type = fileType(file);
  const toDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("ファイルを読み込めませんでした"));
      reader.readAsDataURL(blob);
    });
  if (type === "application/pdf")
    return {
      name: file.name,
      kind: "pdf",
      data: await toDataUrl(file),
      size: file.size,
    };
  if (
    ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type) &&
    file.size <= 4 * 1024 * 1024
  )
    return {
      name: file.name,
      kind: "image",
      data: await toDataUrl(file),
      size: file.size,
    };
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`${file.name}を画像として開けませんでした`);
  });
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const data = canvas.toDataURL("image/jpeg", 0.85);
  return {
    name: file.name,
    kind: "image",
    data,
    size: Math.round((data.length * 3) / 4),
  };
}

/** Three small stand-in files for the demo's 「例のファイル3つで試す」. */
async function exampleFiles() {
  const page = (lines: string[], type: string) =>
    new Promise<Blob>((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 360;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, 360, 480);
      context.fillStyle = "#222";
      context.font = "bold 22px sans-serif";
      lines.forEach((line, index) =>
        context.fillText(line, 28, 64 + index * 40),
      );
      canvas.toBlob((blob) => resolve(blob ?? new Blob()), type, 0.9);
    });
  const pdf = new Blob(
    [
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
    ],
    { type: "application/pdf" },
  );
  return [
    new File(
      [
        await page(
          ["ご予約の確認", "シェーンブルン宮殿", "SBG-204718"],
          "image/png",
        ),
      ],
      "予約確認_シェーンブルン.png",
      { type: "image/png" },
    ),
    new File([pdf], "eチケット_帰り.pdf", { type: "application/pdf" }),
    new File(
      [await page(["MAYER", "AM PFARRPLATZ", "MP-3302"], "image/jpeg")],
      "IMG_4471.jpg",
      { type: "image/jpeg" },
    ),
  ];
}

const PEOPLE = ["2名", "3名", "4名"];

// 手で入力: pick a kind, then only that kind's fields (the mock's sheetHTML).
type ManualForm = {
  kind: BookingKind | null;
  title: string;
  from: string;
  to: string;
  start: string;
  end: string;
  place: string;
  code: string;
  files: File[];
};
type FieldKey = Exclude<keyof ManualForm, "kind" | "files">;
type FieldSpec = [FieldKey, string, string];
const EMPTY_FORM: ManualForm = {
  kind: null,
  title: "",
  from: "",
  to: "",
  start: "",
  end: "",
  place: "",
  code: "",
  files: [],
};
const PLACE: FieldSpec = ["place", "場所", "住所か Google マップのリンク"];
function manualFields(kind: BookingKind): (FieldSpec[] | [FieldSpec])[] {
  if (kind === "flight")
    return [
      [["title", "便名", "EK 319"]],
      [
        ["from", "出発の空港", "成田（NRT）"],
        ["to", "到着の空港", "ドバイ（DXB）"],
      ],
      [
        ["start", "出発", "10/19 22:20"],
        ["end", "到着", "10/20 05:30"],
      ],
    ];
  if (kind === "train")
    return [
      [["title", "列車", "Railjet 542"]],
      [
        ["from", "乗る駅", "ウィーン中央駅"],
        ["to", "降りる駅", "ザルツブルク中央駅"],
      ],
      [
        ["start", "出発", "10/22 08:30"],
        ["end", "到着", "10/22 10:52"],
      ],
    ];
  if (kind === "hotel")
    return [
      [["title", "宿の名前", "ホテル・ザッハー"]],
      [
        ["start", "チェックイン", "10/20 15:00〜"],
        ["end", "チェックアウト", "10/23 〜11:00"],
      ],
      [PLACE],
    ];
  return [
    [
      [
        "title",
        "名前",
        kind === "restaurant" ? "お店の名前" : "施設・公演の名前",
      ],
    ],
    [["start", "日時", "10/22 14:30"]],
    [PLACE],
  ];
}
/** "10/19 22:20", "2026/10/19 22:20", "10/20 15:00〜" or "10/23 〜11:00". */
function parseMoment(text: string, year: number) {
  const value = text.normalize("NFKC");
  const date = value.match(/(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})/);
  const time = value.match(/(\d{1,2}):(\d{2})/);
  const pad = (n: string | number) => String(n).padStart(2, "0");
  return {
    day: date ? `${date[1] ?? year}-${pad(date[2])}-${pad(date[3])}` : "",
    time: time ? `${pad(time[1])}:${time[2]}` : "",
  };
}
/** "成田（NRT）", "NRT" or a station's name. */
function parseStop(text: string) {
  const value = text.normalize("NFKC").trim();
  const code = value.match(/\b([A-Z]{3})\b/)?.[1] ?? "";
  const name = value.replace(/[(（]?\s*[A-Z]{3}\s*[)）]?/, "").trim();
  return {
    name: name || findAirportByCode(code)?.name || "",
    code: code && findAirportByCode(code) ? code : "",
  };
}
function manualInput(form: ManualForm, year: number): BookingInput | string {
  const kind = form.kind!;
  const start = parseMoment(form.start, year);
  const end = parseMoment(form.end, year);
  if (!start.day) return "日付を「10/19 22:20」のように入れてください";
  const route = kind === "flight" || kind === "train";
  const from = route ? parseStop(form.from) : { name: "", code: "" };
  const to = route ? parseStop(form.to) : { name: "", code: "" };
  const title =
    form.title.trim() ||
    (kind === "flight"
      ? [from.code || from.name, to.code || to.name].filter(Boolean).join(" → ")
      : "");
  if (!title) return "名前を入れてください";
  const place = form.place.trim();
  return {
    kind,
    title: title.slice(0, 160),
    detail: place && !mapUrl(place) ? place : "",
    location: place && mapUrl(place) ? place : "",
    origin: from.name,
    originCode: kind === "flight" ? from.code : "",
    destination: to.name,
    destinationCode: kind === "flight" ? to.code : "",
    day: start.day,
    time: start.time,
    endDay: end.day || start.day,
    endTime: end.time,
    durationMinutes: null,
    confirmationCode: form.code.trim(),
    note: "",
  };
}

export function AddBookingSheet({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (ids: string[]) => void;
}) {
  const travel = useTravel();
  const { isDemo, requestRaw } = useAuth();
  const notify = useToast();
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState<ManualForm>(EMPTY_FORM);
  const [leaving, setLeaving] = useState<null | (() => void)>(null);
  /** Slide the sheet away, then close (and run what follows a save). */
  const leave = (after?: () => void) => {
    run.current?.abort();
    setLeaving(() => () => {
      onClose();
      after?.();
    });
  };
  const layer = useLayer(() => leave());
  useLayoutEffect(() => {
    const sheet = body.current;
    if (sheet && !RM())
      sheet.animate(
        [{ transform: "translateY(100%)" }, { transform: "none" }],
        { duration: 420, easing: "cubic-bezier(.2,1.2,.4,1)" },
      );
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const sheet = body.current;
    if (!sheet || RM()) return leaving();
    let done = false;
    const finish = () => {
      if (!done) ((done = true), leaving());
    };
    void anim(
      sheet,
      [{ transform: "none" }, { transform: "translateY(100%)" }],
      { duration: 260, easing: "cubic-bezier(.5,0,.8,.4)", fill: "forwards" },
    ).then(finish);
    const timer = setTimeout(finish, 500);
    return () => clearTimeout(timer);
  }, [leaving]);
  const [step, setStep] = useState<"pick" | "run" | "review">("pick");
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const run = useRef<AbortController | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const bookings = useRef(travel.bookings);
  bookings.current = travel.bookings;
  useEffect(() => () => run.current?.abort(), []);
  useEffect(() => {
    if (step !== "run") return;
    const started = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [step]);
  // New rows land at the bottom while reading; keep them in view.
  useEffect(() => {
    if (step !== "run") return;
    const rendered = body.current?.querySelectorAll(".bk-irow:not(.skel)");
    const last = rendered?.[rendered.length - 1];
    if (last && !reduceMotion())
      last.animate(
        [
          { opacity: 0, transform: "translateY(12px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 420, easing: "cubic-bezier(.2,1,.3,1)" },
      );
    last?.scrollIntoView({ block: "nearest" });
  }, [rows.length, step]);

  const addFiles = (chosen: File[]) => {
    const accepted = chosen.filter((file) =>
      importFileTypes.includes(fileType(file)),
    );
    if (accepted.length < chosen.length)
      notify("PDFか画像（JPEG・PNG・WebP・HEIC）を選んでください");
    const next = [...files, ...accepted].slice(0, IMPORT_MAX_FILES);
    if (files.length + accepted.length > IMPORT_MAX_FILES)
      notify(`一度に取り込めるのは${IMPORT_MAX_FILES}ファイルまでです`);
    setFiles(next);
  };
  const accept = (row: ImportedBooking) =>
    setRows((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        row,
        duplicate: findDuplicateBooking(row, bookings.current),
        fixed: false,
      },
    ]);
  const read = async () => {
    if (!files.length) return notify("先にファイルを選んでください");
    const controller = new AbortController();
    run.current = controller;
    setRows([]);
    setSeconds(0);
    setStep("run");
    try {
      if (isDemo) {
        // Demo: simulate the stream with sample rows on the sample trip's days.
        const sample = demoImportRows(
          travel.selectedTrip?.startsOn ?? travel.bookings[0]?.day ?? "",
        );
        const wait = (ms: number) =>
          new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, reduceMotion() ? ms / 3 : ms);
            controller.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
        await wait(1800);
        for (const row of sample) {
          accept({ ...row, source: row.source % files.length });
          await wait(900);
        }
        await wait(900);
      } else {
        const tripId = travel.selectedTrip?.id;
        if (!tripId) throw new Error("旅行を選択してください");
        const payload = await Promise.all(files.map(filePayload));
        const response = await requestRaw(
          `/v1/trips/${tripId}/booking-import`,
          {
            method: "POST",
            body: JSON.stringify({ files: payload }),
            signal: controller.signal,
          },
        );
        await receiveBookingImport(
          response,
          accept,
          controller.signal,
          files.length,
        );
      }
      if (controller.signal.aborted) return;
      setStep("review");
      requestAnimationFrame(() =>
        body.current?.querySelectorAll(".bk-irow").forEach((element, index) =>
          spring(
            element,
            [
              { transform: "translateY(14px)", opacity: 0 },
              { transform: "none", opacity: 1 },
            ],
            "split",
            { delay: index * 60, fill: "backwards" },
          ),
        ),
      );
    } catch (cause) {
      if (controller.signal.aborted) return;
      setStep("pick");
      notify(
        cause instanceof Error ? cause.message : "予約を読み取れませんでした",
      );
    } finally {
      if (run.current === controller) run.current = null;
    }
  };
  const stop = () => {
    run.current?.abort();
    setStep("pick");
    setRows([]);
  };

  const needs = rows.filter(
    (entry) => !entry.duplicate && entry.row.review !== "none" && !entry.fixed,
  );
  const ready = rows.filter(
    (entry) => !entry.duplicate && (entry.row.review === "none" || entry.fixed),
  );
  const duplicates = rows.filter((entry) => entry.duplicate);
  const adding = rows.length - duplicates.length;
  const save = () => {
    if (needs.length) {
      const first = body.current?.querySelector(
        `[data-import-row="${needs[0].key}"]`,
      );
      first?.scrollIntoView({ block: "center" });
      spring(
        first,
        [{ transform: "translateX(-8px)" }, { transform: "none" }],
        "boing",
      );
      return notify("要確認を先に決めてください");
    }
    const created = ready.map((entry) => {
      const input = entry.input ?? importedBookingInput(entry.row);
      return {
        bookingId: travel.createBooking(input),
        file: files[entry.row.source] ?? files[0],
      };
    });
    leave(() => onAdded(created.map((entry) => entry.bookingId)));
    void attachDocuments(
      travel,
      isDemo,
      notify,
      created.filter((entry) => entry.file),
    );
  };
  const field = ([key, label, placeholder]: FieldSpec) => (
    <label className="bk-fld" key={key}>
      <small>{label}</small>
      <input
        value={form[key]}
        placeholder={placeholder}
        onChange={(event) =>
          setForm((current) => ({ ...current, [key]: event.target.value }))
        }
      />
    </label>
  );
  const saveManual = () => {
    if (!form.kind) return notify("先に種類を選んでください");
    const year = Number(
      (travel.selectedTrip?.startsOn || new Date().toISOString()).slice(0, 4),
    );
    const input = manualInput(form, year);
    if (typeof input === "string") return notify(input);
    const id = travel.createBooking(input);
    const chosen = form.files;
    leave(() => onAdded([id]));
    void attachDocuments(
      travel,
      isDemo,
      notify,
      chosen.map((file) => ({ bookingId: id, file })),
    );
  };
  const swap = () => {
    run.current?.abort();
    setForm(EMPTY_FORM);
    setManual((value) => !value);
    setStep("pick");
    setRows([]);
  };

  const editingRow = rows.find((entry) => entry.key === editing);
  const title = manual
    ? "予約を手で入力"
    : step === "run"
      ? "予約を読み取っています"
      : step === "review"
        ? rows.length
          ? `${adding}件の予約が見つかりました`
          : "予約が見つかりませんでした"
        : "予約を取り込む";
  const importRow = (entry: Row, review: boolean) => {
    const { row } = entry;
    const value = entry.input
      ? { ...row, ...entry.input, party: row.party }
      : row;
    const Icon = bookingIcons[value.kind];
    const file = files[row.source];
    const need =
      review && !entry.duplicate && row.review !== "none" && !entry.fixed;
    const kindLabel = bookingKinds.find(
      (kind) => kind.value === value.kind,
    )?.label;
    return (
      <div
        key={entry.key}
        data-import-row={entry.key}
        className={`bk-irow${entry.duplicate ? " dup" : ""}${need ? " need" : ""}`}
        role={review && !entry.duplicate ? "button" : undefined}
        tabIndex={review && !entry.duplicate ? 0 : undefined}
        onClick={(event) => {
          if (
            !review ||
            entry.duplicate ||
            (event.target as Element).closest("button")
          )
            return;
          setEditing(entry.key);
        }}
      >
        <Icon size={20} />
        <span>
          <b>{importTitle(value)}</b>
          <small>
            {[kindLabel, row.party, value.confirmationCode]
              .filter(Boolean)
              .join(" · ")}
          </small>
        </span>
        <span className="bk-iw">
          {entry.duplicate ? (
            "登録済み"
          ) : (
            <>
              {monthDay(value.day) || "日付?"}
              <br />
              {value.time}
            </>
          )}
        </span>
        {need && (
          <>
            <span className="bk-why">
              要確認：
              {importReviewText[row.review as keyof typeof importReviewText]}
            </span>
            <span className="bk-fix">
              {(row.review === "missing_people" ? PEOPLE : ["直す"]).map(
                (option) => (
                  <button
                    type="button"
                    key={option}
                    onClick={(event) => {
                      if (option === "直す") return setEditing(entry.key);
                      const target =
                        event.currentTarget.closest("[data-import-row]");
                      setRows((current) =>
                        current.map((item) =>
                          item.key === entry.key
                            ? {
                                ...item,
                                fixed: true,
                                row: { ...item.row, party: option },
                              }
                            : item,
                        ),
                      );
                      requestAnimationFrame(() =>
                        spring(
                          target?.isConnected
                            ? target
                            : body.current?.querySelector(
                                `[data-import-row="${entry.key}"]`,
                              ),
                          [{ transform: "scale(.92)" }, { transform: "none" }],
                        ),
                      );
                    }}
                  >
                    {option}
                  </button>
                ),
              )}
            </span>
          </>
        )}
        {file && (
          <span className="bk-src">
            <ClipIcon size={13} />
            {file.name}
            {entry.duplicate
              ? " · 同じ予約がもうあるので入れません"
              : " · 書類として付きます"}
          </span>
        )}
      </div>
    );
  };

  const cancel = (
    <DockGroup slot="l" className="context-back">
      <button
        type="button"
        className="context-back-label"
        onClick={() => leave()}
      >
        やめる
      </button>
    </DockGroup>
  );
  /** The lone ink action on the right island; dimmed like the mock's .4. */
  const ink = (label: ReactNode, onClick: () => void, disabled = false) => (
    <DockGroup slot="r" tone={disabled ? "ink-dim" : "ink"}>
      <button
        type="button"
        aria-disabled={disabled || undefined}
        onClick={onClick}
      >
        {label}
      </button>
    </DockGroup>
  );
  return createPortal(
    <dialog
      ref={layer}
      className="bk-sheetl"
      aria-label={title}
      inert={Boolean(leaving)}
    >
      <div className="bk-scrim" onClick={() => leave()} />
      <div className="bk-sheet" ref={body}>
        <h3>{title}</h3>
        {manual ? (
          <>
            <button type="button" className="bk-swap" onClick={swap}>
              <ClipIcon size={16} />
              スクショ・PDFから取り込むに戻る
            </button>
            <div className="bk-kinds" role="group" aria-label="種類">
              {bookingKinds.map((entry) => {
                const Icon = bookingIcons[entry.value];
                return (
                  <button
                    key={entry.value}
                    type="button"
                    aria-pressed={form.kind === entry.value}
                    onClick={(event) => {
                      const button = event.currentTarget;
                      setForm({ ...EMPTY_FORM, kind: entry.value });
                      requestAnimationFrame(() =>
                        spring(
                          button,
                          [{ transform: "scale(.88)" }, { transform: "none" }],
                          "boing",
                        ),
                      );
                    }}
                  >
                    <Icon size={26} />
                    {entry.label}
                  </button>
                );
              })}
            </div>
            {form.kind && (
              <>
                {manualFields(form.kind).map((row, index) =>
                  row.length === 2 ? (
                    <div className="bk-two" key={index}>
                      {row.map(field)}
                    </div>
                  ) : (
                    field(row[0])
                  ),
                )}
                {field(["code", "予約番号", "あれば"])}
                <label className="bk-attach">
                  <ClipIcon size={18} />
                  {form.files.length
                    ? form.files.map((file) => file.name).join("、")
                    : "書類（PDF・画像）を付ける"}
                  <input
                    hidden
                    type="file"
                    multiple
                    accept="application/pdf,image/jpeg,image/png,image/gif,image/webp,.heic,.heif"
                    onChange={(event) => {
                      const chosen = Array.from(event.target.files ?? []);
                      setForm((current) => ({ ...current, files: chosen }));
                      event.target.value = "";
                    }}
                  />
                </label>
              </>
            )}
          </>
        ) : step === "pick" ? (
          <>
            <label className={`bk-drop${files.length ? " sm" : ""}`}>
              <ClipIcon size={files.length ? 18 : 30} />
              <b>
                {files.length ? "ファイルを追加" : "スクショ・PDF・写真を選ぶ"}
              </b>
              {!files.length && (
                <>
                  <small>
                    予約確認のメールや画面のスクショ、eチケットのPDFをまとめて
                  </small>
                  <span className="bk-types">
                    <span>画像</span>
                    <span>PDF</span>
                    <span>写真</span>
                  </span>
                </>
              )}
              <input
                type="file"
                multiple
                accept="image/*,application/pdf,.heic,.heif"
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
            </label>
            {files.length > 0 ? (
              <div className="bk-files">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`}>
                    <span className="bk-th">{fileBadge(file)}</span>
                    <span>
                      <b>{file.name}</b>
                      <small>
                        {fileType(file) === "application/pdf" ? "PDF" : "画像"}{" "}
                        · {fileSize(file)}
                      </small>
                    </span>
                    <button
                      type="button"
                      aria-label={`${file.name}を外す`}
                      onClick={() =>
                        setFiles(files.filter((_, at) => at !== index))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {isDemo && (
                  <button
                    type="button"
                    className="bk-try"
                    onClick={() =>
                      void exampleFiles().then((examples) => {
                        setFiles(examples);
                        requestAnimationFrame(() =>
                          body.current
                            ?.querySelectorAll(".bk-files > div")
                            .forEach((element, index) =>
                              spring(
                                element,
                                [
                                  { transform: "translateY(12px)", opacity: 0 },
                                  { transform: "none", opacity: 1 },
                                ],
                                "split",
                                { delay: index * 70, fill: "backwards" },
                              ),
                            ),
                        );
                      })
                    }
                  >
                    例のファイル3つで試す
                  </button>
                )}
                <button type="button" className="bk-swap" onClick={swap}>
                  書類がないときは <b>手で入力する</b>
                </button>
              </>
            )}
          </>
        ) : step === "run" ? (
          <>
            <div className="bk-phase">
              <div className="bk-phase-head">
                <b>{rows.length ? "予約ごとに整理中" : "書類を読み取り中"}</b>
                <span>
                  {Math.floor(seconds / 60)}:
                  {String(seconds % 60).padStart(2, "0")}
                </span>
              </div>
              <div className="bk-bar" aria-hidden="true">
                <i />
              </div>
              <small>
                {files.length}ファイルから {rows.length}件 読み取り済み
              </small>
            </div>
            {rows.map((entry) => importRow(entry, false))}
            {Array.from({ length: rows.length ? 1 : 3 }, (_, index) => (
              <div className="bk-irow skel" key={`skel-${index}`} />
            ))}
          </>
        ) : (
          <>
            {needs.length > 0 && (
              <>
                <div className="bk-rvh">
                  <b>要確認</b>
                  <span>{needs.length}件 · 押して決める</span>
                </div>
                {needs.map((entry) => importRow(entry, true))}
              </>
            )}
            {ready.length > 0 && (
              <>
                <div className="bk-rvh">
                  <b>入れる予約</b>
                  <span>押すと直せます</span>
                </div>
                {ready.map((entry) => importRow(entry, true))}
              </>
            )}
            {duplicates.length > 0 && (
              <>
                <div className="bk-rvh">
                  <b>入れないもの</b>
                  <span>登録済み</span>
                </div>
                {duplicates.map((entry) => importRow(entry, true))}
              </>
            )}
            {!rows.length && (
              <p className="muted">
                書類から予約を読み取れませんでした。別のファイルを選ぶか、手で入力してください。
              </p>
            )}
          </>
        )}
      </div>
      {editingRow && (
        <BookingEditor
          booking={editingRow.input ?? importedBookingInput(editingRow.row)}
          onClose={() => setEditing(null)}
          onDraft={(input) =>
            setRows((current) =>
              current.map((item) =>
                item.key === editingRow.key
                  ? { ...item, input, fixed: true }
                  : item,
              ),
            )
          }
        />
      )}
      <ThumbDock
        mode="context"
        target={() => layer.current}
        disabled={Boolean(leaving)}
      >
        {step === "run" && !manual ? (
          <DockGroup slot="r">
            <button type="button" onClick={stop}>
              取り込みを中止
            </button>
          </DockGroup>
        ) : (
          <>
            {cancel}
            {manual
              ? ink(
                  <>
                    <CheckIcon size={22} />
                    追加する
                  </>,
                  saveManual,
                )
              : step === "review"
                ? ink(
                    <>
                      <CheckIcon size={22} />
                      {adding}件を入れる
                    </>,
                    save,
                    !adding,
                  )
                : ink("読み取る", () => void read(), !files.length)}
          </>
        )}
      </ThumbDock>
    </dialog>,
    document.body,
  );
}
